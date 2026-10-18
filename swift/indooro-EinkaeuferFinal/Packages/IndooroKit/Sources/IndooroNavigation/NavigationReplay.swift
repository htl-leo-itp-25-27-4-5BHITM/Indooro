import IndooroModels
import Foundation
import CoreGraphics
import simd

// MARK: - Aufzeichnungsformat (JSON Lines, design.md D11)

/// Ein Stopp eines aufgezeichneten Plans.
public struct RecordedStop: Codable, Equatable {
    var id: String
    var title: String
    var x: Float
    var y: Float

    public init(id: String, title: String, x: Float, y: Float) {
        self.id = id
        self.title = title
        self.x = x
        self.y = y
    }

    public init(_ stop: NavigationStop) {
        self.init(id: stop.id, title: stop.title, x: stop.mapPoint.x, y: stop.mapPoint.y)
    }

    var navigationStop: NavigationStop {
        NavigationStop(id: id, title: title, mapPoint: SIMD2(x, y))
    }
}

public enum MeasurementSourceKind: String, Codable, Equatable {
    case rssi
    case ranging
}

/// Rohmessung: RSSI-Sample (CoreBluetooth) oder Ranging-Callback (CoreLocation) eines Layout-Beacons.
public struct MeasurementRecord: Codable, Equatable {
    var t: TimeInterval
    var source: MeasurementSourceKind
    var beacon: String
    var rssi: Int
    var accuracy: Double?
    var proximity: BeaconProximityClass?
    var txPower: Float?

    public init(
        t: TimeInterval,
        source: MeasurementSourceKind,
        beacon: String,
        rssi: Int,
        accuracy: Double? = nil,
        proximity: BeaconProximityClass? = nil,
        txPower: Float? = nil
    ) {
        self.t = t
        self.source = source
        self.beacon = beacon
        self.rssi = rssi
        self.accuracy = accuracy
        self.proximity = proximity
        self.txPower = txPower
    }
}

public struct LayoutRecord: Codable, Equatable {
    var t: TimeInterval
    var layoutId: String?
    var revision: Int
    var shopName: String?

    public init(t: TimeInterval, layoutId: String? = nil, revision: Int, shopName: String? = nil) {
        self.t = t
        self.layoutId = layoutId
        self.revision = revision
        self.shopName = shopName
    }
}

public enum NavigationEventKind: String, Codable, Equatable {
    case startTour
    case stopDone
    case stopSkipped
    case listChanged
    case replan
    case routeModeToggled
    case calibrate
    case stopTour
    case setTarget
    case clearTarget
}

public struct EventRecord: Codable, Equatable {
    var t: TimeInterval
    var kind: NavigationEventKind
    /// Plan, wie ihn die App an die Session gegeben hat (Reihenfolge der App).
    var plan: [RecordedStop]?
    /// `calibrate` und `setTarget`: Kartenpunkt.
    var x: Float?
    var y: Float?
    /// `true`: Replay ordnet `plan` mit `TourPlanner` ab der aktuellen Position neu
    /// (synthetische Fixtures); die App schreibt es nie.
    var optimize: Bool?

    public init(
        t: TimeInterval,
        kind: NavigationEventKind,
        plan: [RecordedStop]? = nil,
        x: Float? = nil,
        y: Float? = nil,
        optimize: Bool? = nil
    ) {
        self.t = t
        self.kind = kind
        self.plan = plan
        self.x = x
        self.y = y
        self.optimize = optimize
    }
}

/// Bodenwahrheit (Long-Press auf der Karte im Debug-Modus).
public struct TruthRecord: Codable, Equatable {
    var t: TimeInterval
    var x: Float
    var y: Float

    public init(t: TimeInterval, x: Float, y: Float) {
        self.t = t
        self.x = x
        self.y = y
    }
}

/// Schrittzaehler (CMPedometer). `steps` ist kumulativ seit Aufzeichnungsstart.
public struct StepRecord: Codable, Equatable {
    var t: TimeInterval
    var steps: Int
    /// Meter (kumulativ, sofern vom Schrittzaehler geliefert).
    var distance: Double?
    var source: String // "pedometer"

    public init(t: TimeInterval, steps: Int, distance: Double? = nil, source: String) {
        self.t = t
        self.steps = steps
        self.distance = distance
        self.source = source
    }
}

/// Kompasspeilung (CLHeading).
public struct HeadingRecord: Codable, Equatable {
    var t: TimeInterval
    /// Kompasspeilung 0-360, true north wenn verfuegbar.
    var degrees: Double
    /// Grad, >= 0.
    var accuracy: Double
    var source: String // "compass"

    public init(t: TimeInterval, degrees: Double, accuracy: Double, source: String) {
        self.t = t
        self.degrees = degrees
        self.accuracy = accuracy
        self.source = source
    }
}

/// Eine Zeile der Aufzeichnung: `{"type":"measurement"|"layout"|"event"|"truth"|"step"|"heading", ...}`.
public enum NavigationRecordLine: Codable, Equatable {
    case measurement(MeasurementRecord)
    case layout(LayoutRecord)
    case event(EventRecord)
    case truth(TruthRecord)
    case step(StepRecord)
    case heading(HeadingRecord)

    private enum TypeKey: String, CodingKey { case type }
    private enum LineType: String, Codable { case measurement, layout, event, truth, step, heading }

    /// Nur der Typ einer Zeile; unbekannte Typen werden beim Parsen uebersprungen.
    private struct TypeOnly: Decodable {
        let type: String
    }

    var timestamp: TimeInterval {
        switch self {
        case .measurement(let record): return record.t
        case .layout(let record): return record.t
        case .event(let record): return record.t
        case .truth(let record): return record.t
        case .step(let record): return record.t
        case .heading(let record): return record.t
        }
    }

    public init(from decoder: Decoder) throws {
        let type = try decoder.container(keyedBy: TypeKey.self).decode(LineType.self, forKey: .type)
        switch type {
        case .measurement: self = .measurement(try MeasurementRecord(from: decoder))
        case .layout: self = .layout(try LayoutRecord(from: decoder))
        case .event: self = .event(try EventRecord(from: decoder))
        case .truth: self = .truth(try TruthRecord(from: decoder))
        case .step: self = .step(try StepRecord(from: decoder))
        case .heading: self = .heading(try HeadingRecord(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: TypeKey.self)
        switch self {
        case .measurement(let record):
            try container.encode(LineType.measurement, forKey: .type)
            try record.encode(to: encoder)
        case .layout(let record):
            try container.encode(LineType.layout, forKey: .type)
            try record.encode(to: encoder)
        case .event(let record):
            try container.encode(LineType.event, forKey: .type)
            try record.encode(to: encoder)
        case .truth(let record):
            try container.encode(LineType.truth, forKey: .type)
            try record.encode(to: encoder)
        case .step(let record):
            try container.encode(LineType.step, forKey: .type)
            try record.encode(to: encoder)
        case .heading(let record):
            try container.encode(LineType.heading, forKey: .type)
            try record.encode(to: encoder)
        }
    }

    // MARK: JSON Lines

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    /// Eine JSON-Zeile ohne Zeilenumbruch.
    public func jsonLine() throws -> String {
        String(decoding: try Self.encoder.encode(self), as: UTF8.self)
    }

    /// Zeilen mit unbekanntem `type` werden uebersprungen (Aufnahmen neuerer Builds bleiben lesbar);
    /// ungueltiges JSON und bekannte Typen mit kaputten Feldern werfen.
    static func parse(jsonl: String) throws -> [NavigationRecordLine] {
        let decoder = JSONDecoder()
        return try jsonl
            .split(whereSeparator: \.isNewline)
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .compactMap { text -> NavigationRecordLine? in
                let data = Data(text.utf8)
                let typeName = try decoder.decode(TypeOnly.self, from: data).type
                guard LineType(rawValue: typeName) != nil else { return nil }
                return try decoder.decode(NavigationRecordLine.self, from: data)
            }
    }

    static func jsonl(_ lines: [NavigationRecordLine]) throws -> String {
        try lines.map { try $0.jsonLine() }.joined(separator: "\n") + "\n"
    }
}

// MARK: - Feld-Export (Tick-CSV)

extension NavigationReplay {
    static let csvHeader = "t,truth_x,truth_y,est_x,est_y,proj_x,proj_y,confidence,beacons_used,route_rebuild,stop_change"

    /// CSV je Tick mit Header `csvHeader`: Dezimalpunkt, 3 Nachkommastellen, leeres Feld fuer `nil`,
    /// `route_rebuild`/`stop_change` als 0/1. Endet mit Zeilenumbruch.
    static func csv(ticks: [ReplayTick]) -> String {
        var lines = [csvHeader]
        lines.reserveCapacity(ticks.count + 1)
        for tick in ticks {
            let fields: [String] = [
                csvField(tick.t),
                csvField(tick.truth?.x), csvField(tick.truth?.y),
                csvField(tick.solved?.x), csvField(tick.solved?.y),
                csvField(tick.projected?.x), csvField(tick.projected?.y),
                csvField(tick.confidence),
                String(tick.beaconsUsed),
                tick.routeRebuild ? "1" : "0",
                tick.stopChange ? "1" : "0",
            ]
            lines.append(fields.joined(separator: ","))
        }
        return lines.joined(separator: "\n") + "\n"
    }

    private static func csvField<T: BinaryFloatingPoint>(_ value: T?) -> String {
        guard let value else { return "" }
        return String(format: "%.3f", Double(value))
    }
}

// MARK: - Replay

/// Kennzahlen eines Replays. Alle Felder ausser `planningSeconds` (Wandzeit) sind deterministisch;
/// die Gleichheit ignoriert deshalb `planningSeconds`.
struct ReplayMetrics: Equatable {
    var tickCount = 0
    var durationSeconds: TimeInterval = 0
    /// Neu gebaute Routen durch die Off-Route-Regel (Routenbau mit bestehender Route, ausserhalb von Ereignissen).
    var rerouteCount = 0
    var reroutesPerMinute: Double = 0
    /// Wechsel des aktiven Stopps bei Positionsupdates (ohne dass ein Ereignis ihn ausgeloest hat).
    var activeStopChangesWithoutEvent = 0
    /// Schritte der projizierten Position zwischen zwei Positionen, die groesser als das Gate des Schaetzers
    /// (`maxPlausibleSpeed * dt + jumpMargin`) sind; nicht gezaehlt direkt nach Kalibrierung.
    var projectedJumps = 0
    /// Groesster Schritt der projizierten Position zwischen zwei Positionen (Meter), ohne Kalibrierungsschritte.
    var maxProjectedStepMeters: Double = 0
    /// Abstand projizierte Position zur Bodenwahrheit am ersten Tick nach einem `truth`-Marker (Meter).
    var meanLagMeters: Double?
    var p95LagMeters: Double?
    /// Sekunden von der Wahrheit „ausserhalb der Route“ (> `offRouteDistance`) bis zum Reroute.
    var offRouteDetectionDelays: [Double] = []
    var lowConfidenceToggles = 0
    /// Wandzeit der Planung je Planungsereignis (Sekunden); nicht deterministisch.
    var planningSeconds: [Double] = []
    /// Gebaute Routen insgesamt (Start, Ereignisse, Ursprungswechsel, Off-Route); nur Diagnose, nicht Teil der Gleichheit.
    var routeBuildCount = 0

    static func == (lhs: ReplayMetrics, rhs: ReplayMetrics) -> Bool {
        lhs.tickCount == rhs.tickCount
            && lhs.durationSeconds == rhs.durationSeconds
            && lhs.rerouteCount == rhs.rerouteCount
            && lhs.reroutesPerMinute == rhs.reroutesPerMinute
            && lhs.activeStopChangesWithoutEvent == rhs.activeStopChangesWithoutEvent
            && lhs.projectedJumps == rhs.projectedJumps
            && lhs.maxProjectedStepMeters == rhs.maxProjectedStepMeters
            && lhs.meanLagMeters == rhs.meanLagMeters
            && lhs.p95LagMeters == rhs.p95LagMeters
            && lhs.offRouteDetectionDelays == rhs.offRouteDetectionDelays
            && lhs.lowConfidenceToggles == rhs.lowConfidenceToggles
    }
}

/// Ein Tick des Replays fuer den Feld-Export (`NavigationReplay.csv`). Nur Beobachtung, keine Metrik.
struct ReplayTick: Equatable {
    /// Tickzeitpunkt (Aufzeichnungszeit).
    var t: TimeInterval
    /// Letzter Bodenwahrheits-Marker, sofern er im selben Raster wie die Off-Route-Pruefung liegt (sonst `nil`).
    var truth: SIMD2<Float>?
    /// Vom Solver geloester Rohpunkt (`PositioningTick.solvedPoint`).
    var solved: SIMD2<Float>?
    /// Projizierte Position (`PositioningTick.projectedPoint`).
    var projected: SIMD2<Float>?
    var confidence: Float
    /// Frische Messungen zur Tick-Zeit (Eingang des Solvers, `BeaconMeasurementStore.activeMeasurements`).
    var beaconsUsed: Int
    /// `core.routeBuildCount` hat sich in diesem Tick erhoeht.
    var routeRebuild: Bool
    /// `core.activeStopID` hat sich in diesem Tick geaendert.
    var stopChange: Bool
}

/// Spielt eine Aufzeichnung durch dieselbe Kette wie die App: `PositioningPipeline`
/// (Messspeicher -> Solver -> Schaetzer -> Projektion) und `NavigationSessionCore` (+ `TourPlanner`).
/// Die virtuelle Uhr tickt alle `updateIntervalSeconds` ab der ersten Zeile.
public enum NavigationReplay {
    /// `entrance`: Eingangspunkt fuer den Routenstart ohne vertraute Position (Default nil = kein Eingang).
    static func run(
        recording: [NavigationRecordLine],
        layout: LayoutData,
        config: StabilizedNavigationConfig = .default,
        entrance: SIMD2<Float>? = nil,
        onTick: ((ReplayTick) -> Void)? = nil
    ) -> ReplayMetrics {
        // Ohne motionAided werden Bewegungszeilen vor dem Sortieren entfernt: sie duerfen weder Tickraster
        // noch Dauer beeinflussen. Mit Flag bleiben sie in der Zeitleiste und speisen den Tracker.
        let timeline = recording.filter { line in
            switch line {
            case .step, .heading: return config.motion.motionAided
            case .measurement, .layout, .event, .truth: return true
            }
        }
        var replay = Replay(layout: layout, config: config, entrance: entrance, onTick: onTick)
        return replay.run(timeline.enumerated().sorted {
            $0.element.timestamp == $1.element.timestamp ? $0.offset < $1.offset : $0.element.timestamp < $1.element.timestamp
        }.map(\.element))
    }

    /// Beacons des Layouts wie in `BeaconManager.buildBeacons`.
    static func layoutBeacons(_ layout: LayoutData) -> [(name: String, point: SIMD2<Float>)] {
        layout.elements.compactMap { element in
            guard element.type == "beacon", let name = element.beaconId else { return nil }
            return (name: name, point: SIMD2<Float>(Float(element.x), Float(element.y)))
        }
    }

    /// Begehbarer Graph wie in `BeaconManager.rebuildNavigationPipeline` (Regale ohne Beacons).
    static func makeGraph(_ layout: LayoutData) -> IndoorGraph {
        IndoorGraphBuilder.fromLayout(
            gridWidth: Int(layout.gridSize.width),
            gridHeight: Int(layout.gridSize.height),
            elements: layout.elements.filter { $0.type != "beacon" }
        )
    }

    private struct Replay {
        let config: StabilizedNavigationConfig
        let graph: IndoorGraph
        let store: BeaconMeasurementStore
        let pipeline: PositioningPipeline
        let beaconNames: [String]
        var core: NavigationSessionCore
        var samples = RSSISampleBuffer()
        var metrics = ReplayMetrics()

        var lastProjected: SIMD2<Float>?
        var lastProjectedTime: TimeInterval?
        var pendingTruth: [SIMD2<Float>] = []
        var latestTruth: (point: SIMD2<Float>, t: TimeInterval)?
        var truthOffRouteSince: TimeInterval?
        var suppressJumpCheck = false
        var lags: [Double] = []
        let onTick: ((ReplayTick) -> Void)?

        init(layout: LayoutData, config: StabilizedNavigationConfig, entrance: SIMD2<Float>?, onTick: ((ReplayTick) -> Void)?) {
            self.config = config
            self.onTick = onTick
            graph = NavigationReplay.makeGraph(layout)
            let beacons = NavigationReplay.layoutBeacons(layout)
            beaconNames = beacons.map(\.name)
            store = BeaconMeasurementStore(config: config.beacon)
            store.syncBeacons(beacons)
            pipeline = PositioningPipeline(
                store: store,
                graph: graph,
                bounds: CGRect(x: 0, y: 0, width: layout.gridSize.width, height: layout.gridSize.height),
                config: config
            )
            core = NavigationSessionCore(
                graph: graph,
                entrancePoint: entrance,
                routeConfig: config.route,
                confidenceConfig: config.confidence
            )
        }

        mutating func run(_ lines: [NavigationRecordLine]) -> ReplayMetrics {
            guard let first = lines.first, let last = lines.last else { return metrics }
            let interval = config.beacon.updateIntervalSeconds
            let start = first.timestamp
            var nextTick = start + interval
            var index = 0
            var lastLowConfidence = core.isLowConfidence

            while index < lines.count {
                // Alle Zeilen bis zum Tickzeitpunkt, dann der Tick (Callbacks liegen vor dem Timer).
                while index < lines.count, lines[index].timestamp <= nextTick {
                    apply(lines[index])
                    index += 1
                }
                tick(at: nextTick)
                if core.isLowConfidence != lastLowConfidence {
                    metrics.lowConfidenceToggles += 1
                    lastLowConfidence = core.isLowConfidence
                }
                nextTick += interval
            }

            metrics.routeBuildCount = core.routeBuildCount
            metrics.durationSeconds = max(0, last.timestamp - start)
            if metrics.durationSeconds > 0 {
                metrics.reroutesPerMinute = Double(metrics.rerouteCount) / (metrics.durationSeconds / 60)
            }
            if !lags.isEmpty {
                metrics.meanLagMeters = lags.reduce(0, +) / Double(lags.count)
                let sorted = lags.sorted()
                let rank = Int((0.95 * Double(sorted.count)).rounded(.up)) - 1
                metrics.p95LagMeters = sorted[max(0, min(sorted.count - 1, rank))]
            }
            return metrics
        }

        // MARK: Zeilen

        private mutating func apply(_ line: NavigationRecordLine) {
            switch line {
            case .measurement(let record):
                applyMeasurement(record)
            case .layout:
                // Ein Replay laeuft gegen genau ein Layout (Parameter); die Zeile dokumentiert nur die Identitaet.
                break
            case .truth(let record):
                let point = SIMD2<Float>(record.x, record.y)
                pendingTruth.append(point)
                latestTruth = (point, record.t)
            case .event(let record):
                apply(event: record)
            case .step(let record):
                pipeline.recordStep(cumulativeSteps: record.steps, at: record.t)
            case .heading(let record):
                pipeline.recordHeading(bearingDegrees: record.degrees, accuracy: record.accuracy, at: record.t)
            }
        }

        private mutating func applyMeasurement(_ record: MeasurementRecord) {
            switch record.source {
            case .rssi:
                guard record.rssi != 0, record.rssi != 127 else { return }
                samples.record(name: record.beacon, rssi: record.rssi, timestamp: record.t, txPower: record.txPower)
            case .ranging:
                let quality = PositioningPipeline.rangingQuality(
                    rssi: record.rssi,
                    accuracy: record.accuracy ?? 0,
                    proximity: record.proximity ?? .unknown,
                    config: config.beacon
                )
                store.recordRanging(
                    beaconName: record.beacon,
                    accuracy: record.accuracy ?? 0,
                    rssi: record.rssi,
                    quality: quality,
                    timestamp: record.t
                )
            }
        }

        // MARK: Ereignisse

        private mutating func apply(event: EventRecord) {
            if let seed = lastProjected {
                core.seedPosition(seed)
            }

            switch event.kind {
            case .startTour:
                core.startTour(plan: plannedStops(event))
            case .listChanged:
                core.listChanged(plan: plannedStops(event))
            case .routeModeToggled:
                core.routeModeToggled(plan: plannedStops(event))
            case .replan:
                core.replanRequested(plan: plannedStops(event))
            case .stopDone:
                core.stopCompleted()
            case .stopSkipped:
                core.stopSkipped()
            case .calibrate:
                guard let x = event.x, let y = event.y else { return }
                let effective = pipeline.calibrate(to: SIMD2(x, y), at: event.t)
                lastProjected = effective
                suppressJumpCheck = true
                core.manualCalibration(at: effective)
            case .stopTour:
                core.stopTour()
            case .setTarget:
                guard let x = event.x, let y = event.y else { return }
                core.setSingleTarget(SIMD2(x, y))
            case .clearTarget:
                core.clearTarget()
            }
        }

        /// Misst die Planung; mit `optimize` bestimmt `TourPlanner` die Reihenfolge, sonst gilt die aufgezeichnete.
        private mutating func plannedStops(_ event: EventRecord) -> [NavigationStop] {
            let recorded = (event.plan ?? []).map(\.navigationStop)
            let planStops = recorded.enumerated().map { offset, stop in
                TourPlanStop(id: stop.id, title: stop.title, mapPoint: stop.mapPoint, orderSeed: offset)
            }
            let start = lastProjected
            let clock = DispatchTime.now().uptimeNanoseconds
            let ordered = TourPlanner.order(
                stops: planStops,
                start: start,
                graph: graph,
                mode: .optimized,
                config: config.planning
            )
            metrics.planningSeconds.append(Double(DispatchTime.now().uptimeNanoseconds - clock) / 1_000_000_000)
            return event.optimize == true ? ordered.map(\.navigationStop) : recorded
        }

        // MARK: Tick

        private mutating func tick(at time: TimeInterval) {
            let result = pipeline.tick(beaconNames: beaconNames, samples: samples, at: time)
            samples.removeSamples()
            metrics.tickCount += 1
            // Reine Lesung nach dem Tick: dieselben frischen Messungen, die der Solver gesehen hat.
            let beaconsUsed = store.activeMeasurements(at: time).count

            let activeBefore = core.activeStopID
            let reroutesBefore = core.rerouteCount
            let buildsBefore = core.routeBuildCount
            core.tickUpdated(projected: result.projectedPoint, confidence: result.confidence, at: time)
            let routeRebuild = core.routeBuildCount > buildsBefore
            let stopChange = core.activeStopID != activeBefore

            if core.activeStopID != activeBefore {
                metrics.activeStopChangesWithoutEvent += 1
            }
            // Off-Route-Neubauten zaehlen; der Neubau von einer Fallback-Route auf die vertraute Position nicht.
            if core.rerouteCount > reroutesBefore {
                metrics.rerouteCount += 1
                if let since = truthOffRouteSince {
                    metrics.offRouteDetectionDelays.append(time - since)
                    truthOffRouteSince = nil
                }
            }

            if let projected = result.projectedPoint {
                if let previous = lastProjected, !suppressJumpCheck {
                    let step = simd_length(projected - previous)
                    let dt = Float(time - (lastProjectedTime ?? time))
                    metrics.maxProjectedStepMeters = max(metrics.maxProjectedStepMeters, Double(step))
                    if step > config.poseFusion.maxPlausibleSpeed * dt + config.poseFusion.jumpMargin {
                        metrics.projectedJumps += 1
                    }
                }
                suppressJumpCheck = false
                lastProjected = projected
                lastProjectedTime = time
                for truth in pendingTruth {
                    lags.append(Double(simd_length(projected - truth)))
                }
            }
            pendingTruth.removeAll()
            trackTruthOffRoute(at: time)

            var truth: SIMD2<Float>?
            if let latest = latestTruth, time - latest.t <= 2 * config.beacon.updateIntervalSeconds + 1e-6 {
                truth = latest.point
            }
            onTick?(ReplayTick(
                t: time,
                truth: truth,
                solved: result.solvedPoint,
                projected: result.projectedPoint,
                confidence: result.confidence,
                beaconsUsed: beaconsUsed,
                routeRebuild: routeRebuild,
                stopChange: stopChange
            ))
        }

        /// Beginn der Zeit, in der die Wahrheit weiter als `offRouteDistance` von der aktiven Route entfernt ist.
        private mutating func trackTruthOffRoute(at time: TimeInterval) {
            guard let route = core.activeRoute, let truth = latestTruth,
                  time - truth.t <= 2 * config.beacon.updateIntervalSeconds + 1e-6 else {
                truthOffRouteSince = nil
                return
            }
            let distance = route.closestPoint(to: truth.point, preferredArc: core.maxRouteProgress).distance
            if distance > config.route.offRouteDistanceMeters {
                if truthOffRouteSince == nil { truthOffRouteSince = truth.t }
            } else {
                truthOffRouteSince = nil
            }
        }
    }
}
