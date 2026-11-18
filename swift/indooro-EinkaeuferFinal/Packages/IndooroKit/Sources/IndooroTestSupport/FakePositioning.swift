import Foundation
import IndooroPositioning

/// Funkmodul fuer Tests: Samples und Status werden von Hand eingespeist; Start/Stop werden mitgeschrieben.
public final class FakeBeaconRadio: BeaconRadio, @unchecked Sendable {
    private let sampleStreams = StreamBroadcaster<BeaconSample>()
    private let statusStreams = StreamBroadcaster<RadioStatus>()
    private let lock = NSLock()
    private var recordedStarts: [[BeaconConstraint]] = []
    private var stopCount = 0

    public init() {}

    public func samples() -> AsyncStream<BeaconSample> { sampleStreams.makeStream() }
    public func status() -> AsyncStream<RadioStatus> { statusStreams.makeStream() }

    public func start(constraints: [BeaconConstraint]) async {
        lock.withLock { recordedStarts.append(constraints) }
    }

    public func stop() async {
        lock.withLock { stopCount += 1 }
    }

    public func emit(_ sample: BeaconSample) { sampleStreams.send(sample) }
    public func emit(_ status: RadioStatus) { statusStreams.send(status) }

    /// Constraints jedes `start`-Aufrufs, in Reihenfolge.
    public var starts: [[BeaconConstraint]] { lock.withLock { recordedStarts } }
    public var stops: Int { lock.withLock { stopCount } }
}

public final class FakeHeadingProvider: HeadingProvider, @unchecked Sendable {
    private let streams = StreamBroadcaster<HeadingSample>()
    public init() {}
    public func headings() -> AsyncStream<HeadingSample> { streams.makeStream() }
    public func start() async {}
    public func stop() async {}
    public func emit(_ sample: HeadingSample) { streams.send(sample) }
}

public final class FakeMotionProvider: MotionProvider, @unchecked Sendable {
    private let streams = StreamBroadcaster<StepSample>()
    public init() {}
    public func steps() -> AsyncStream<StepSample> { streams.makeStream() }
    public func start() async {}
    public func stop() async {}
    public func emit(_ sample: StepSample) { streams.send(sample) }
}
