#if os(iOS)
import CoreMotion
import Foundation

/// Kumulative Schritte ueber `CMPedometer`. Nur bei verfuegbarer Hardware und nicht verweigerter Berechtigung;
/// der Nullstand beim Start markiert „Schrittdaten vorhanden“ (wie `NavigationRecorder`).
public final class CoreMotionStepProvider: MotionProvider, @unchecked Sendable {
    private let output = StreamBroadcaster<StepSample>()
    private let pedometer = CMPedometer()
    private let clock: any PositioningClock

    public init(clock: any PositioningClock = SystemPositioningClock()) {
        self.clock = clock
    }

    public func steps() -> AsyncStream<StepSample> {
        output.makeStream()
    }

    public func start() async {
        guard CMPedometer.isStepCountingAvailable() else { return }
        let status = CMPedometer.authorizationStatus()
        guard status != .denied, status != .restricted else { return }
        output.send(StepSample(cumulativeSteps: 0, timestamp: clock.now()))
        let output = output
        pedometer.startUpdates(from: Date()) { data, error in
            guard let data, error == nil else { return }
            output.send(StepSample(
                cumulativeSteps: data.numberOfSteps.intValue,
                timestamp: data.endDate.timeIntervalSince1970
            ))
        }
    }

    public func stop() async {
        pedometer.stopUpdates()
    }
}
#endif
