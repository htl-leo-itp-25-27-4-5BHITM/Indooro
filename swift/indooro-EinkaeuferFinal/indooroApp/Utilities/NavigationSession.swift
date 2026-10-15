import Foundation
import Combine
import CoreGraphics
import simd

/// Einziger Besitzer von Plan, aktivem Stopp, aktiver Route und Fortschritt (design.md D1).
/// Die Logik liegt in `NavigationSessionCore` (testbar im Package); diese Huelle veroeffentlicht den
/// Zustand fuer SwiftUI und abonniert `BeaconManager` (projizierte Position, Konfidenz, Kalibrierung,
/// Zielwuensche, Layoutwechsel) mit genau einem Satz Combine-Abonnements.
@MainActor
final class NavigationSession: ObservableObject {
    @Published private(set) var mode: NavigationSessionMode = .idle
    @Published private(set) var plan: [NavigationStop] = []
    @Published private(set) var activeStopID: String?
    @Published private(set) var navigationRoute: NavigationRoute = .empty
    @Published private(set) var routeProgress: Float = 0
    @Published private(set) var remainingRouteLength: Float = 0
    @Published private(set) var isLowConfidence = false
    @Published private(set) var statusMessage: String?
    /// Kartenpunkt des aktiven Stopps (Zielmarker im Einzelziel-Modus).
    @Published private(set) var targetPosition: CGPoint?

    /// Name aus der alten Schnittstelle; Views binden weiter daran.
    var navigationStatusMessage: String? { statusMessage }

    var remainingRoutePolyline: [SIMD2<Float>] { core.remainingRoutePolyline }

    private var core = NavigationSessionCore()
    private weak var beaconManager: BeaconManager?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Verbindung zu BeaconManager (7.8)

    func attach(to beaconManager: BeaconManager) {
        guard self.beaconManager !== beaconManager else { return }
        self.beaconManager = beaconManager
        cancellables.removeAll()

        core.layoutChanged(graph: beaconManager.navigationGraph)
        publish()

        beaconManager.navigationSamples
            .receive(on: DispatchQueue.main)
            .sink { [weak self] sample in
                MainActor.assumeIsolated { self?.handle(sample) }
            }
            .store(in: &cancellables)

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
        seedPosition()
        core.startTour(plan: plan)
        publish()
    }

    func setSingleTarget(_ point: CGPoint) {
        setSingleTarget(SIMD2<Float>(Float(point.x), Float(point.y)))
    }

    func setSingleTarget(_ point: SIMD2<Float>) {
        seedPosition()
        core.setSingleTarget(point)
        publish()
    }

    func stopCompleted() {
        seedPosition()
        core.stopCompleted()
        publish()
    }

    func stopSkipped() {
        seedPosition()
        core.stopSkipped()
        publish()
    }

    func listChanged(plan: [NavigationStop]) {
        seedPosition()
        core.listChanged(plan: plan)
        publish()
    }

    func routeModeToggled(plan: [NavigationStop]) {
        seedPosition()
        core.routeModeToggled(plan: plan)
        publish()
    }

    func replanRequested(plan: [NavigationStop]) {
        seedPosition()
        core.replanRequested(plan: plan)
        publish()
    }

    func layoutChanged(plan: [NavigationStop]? = nil) {
        seedPosition()
        core.layoutChanged(graph: beaconManager?.navigationGraph, plan: plan)
        publish()
    }

    func manualCalibration(at projected: SIMD2<Float>) {
        core.manualCalibration(at: projected)
        publish()
    }

    func stopTour() {
        core.stopTour()
        publish()
    }

    func clearTarget() {
        core.clearTarget()
        publish()
    }

    /// Hilfe fuer die Einkaufs-Session, bis die Planung (Gruppe 9) Ereignisse einzeln sendet:
    /// laeuft schon eine Tour, wirkt der neue Plan als `listChanged`, sonst als `startTour`.
    func syncTour(plan: [NavigationStop]) {
        if core.mode == .tour {
            listChanged(plan: plan)
        } else {
            startTour(plan: plan)
        }
    }

    // MARK: - Intern

    private func handle(_ sample: NavigationSample) {
        if let position = sample.projectedPosition {
            core.positionUpdated(position, confidence: sample.confidence, at: sample.timestamp)
        } else {
            core.confidenceUpdated(sample.confidence)
        }
        publish()
    }

    private func seedPosition() {
        guard let position = beaconManager?.userPosition else { return }
        core.seedPosition(SIMD2<Float>(Float(position.x), Float(position.y)))
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

        let target = core.activeStop.map { CGPoint(x: CGFloat($0.mapPoint.x), y: CGFloat($0.mapPoint.y)) }
        assign(\.targetPosition, target)
    }

    private func assign<Value: Equatable>(_ keyPath: ReferenceWritableKeyPath<NavigationSession, Value>, _ value: Value) {
        if self[keyPath: keyPath] != value {
            self[keyPath: keyPath] = value
        }
    }
}
