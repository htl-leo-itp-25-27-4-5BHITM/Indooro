#if DEBUG
import Foundation
import Combine

/// Zeichnet Rohmessungen, Layout-Identitaet, Navigationsereignisse und Bodenwahrheit als JSON Lines nach
/// `Documents/NavigationRecordings/<ISO-Zeitstempel>.jsonl` auf (design.md D11). Nur DEBUG-Builds:
/// Release enthaelt weder diese Klasse noch ihre Aufrufe. Nichts wird an einen Server gesendet.
/// Zeilen werden gepuffert und mindestens alle 2 s sowie beim Stoppen geschrieben.
final class NavigationRecorder: ObservableObject {
    static let shared = NavigationRecorder()
    static let flushInterval: TimeInterval = 2

    @Published private(set) var isRecording = false
    @Published private(set) var lastRecordingURL: URL?

    /// Liefert die aktuelle Layout-Identitaet (setzt `BeaconManager`); wird beim Start als erste Zeile geschrieben.
    var layoutProvider: (() -> LayoutRecord?)?

    private let queue = DispatchQueue(label: "indooro.navigation-recorder")
    private var handle: FileHandle?
    private var buffer: [String] = []
    private var flushTimer: DispatchSourceTimer?
    private var active = false

    private init() {}

    // MARK: - Steuerung

    func start() {
        guard !active else { return }
        let directory = Self.recordingsDirectory
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
            let url = directory.appendingPathComponent("\(stamp).jsonl")
            FileManager.default.createFile(atPath: url.path, contents: nil)
            let newHandle = try FileHandle(forWritingTo: url)
            queue.sync {
                handle = newHandle
                buffer.removeAll()
                active = true
                let timer = DispatchSource.makeTimerSource(queue: queue)
                timer.schedule(deadline: .now() + Self.flushInterval, repeating: Self.flushInterval)
                timer.setEventHandler { [weak self] in self?.flushLocked() }
                timer.resume()
                flushTimer = timer
            }
            DispatchQueue.main.async {
                self.lastRecordingURL = url
                self.isRecording = true
            }
            if let layout = layoutProvider?() {
                record(.layout(layout))
            }
        } catch {
            DispatchQueue.main.async { self.isRecording = false }
        }
    }

    func stop() {
        queue.sync {
            guard active else { return }
            flushLocked()
            flushTimer?.cancel()
            flushTimer = nil
            try? handle?.close()
            handle = nil
            active = false
        }
        DispatchQueue.main.async { self.isRecording = false }
    }

    static var recordingsDirectory: URL {
        FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("NavigationRecordings", isDirectory: true)
    }

    // MARK: - Zeilen

    func record(_ line: NavigationRecordLine) {
        queue.async { [weak self] in
            guard let self, self.active, let text = try? line.jsonLine() else { return }
            self.buffer.append(text)
        }
    }

    func recordRSSI(beacon: String, rssi: Int, txPower: Float?, at timestamp: TimeInterval) {
        record(.measurement(MeasurementRecord(
            t: timestamp, source: .rssi, beacon: beacon, rssi: rssi,
            accuracy: nil, proximity: nil, txPower: txPower
        )))
    }

    func recordRanging(
        beacon: String,
        rssi: Int,
        accuracy: Double,
        proximity: BeaconProximityClass,
        at timestamp: TimeInterval
    ) {
        record(.measurement(MeasurementRecord(
            t: timestamp, source: .ranging, beacon: beacon, rssi: rssi,
            accuracy: accuracy, proximity: proximity, txPower: nil
        )))
    }

    func recordLayout(id: String?, revision: Int, shopName: String?) {
        record(.layout(LayoutRecord(
            t: Date().timeIntervalSince1970, layoutId: id, revision: revision, shopName: shopName
        )))
    }

    func recordEvent(
        _ kind: NavigationEventKind,
        plan: [NavigationStop]? = nil,
        x: Float? = nil,
        y: Float? = nil
    ) {
        record(.event(EventRecord(
            t: Date().timeIntervalSince1970,
            kind: kind,
            plan: plan?.map(RecordedStop.init),
            x: x,
            y: y
        )))
    }

    func recordTruth(x: Float, y: Float) {
        record(.truth(TruthRecord(t: Date().timeIntervalSince1970, x: x, y: y)))
    }

    // MARK: - Schreiben

    private func flushLocked() {
        guard let handle, !buffer.isEmpty else { return }
        let data = Data((buffer.joined(separator: "\n") + "\n").utf8)
        buffer.removeAll()
        try? handle.seekToEnd()
        try? handle.write(contentsOf: data)
    }
}
#endif
