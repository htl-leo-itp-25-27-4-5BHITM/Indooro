import Foundation
import IndooroModels
import IndooroNavigation
import simd

/// Layout fuer die Ortung: der gemeinsame Graph-Snapshot und die Beacons des Layouts.
public struct PositioningLayout: Sendable {
    public let graph: LayoutGraphSnapshot
    public let beacons: BeaconCatalog

    public init(graph: LayoutGraphSnapshot, beacons: BeaconCatalog) {
        self.graph = graph
        self.beacons = beacons
    }

    /// Der begehbare Graph entsteht wie in `BeaconManager.rebuildNavigationPipeline` ohne die Beacon-Elemente.
    public init(layout: LayoutData, revision: Int) {
        self.init(
            graph: LayoutGraphSnapshot(
                revision: revision,
                gridWidth: Int(layout.gridSize.width),
                gridHeight: Int(layout.gridSize.height),
                elements: layout.elements.filter { $0.type != "beacon" }
            ),
            beacons: BeaconCatalog(elements: layout.elements)
        )
    }

    public var revision: Int { graph.revision }
}

/// Ortungs-Engine (design.md D3): nimmt Funk-Samples entgegen, ruft im Takt `updateIntervalSeconds`
/// genau `PositioningPipeline.tick` auf (Messspeicher, Solver, Schaetzer, Projektion; keine Neuimplementierung)
/// und veroeffentlicht das Ergebnis als `PositionSnapshot`. Verhalten wie `BeaconManager`: Aufwaermphase,
/// veraltete Beacons (Ablauf im Messspeicher), Konfidenzschwelle fuer Vertrauen, Sprung-Gate im Schaetzer,
/// manuelle Kalibrierung, Blickrichtung aus Kompass und Bewegung.
public actor PositioningEngine {
    /// Strom der Snapshots; genau ein Leser. Der Puffer behaelt die neuesten 64 Eintraege.
    public nonisolated let snapshots: AsyncStream<PositionSnapshot>

    private let continuation: AsyncStream<PositionSnapshot>.Continuation
    private let radio: any BeaconRadio
    private let headingProvider: (any HeadingProvider)?
    private let motionProvider: (any MotionProvider)?
    private let clock: any PositioningClock
    private let config: StabilizedNavigationConfig
    private let store: BeaconMeasurementStore

    private var layout: PositioningLayout?
    private var pipeline: PositioningPipeline?
    private var rssiSamples = RSSISampleBuffer()
    private var fusion = HeadingFusion()

    private var isTracking = false
    private var startedAt: TimeInterval = 0
    private var manualHold = false
    private var resetManualHoldOnNextTick = false
    private var calibrationRevision = 0
    private var lastCalibration: CalibrationEvent?
    private var sequence = 0
    private var radioStatus = RadioStatus()
    private var storeDetectionUUIDs: Set<UUID> = []
    private var lastDisplayed: SIMD2<Float>?
    private var lastRaw: SIMD2<Float>?
    private var tasks: [Task<Void, Never>] = []

    public private(set) var latestSnapshot: PositionSnapshot?

    public init(
        radio: any BeaconRadio,
        headingProvider: (any HeadingProvider)? = nil,
        motionProvider: (any MotionProvider)? = nil,
        clock: any PositioningClock = SystemPositioningClock(),
        config: StabilizedNavigationConfig = .default
    ) {
        let (stream, continuation) = AsyncStream<PositionSnapshot>.makeStream(bufferingPolicy: .bufferingNewest(64))
        snapshots = stream
        self.continuation = continuation
        self.radio = radio
        self.headingProvider = headingProvider
        self.motionProvider = motionProvider
        self.clock = clock
        self.config = config
        store = BeaconMeasurementStore(config: config.beacon)
    }

    deinit {
        continuation.finish()
    }

    // MARK: - Steuerung

    /// Startet die Ortung (Modus „Mit Beacons“). Ohne Layout laeuft nur die Aufwaermphase.
    public func start() async {
        guard !isTracking else { return }
        isTracking = true
        startedAt = clock.now()
        resetManualHoldOnNextTick = true

        let samples = radio.samples()
        let statuses = radio.status()
        tasks.append(Task { [weak self] in
            for await sample in samples { await self?.ingest(sample) }
        })
        tasks.append(Task { [weak self] in
            for await status in statuses { await self?.updateRadioStatus(status) }
        })
        if let headingProvider {
            let headings = headingProvider.headings()
            tasks.append(Task { [weak self] in
                for await heading in headings { await self?.ingest(heading) }
            })
        }
        if let motionProvider {
            let steps = motionProvider.steps()
            tasks.append(Task { [weak self] in
                for await step in steps { await self?.ingest(step) }
            })
        }
        let interval = config.beacon.updateIntervalSeconds
        let clock = clock
        tasks.append(Task { [weak self] in
            while !Task.isCancelled {
                do { try await clock.sleep(for: interval) } catch { return }
                guard let self else { return }
                await self.runTick()
            }
        })

        await radio.start(constraints: currentConstraints())
        await headingProvider?.start()
        await motionProvider?.start()
        emit(status: .warmingUp, timestamp: clock.now())
    }

    /// Beendet die Ortung (Modus „Ohne Ortung“): Messungen werden verworfen, nur eine manuelle Position bleibt vertraut.
    public func stop() async {
        guard isTracking else { return }
        isTracking = false
        for task in tasks { task.cancel() }
        tasks.removeAll()
        await radio.stop()
        await headingProvider?.stop()
        await motionProvider?.stop()
        clearMeasurements()
        emit(status: .stopped, timestamp: clock.now())
    }

    /// Neues Layout: Messspeicher, Pipeline und Ranging-Constraints werden neu aufgebaut.
    public func setLayout(_ newLayout: PositioningLayout) async {
        layout = newLayout
        store.syncBeacons(newLayout.beacons.anchors)
        clearMeasurements()
        pipeline = PositioningPipeline(
            store: store,
            graph: newLayout.graph.graph,
            bounds: newLayout.graph.bounds,
            config: config
        )
        if isTracking {
            await radio.start(constraints: currentConstraints())
        }
        emit(status: isTracking ? .warmingUp : .stopped, timestamp: clock.now())
    }

    /// UUIDs der Store-Erkennung (zusaetzlich zu den Layout-Beacons im Ranging).
    public func setStoreDetectionUUIDs(_ uuids: Set<UUID>) async {
        guard uuids != storeDetectionUUIDs else { return }
        storeDetectionUUIDs = uuids
        if isTracking {
            await radio.start(constraints: currentConstraints())
        }
    }

    /// Manuelle Kalibrierung auf `point` (wird auf den begehbaren Graphen projiziert).
    public func calibrate(to point: SIMD2<Float>) {
        let now = clock.now()
        let effective = pipeline?.calibrate(to: point, at: now) ?? point
        fusion.resetAfterCalibration(point: effective, timestamp: now)
        calibrationRevision += 1
        lastCalibration = CalibrationEvent(revision: calibrationRevision, point: effective, timestamp: now)
        manualHold = true
        lastDisplayed = effective
        lastRaw = effective
        emit(
            status: .manual,
            timestamp: now,
            displayedPoint: effective,
            rawPoint: effective,
            confidence: 1
        )
    }

    /// Kalibriert auf die zuletzt veroeffentlichte Position; ohne Position ohne Wirkung.
    public func calibrateAtCurrentEstimate() {
        guard let current = lastDisplayed ?? lastRaw else { return }
        calibrate(to: current)
    }

    // MARK: - Eingaenge

    func ingest(_ sample: BeaconSample) {
        guard isTracking, let catalog = layout?.beacons else { return }
        switch sample.source {
        case let .ranging(accuracy, proximity):
            guard let identity = sample.identity, let name = catalog.rangingName(for: identity) else { return }
            store.recordRanging(
                beaconName: name,
                accuracy: accuracy,
                rssi: sample.rssi,
                quality: PositioningPipeline.rangingQuality(
                    rssi: sample.rssi,
                    accuracy: accuracy,
                    proximity: proximity,
                    config: config.beacon
                ),
                timestamp: sample.timestamp
            )
        case let .advertisement(txPower):
            var name = sample.identity.flatMap { catalog.explicitName(for: $0) }
            if name == nil, let local = sample.localName, local.contains("Indooro") {
                name = local
            }
            guard let name else { return }
            rssiSamples.record(name: name, rssi: sample.rssi, timestamp: sample.timestamp, txPower: txPower)
        }
    }

    func ingest(_ heading: HeadingSample) {
        guard isTracking else { return }
        fusion.updateDevice(degrees: heading.degrees, accuracyDegrees: heading.accuracyDegrees)
        if heading.accuracyDegrees >= 0 {
            pipeline?.recordHeading(
                bearingDegrees: heading.degrees,
                accuracy: heading.accuracyDegrees,
                at: heading.timestamp
            )
        }
        fusion.refresh(movementHeading: fusion.lastMovement, movementHeadingIsFresh: false)
    }

    func ingest(_ step: StepSample) {
        guard isTracking else { return }
        pipeline?.recordStep(cumulativeSteps: step.cumulativeSteps, at: step.timestamp)
    }

    /// Zahl der Messungen, die jetzt als aktuell gelten (Diagnose und Tests).
    func activeMeasurementCount() -> Int {
        store.activeMeasurementCount(at: clock.now())
    }

    private func updateRadioStatus(_ status: RadioStatus) {
        radioStatus = status
    }

    // MARK: - Tick

    func runTick() {
        guard isTracking else { return }
        let now = clock.now()
        if now - startedAt < config.beacon.warmupSeconds {
            emit(status: .warmingUp, timestamp: now)
            return
        }
        guard let pipeline, let layout else {
            rssiSamples.removeSamples()
            emit(status: .searching, timestamp: now)
            return
        }

        let tick = pipeline.tick(beaconNames: layout.beacons.names, samples: rssiSamples, at: now)
        rssiSamples.removeSamples()
        publish(tick)
    }

    private func publish(_ tick: PositioningTick) {
        let isTrusted = tick.projectedPoint != nil && tick.confidence >= config.confidence.lowThreshold
        if resetManualHoldOnNextTick {
            resetManualHoldOnNextTick = false
            manualHold = false
        }
        if isTrusted {
            manualHold = false
        }

        if let solved = tick.solvedPoint {
            let movement = fusion.movementHeading(currentPoint: solved, timestamp: tick.timestamp)
            let reliable = movement ?? fusion.recentMovementHeading(at: tick.timestamp)
            fusion.refresh(movementHeading: reliable, movementHeadingIsFresh: movement != nil)
            lastRaw = solved
        }
        if let projected = tick.projectedPoint {
            lastDisplayed = projected
        }

        let status: PositionSnapshot.Status
        if isTrusted {
            status = .tracking
        } else if manualHold {
            status = .manual
        } else if tick.projectedPoint != nil {
            status = .lowConfidence
        } else {
            status = .searching
        }
        emit(
            status: status,
            timestamp: tick.timestamp,
            displayedPoint: tick.projectedPoint,
            rawPoint: tick.solvedPoint,
            confidence: tick.confidence,
            wasJumpSuppressed: tick.wasHeld
        )
    }

    // MARK: - Hilfen

    private func currentConstraints() -> [BeaconConstraint] {
        layout?.beacons.rangingConstraints(storeDetectionUUIDs: storeDetectionUUIDs)
            ?? BeaconCatalog(beacons: []).rangingConstraints(storeDetectionUUIDs: storeDetectionUUIDs)
    }

    private func clearMeasurements() {
        store.clearMeasurements()
        pipeline?.clearSolverSeed()
        rssiSamples.removeAll()
        fusion.clearHeadingState()
    }

    private func emit(
        status: PositionSnapshot.Status,
        timestamp: TimeInterval,
        displayedPoint: SIMD2<Float>? = nil,
        rawPoint: SIMD2<Float>? = nil,
        confidence: Float = 0,
        wasJumpSuppressed: Bool = false
    ) {
        sequence += 1
        let isTrusted = status == .tracking || manualHold
        let snapshot = PositionSnapshot(
            sequence: sequence,
            timestamp: timestamp,
            layoutRevision: layout?.revision ?? 0,
            status: status,
            displayedPoint: displayedPoint,
            rawPoint: rawPoint,
            headingRadians: fusion.published,
            isHeadingReliable: fusion.isReliable,
            confidence: confidence,
            isTrusted: isTrusted,
            activeBeaconCount: store.activeMeasurementCount(at: timestamp),
            wasJumpSuppressed: wasJumpSuppressed,
            lastCalibration: lastCalibration,
            radio: radioStatus
        )
        latestSnapshot = snapshot
        continuation.yield(snapshot)
    }
}
