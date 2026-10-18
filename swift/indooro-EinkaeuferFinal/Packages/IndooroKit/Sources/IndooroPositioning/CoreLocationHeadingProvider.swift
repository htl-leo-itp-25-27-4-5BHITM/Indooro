#if os(iOS)
import CoreLocation
import Foundation

/// Kompassrichtung ueber CoreLocation (wahre Richtung, sonst magnetische), Filter 1 Grad wie in `BeaconManager`.
/// Die Standortfreigabe fragt das Funkmodul an; der Kompass startet, sobald sie vorliegt.
@MainActor
public final class CoreLocationHeadingProvider: NSObject, HeadingProvider {
    private let output = StreamBroadcaster<HeadingSample>()
    private let clock: any PositioningClock
    private var manager: CLLocationManager?
    private var isStarted = false
    private var isUpdating = false

    public init(clock: any PositioningClock = SystemPositioningClock()) {
        self.clock = clock
        super.init()
    }

    public nonisolated func headings() -> AsyncStream<HeadingSample> {
        output.makeStream()
    }

    public func start() async {
        isStarted = true
        if manager == nil {
            let created = CLLocationManager()
            created.delegate = self
            manager = created
        }
        updateIfPossible()
    }

    public func stop() async {
        isStarted = false
        if isUpdating {
            manager?.stopUpdatingHeading()
            isUpdating = false
        }
    }

    private func updateIfPossible() {
        guard isStarted, !isUpdating, let manager, CLLocationManager.headingAvailable() else { return }
        guard manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse else {
            return
        }
        manager.headingFilter = 1
        manager.startUpdatingHeading()
        isUpdating = true
    }
}

extension CoreLocationHeadingProvider: CLLocationManagerDelegate {
    public nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated { updateIfPossible() }
    }

    public nonisolated func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        let accuracy = newHeading.headingAccuracy
        let degrees = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        MainActor.assumeIsolated {
            output.send(HeadingSample(degrees: degrees, accuracyDegrees: accuracy, timestamp: clock.now()))
        }
    }

    public nonisolated func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
        guard let heading = manager.heading else { return true }
        return heading.headingAccuracy < 0 || heading.headingAccuracy > 25
    }
}
#endif
