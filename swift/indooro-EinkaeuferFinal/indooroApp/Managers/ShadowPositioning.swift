import Foundation
import IndooroModels
import IndooroPositioning
import simd

/// Schattenbetrieb der neuen Ortungs-Engine (tasks.md 9.6, 9.7).
/// `BeaconManager` bleibt der aktive Pfad. Mit dem Schalter `AppEnvironment.isShadowPositioningEnabled` laeuft
/// `PositioningEngine` parallel mit eigenem Funkmodul, bekommt dieselben Layouts und Kalibrierungen und
/// schreibt in Abstaenden die Abweichung zur angezeigten Position des alten Pfads ins Log (Kategorie `positioning`).
/// Die Daten dienen den Messfahrten, die vor dem Entfernen von `BeaconManager` (9.7) noetig sind.
final class ShadowPositioning {
    private let engine: PositioningEngine
    private let output = StreamBroadcaster<PositionSnapshot>()
    private let legacyPosition: () -> CGPoint?
    private var consumer: Task<Void, Never>?
    private var lastLogAt: TimeInterval = 0
    private var isRunning = false
    private(set) var latestSnapshot: PositionSnapshot?

    private static let logInterval: TimeInterval = 5

    init(legacyPosition: @escaping () -> CGPoint?) {
        self.legacyPosition = legacyPosition
        engine = PositioningEngine(
            radio: CoreLocationBeaconRadio(),
            headingProvider: CoreLocationHeadingProvider(),
            motionProvider: CoreMotionStepProvider()
        )
    }

    /// Strom der Snapshots der Engine; jeder Aufruf liefert einen eigenen Leser.
    func snapshots() -> AsyncStream<PositionSnapshot> {
        output.makeStream()
    }

    func setLayout(_ layout: LayoutData, revision: Int) {
        let engine = engine
        Task { await engine.setLayout(PositioningLayout(layout: layout, revision: revision)) }
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true
        let engine = engine
        consumer = Task { [weak self] in
            for await snapshot in engine.snapshots {
                self?.receive(snapshot)
            }
        }
        Task { await engine.start() }
    }

    func stop() {
        guard isRunning else { return }
        isRunning = false
        consumer?.cancel()
        consumer = nil
        let engine = engine
        Task { await engine.stop() }
    }

    func calibrate(to point: SIMD2<Float>) {
        let engine = engine
        Task { await engine.calibrate(to: point) }
    }

    private func receive(_ snapshot: PositionSnapshot) {
        latestSnapshot = snapshot
        output.send(snapshot)
        guard snapshot.timestamp - lastLogAt >= Self.logInterval else { return }
        lastLogAt = snapshot.timestamp
        let shadow = snapshot.displayedPoint
        let legacy = legacyPosition()
        let difference: Double? = {
            guard let shadow, let legacy else { return nil }
            return Double(hypot(Double(shadow.x) - Double(legacy.x), Double(shadow.y) - Double(legacy.y)))
        }()
        AppLog.positioning.info("""
        shadow status=\(snapshot.status.rawValue, privacy: .public) \
        trusted=\(snapshot.isTrusted, privacy: .public) \
        confidence=\(snapshot.confidence, privacy: .public) \
        beacons=\(snapshot.activeBeaconCount, privacy: .public) \
        legacyDistance=\(difference.map { String(format: "%.2f", $0) } ?? "-", privacy: .public)
        """)
    }
}
