import Foundation
import Combine
import CoreGraphics
import simd
import IndooroNavigation
import IndooroPositioning

/// Vorschlag „Bist du bei <title>?“ fuer den aktiven Stopp (Ankunftserkennung, siehe ArrivalSuggestionDetector).
struct ArrivalSuggestion: Equatable {
    let stopID: String
    let title: String
}

/// Einziger Besitzer von Plan, aktivem Stopp, aktiver Route und Fortschritt (design.md D1).
/// Die Logik liegt in `NavigationSessionCore` (testbar im Package); diese Huelle veroeffentlicht den
/// Zustand fuer SwiftUI und abonniert `BeaconManager` (projizierte Position, Konfidenz, Kalibrierung,
/// Zielwuensche, Layoutwechsel) mit genau einem Satz Combine-Abonnements.
@MainActor
final class NavigationSession: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var mode: NavigationSessionMode = .idle
    @Published private(set) var plan: [NavigationStop] = []
    @Published private(set) var activeStopID: String?
    @Published private(set) var navigationRoute: NavigationRoute = .empty
    /// Nur der Rest der Route (vom Fortschrittspunkt bis zum Ziel); die Karte zeichnet diese Polylinie.
    @Published private(set) var remainingRoute: NavigationRoute = .empty
    @Published private(set) var routeProgress: Float = 0
    @Published private(set) var remainingRouteLength: Float = 0
    @Published private(set) var isLowConfidence = false
    @Published private(set) var statusMessage: String?
    /// Kartenpunkt des aktiven Stopps (Zielmarker im Einzelziel-Modus).
    @Published private(set) var targetPosition: CGPoint?
    /// Herkunft des Routenursprungs (Position, Eingang oder erledigter Stopp).
    @Published private(set) var routeOriginKind: NavigationRouteOriginKind = .position
    /// Zaehler fuer Tests und Replay-Auswertung (Section 10.1/10.2).
    @Published private(set) var routeBuildCount = 0
    @Published private(set) var rerouteCount = 0
    @Published private(set) var stopChangeWithoutEventCount = 0
    @Published private(set) var manualPositionCount = 0
    /// Offener Ankunftsvorschlag (nur waehrend einer Tour am aktiven Stopp); nie automatisch erledigt.
    @Published private(set) var arrivalSuggestion: ArrivalSuggestion?
    /// Zaehler der Ankunftsvorschlaege fuer die Studie (Anzeige, „Ja, erledigt“, „Noch nicht“).
    @Published private(set) var arrivalSuggestionShownCount = 0
    @Published private(set) var arrivalSuggestionAcceptedCount = 0
    @Published private(set) var arrivalSuggestionRejectedCount = 0

    /// Ob „Mit Ortung“ aktiv ist. Wird in `attach(to:)` gesetzt; ohne Verbindung gilt „aus“.
    var isArrivalPositioningEnabled: () -> Bool = { false }

    /// Name aus der alten Schnittstelle; Views binden weiter daran.
    var navigationStatusMessage: String? { statusMessage }

    var remainingRoutePolyline: [SIMD2<Float>] { core.remainingRoutePolyline }

    private var core = NavigationSessionCore()
    private var arrivalDetector: ArrivalSuggestionDetector
    /// Zeitstempel des letzten Positionsticks (gleiche Uhr wie der Detektor), fuer „Noch nicht“.
    private var lastTickTimestamp: TimeInterval = 0
    private weak var beaconManager: BeaconManager?
    private var cancellables = Set<AnyCancellable>()
    /// Snapshot-Modus (Schalter `AppEnvironment.isShadowPositioningEnabled`): Positionsticks kommen aus dem
    /// `PositionSnapshot`-Strom der Engine statt aus `BeaconManager.navigationSamples`.
    private var snapshotTask: Task<Void, Never>?
    private var usesSnapshotStream = false
    private var snapshotPosition: SIMD2<Float>?
    private var snapshotTrusted = false

    init(arrivalConfig: ArrivalSuggestionConfig = NavigationSession.arrivalSuggestionConfig()) {
        arrivalDetector = ArrivalSuggestionDetector(config: arrivalConfig)
    }

    /// Standardwerte der Ankunftserkennung, mit optionalem Feldtuning aus AppEnvironment (nur DEBUG).
    nonisolated static func arrivalSuggestionConfig(tuning: AppEnvironment.ArrivalSuggestionTuning = AppEnvironment.arrivalSuggestionTuning) -> ArrivalSuggestionConfig {
        let base = ArrivalSuggestionConfig.defaults()
        return ArrivalSuggestionConfig(
            radiusMeters: tuning.radiusMeters.map { Float($0) } ?? base.radiusMeters,
            dwellSeconds: tuning.dwellSeconds ?? base.dwellSeconds,
            suppressionSeconds: base.suppressionSeconds
        )
    }

    // MARK: - Verbindung zu BeaconManager (7.8)

    func attach(to beaconManager: BeaconManager) {
        guard self.beaconManager !== beaconManager else { return }
        self.beaconManager = beaconManager
        cancellables.removeAll()
        snapshotTask?.cancel()
        snapshotTask = nil
        usesSnapshotStream = false
        isArrivalPositioningEnabled = { [weak beaconManager] in beaconManager?.trackingMode == .beacon }

        core.layoutChanged(graph: beaconManager.navigationGraph, entrance: entranceOfLayout())
        publish()

        if let snapshots = beaconManager.positionSnapshots() {
            usesSnapshotStream = true
            snapshotTask = Task { [weak self] in
                var adapter = SnapshotTickAdapter()
                for await snapshot in snapshots {
                    self?.handle(snapshot: snapshot, adapter: &adapter)
                }
            }
        } else {
            beaconManager.navigationSamples
                .receive(on: DispatchQueue.main)
                .sink { [weak self] sample in
                    MainActor.assumeIsolated { self?.handle(sample) }
                }
                .store(in: &cancellables)
        }

        beaconManager.manualCalibrations
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                MainActor.assumeIsolated { self?.manualCalibration(at: SIMD2<Float>(event.mapPoint)) }
            }
            .store(in: &cancellables)

        beaconManager.navigationTargetRequests
            .receive(on: DispatchQueue.main)
            .sink { [weak self] request in
                MainActor.assumeIsolated {
                    switch request {
                    case .set(let point):
                        self?.setSingleTarget(point)
                    case .clear:
                        self?.clearTarget()
                    }
                }
            }
            .store(in: &cancellables)

        beaconManager.$layoutRevision
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                MainActor.assumeIsolated { self?.layoutChanged() }
            }
            .store(in: &cancellables)
    }

    // MARK: - Ereignisse (design.md D1)

    func startTour(plan: [NavigationStop]) {
        #if DEBUG
        NavigationRecorder.shared.recordEvent(.startTour, plan: plan)
        #endif
        seedPosition()
        core.startTour(plan: plan)
        publish()
    }

    func setSingleTarget(_ point: CGPoint) {
        setSingleTarget(SIMD2<Float>(Float(point.x), Float(point.y)))
    }

    func setSingleTarget(_ point: SIMD2<Float>) {
        #if DEBUG
        NavigationRecorder.shared.recordEvent(.setTarget, x: point.x, y: point.y)
        #endif
        seedPosition()
        core.setSingleTarget(point)
        publish()
    }

    func stopCompleted() {
        #if DEBUG
        NavigationRecorder.shared.recordEvent(.stopDone)
        #endif
        seedPosition()
        clearArrivalSuggestion()
        core.stopCompleted()
        publish()
    }

    func stopSkipped() {
        #if DEBUG
        NavigationRecorder.shared.recordEvent(.stopSkipped)
        #endif
        seedPosition()
        clearArrivalSuggestion()
        core.stopSkipped()
        publish()
    }

    /// „Ja, erledigt“: zaehlt als akzeptiert und gibt den bestaetigten Vorschlag zurueck. Erledigt wird
    /// der Stopp NICHT hier, sondern der Aufrufer fuehrt den bestehenden Pfad aus
    /// (`ShoppingSessionManager.markCurrentStopDone` -> `stopCompleted`). Ohne Vorschlag: nil.
    @discardableResult
    func acceptArrivalSuggestion() -> ArrivalSuggestion? {
        guard let suggestion = arrivalSuggestion else { return nil }
        arrivalDetector.accept()
        arrivalSuggestion = nil
        publish()
        return suggestion
    }

    /// „Noch nicht“: zaehlt als abgelehnt und unterdrueckt Vorschlaege fuer diesen Stopp (30 s).
    func rejectArrivalSuggestion() {
        guard arrivalSuggestion != nil else { return }
        arrivalDetector.reject(at: lastTickTimestamp)
        arrivalSuggestion = nil
        publish()
    }

    func listChanged(plan: [NavigationStop]) {
        #if DEBUG
        NavigationRecorder.shared.recordEvent(.listChanged, plan: plan)
        #endif
        seedPosition()
        core.listChanged(plan: plan)
        publish()
    }

    func routeModeToggled(plan: [NavigationStop]) {
        #if DEBUG
        NavigationRecorder.shared.recordEvent(.routeModeToggled, plan: plan)
        #endif
        seedPosition()
        core.routeModeToggled(plan: plan)
        publish()
    }

    func replanRequested(plan: [NavigationStop]) {
        #if DEBUG
        NavigationRecorder.shared.recordEvent(.replan, plan: plan)
        #endif
        seedPosition()
        core.replanRequested(plan: plan)
        publish()
    }

    func layoutChanged(plan: [NavigationStop]? = nil) {
        seedPosition()
        core.layoutChanged(graph: beaconManager?.navigationGraph, entrance: entranceOfLayout(), plan: plan)
        publish()
    }

    func manualCalibration(at projected: SIMD2<Float>) {
        core.manualCalibration(at: projected)
        publish()
    }

    func stopTour() {
        #if DEBUG
        NavigationRecorder.shared.recordEvent(.stopTour)
        #endif
        clearArrivalSuggestion()
        core.stopTour()
        publish()
    }

    func clearTarget() {
        #if DEBUG
        NavigationRecorder.shared.recordEvent(.clearTarget)
        #endif
        core.clearTarget()
        publish()
    }

    // MARK: - Intern

    /// Ein Positionstick. Intern (nicht privat), damit Tests Ticks einspielen koennen.
    func handle(_ sample: NavigationSample) {
        core.tickUpdated(
            projected: sample.projectedPosition,
            confidence: sample.confidence,
            at: sample.timestamp,
            trusted: sample.isTrusted
        )
        lastTickTimestamp = sample.timestamp
        updateArrivalSuggestion(with: sample)
        publish()
    }

    /// Ein Snapshot der Engine: Ticks wie bisher, Kalibrierung nur als Merker (das Ereignis kommt von `BeaconManager`).
    private func handle(snapshot: PositionSnapshot, adapter: inout SnapshotTickAdapter) {
        switch adapter.consume(snapshot) {
        case .tick(let tick)?:
            if let point = tick.projectedPosition { snapshotPosition = point }
            snapshotTrusted = snapshot.isTrusted
            handle(NavigationSample(
                projectedPosition: tick.projectedPosition,
                confidence: tick.confidence,
                timestamp: tick.timestamp,
                isTrusted: tick.isTrusted
            ))
        case .calibrated(let point)?:
            snapshotPosition = point
            snapshotTrusted = true
        case nil:
            break
        }
    }

    /// Speist den Detektor mit dem aktiven Stopp der Tour (nach dem Tick, damit der Stopp aktuell ist).
    private func updateArrivalSuggestion(with sample: NavigationSample) {
        let tourStop = core.mode == .tour ? core.activeStop : nil
        let event = arrivalDetector.update(
            position: sample.projectedPosition,
            trusted: sample.isTrusted,
            positioningEnabled: isArrivalPositioningEnabled(),
            activeStopID: tourStop?.id,
            stopPoint: tourStop?.mapPoint,
            at: sample.timestamp
        )
        switch event {
        case .shown(let stopID)?:
            arrivalSuggestion = ArrivalSuggestion(stopID: stopID, title: tourStop?.title ?? "")
        case .withdrawn?:
            arrivalSuggestion = nil
        case nil:
            break
        }
    }

    /// Verwirft Vorschlag und Dwell-Lauf; Zaehler bleiben erhalten.
    private func clearArrivalSuggestion() {
        arrivalDetector.reset()
        arrivalSuggestion = nil
    }

    private func seedPosition() {
        if usesSnapshotStream {
            if let snapshotPosition { core.seedPosition(snapshotPosition, trusted: snapshotTrusted) }
            return
        }
        guard let position = beaconManager?.userPosition else { return }
        core.seedPosition(
            SIMD2<Float>(Float(position.x), Float(position.y)),
            trusted: beaconManager?.isPositionTrusted ?? false
        )
    }

    /// Eingang des aktuellen Layouts (Layout-Elemente ohne Beacons; `shelves` enthaelt auch Eingaenge).
    private func entranceOfLayout() -> SIMD2<Float>? {
        IndoorGraph.entrancePoint(in: beaconManager?.shelves ?? [])
    }

    private func publish() {
        assign(\.mode, core.mode)
        assign(\.plan, core.plan)
        assign(\.activeStopID, core.activeStopID)
        assign(\.isLowConfidence, core.isLowConfidence)
        assign(\.statusMessage, core.statusMessage)
        assign(\.routeProgress, core.routeProgress)
        assign(\.remainingRouteLength, core.remainingRouteLength)

        let route = core.activeRoute.map { NavigationRoute(points: $0.points) } ?? .empty
        assign(\.navigationRoute, route)
        assign(\.remainingRoute, NavigationRoute(points: core.remainingRoutePolyline))

        let target = core.activeStop.map { CGPoint(x: CGFloat($0.mapPoint.x), y: CGFloat($0.mapPoint.y)) }
        assign(\.targetPosition, target)

        assign(\.routeOriginKind, core.routeOriginKind)
        assign(\.routeBuildCount, core.routeBuildCount)
        assign(\.rerouteCount, core.rerouteCount)
        assign(\.stopChangeWithoutEventCount, core.stopChangeWithoutEventCount)
        assign(\.manualPositionCount, core.manualPositionCount)

        // Ein Vorschlag gilt nur, solange genau dieser Stopp in einer Tour aktiv ist.
        if let suggestion = arrivalSuggestion, core.mode != .tour || suggestion.stopID != core.activeStopID {
            arrivalSuggestion = nil
        }
        assign(\.arrivalSuggestionShownCount, arrivalDetector.counters.shown)
        assign(\.arrivalSuggestionAcceptedCount, arrivalDetector.counters.accepted)
        assign(\.arrivalSuggestionRejectedCount, arrivalDetector.counters.rejected)
    }

    private func assign<Value: Equatable>(_ keyPath: ReferenceWritableKeyPath<NavigationSession, Value>, _ value: Value) {
        if self[keyPath: keyPath] != value {
            self[keyPath: keyPath] = value
        }
    }
}
