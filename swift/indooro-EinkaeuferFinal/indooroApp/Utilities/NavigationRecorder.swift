#if DEBUG
import Foundation
import Combine
import CoreMotion

/// Zeichnet Rohmessungen, Layout-Identitaet, Navigationsereignisse und Bodenwahrheit als JSON Lines nach
/// `Documents/NavigationRecordings/<ISO-Zeitstempel>.jsonl` auf (design.md D11). Nur DEBUG-Builds:
/// Release enthaelt weder diese Klasse noch ihre Aufrufe. Nichts wird an einen Server gesendet.
/// Zeilen werden gepuffert und mindestens alle 2 s sowie beim Stoppen geschrieben.
final class NavigationRecorder: ObservableObject {
    static let shared = NavigationRecorder()
    static let flushInterval: TimeInterval = 2

    @Published private(set) var isRecording = false
    @Published private(set) var lastRecordingURL: URL?
    /// Wahrheitsmarker der laufenden Aufzeichnung (Rueckmeldung fuer die Person mit dem iPhone).
    @Published private(set) var truthCount = 0
    /// Layout-fremde iBeacons der laufenden Aufzeichnung: `major-minor` -> Anzahl `scan`-Zeilen.
    @Published private(set) var unmatchedBeacons: [String: Int] = [:]

    /// Auswahl aus den Einstellungen (indooro-recording/2): Szenario und Rolle gelten ab dem naechsten Start,
    /// der Marker ab dem naechsten Wahrheitsmarker. `nil` = keine Auswahl, das Feld entfaellt.
    @Published var selectedScenario: SessionScenario?
    @Published var selectedRole: SessionRole?
    /// Marker-Nummer (`M<n>`) fuer die naechsten Wahrheitsmarker.
    @Published var selectedMarker: Int?
    /// Anzahl der Sync-Marken der laufenden Aufzeichnung.
    @Published private(set) var syncCount = 0

    /// Liefert die aktuelle Layout-Identitaet (setzt `BeaconManager`); wird beim Start direkt nach der `session`-Zeile geschrieben.
    var layoutProvider: (() -> LayoutRecord?)?

    private let queue = DispatchQueue(label: "indooro.navigation-recorder")
    private var handle: FileHandle?
    private var buffer: [String] = []
    private var flushTimer: DispatchSourceTimer?
    private var active = false
    private let pedometer = CMPedometer()
    /// Fortlaufender Zaehler der Sync-Marken je Aufnahme (nur auf `queue`).
    private var syncCounter = 0
    private var lastScanWrite: [String: TimeInterval] = [:]
    /// Mindestabstand zwischen zwei `scan`-Zeilen desselben fremden Beacons (Sekunden).
    static let scanInterval: TimeInterval = 1

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
                self.truthCount = 0
                self.unmatchedBeacons = [:]
                self.isRecording = true
            }
            queue.sync { lastScanWrite.removeAll(); syncCounter = 0 }
            DispatchQueue.main.async { self.syncCount = 0 }
            record(.session(Self.makeSessionRecord(scenario: selectedScenario, role: selectedRole)))
            if let layout = layoutProvider?() {
                record(.layout(layout))
            }
            startStepCounting()
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
        pedometer.stopUpdates()
        DispatchQueue.main.async { self.isRecording = false }
    }

    /// Schrittzaehlung nur bei verfuegbarer Hardware und nicht verweigerter Berechtigung. Der System-Dialog
    /// „Bewegung & Fitness“ erscheint daher nur beim Start einer Aufzeichnung. Fehler: keine step-Zeilen,
    /// die Aufzeichnung laeuft weiter.
    private func startStepCounting() {
        guard CMPedometer.isStepCountingAvailable() else { return }
        let status = CMPedometer.authorizationStatus()
        guard status != .denied, status != .restricted else { return }
        // Nullstand beim Start: markiert „Schrittdaten vorhanden“, auch wenn die erste Aenderung erst spaeter kommt.
        recordStep(steps: 0, distance: 0, at: Date().timeIntervalSince1970)
        pedometer.startUpdates(from: Date()) { [weak self] data, error in
            guard let self, let data, error == nil else { return }
            self.recordStep(
                steps: data.numberOfSteps.intValue,
                distance: data.distance?.doubleValue,
                at: data.endDate.timeIntervalSince1970
            )
        }
    }

    /// Alle Aufnahmen im Documents-Ordner, neueste zuerst. Der Name ist ein Zeitstempel, also sortiert er zeitlich.
    static func savedRecordings() -> [URL] {
        let files = (try? FileManager.default.contentsOfDirectory(at: recordingsDirectory, includingPropertiesForKeys: nil)) ?? []
        return files
            .filter { $0.pathExtension == "jsonl" }
            .sorted { $0.lastPathComponent > $1.lastPathComponent }
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

    /// iBeacon ohne Treffer im aktiven Layout (falsche Registrierung oder falsches Layout). Nur Diagnose.
    func recordUnmatchedBeacon(major: Int, minor: Int, rssi: Int, at timestamp: TimeInterval) {
        let key = "\(major)-\(minor)"
        queue.async { [weak self] in
            guard let self, self.active else { return }
            if let last = self.lastScanWrite[key], timestamp - last < Self.scanInterval { return }
            self.lastScanWrite[key] = timestamp
            guard let text = try? NavigationRecordLine.scan(ScanRecord(t: timestamp, major: major, minor: minor, rssi: rssi)).jsonLine() else { return }
            self.buffer.append(text)
            DispatchQueue.main.async { self.unmatchedBeacons[key, default: 0] += 1 }
        }
    }

    func recordStep(steps: Int, distance: Double?, at timestamp: TimeInterval) {
        record(.step(StepRecord(t: timestamp, steps: steps, distance: distance, source: "pedometer")))
    }

    func recordHeading(degrees: Double, accuracy: Double, at timestamp: TimeInterval) {
        record(.heading(HeadingRecord(t: timestamp, degrees: degrees, accuracy: accuracy, source: "compass")))
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

    /// Sync-Marke `sync-<n>` (fortlaufend je Aufnahme) zur zeitlichen Zuordnung externer Referenzen.
    func recordSync() {
        let now = Date().timeIntervalSince1970
        queue.async { [weak self] in
            guard let self, self.active else { return }
            let next = self.syncCounter + 1
            guard let label = RecordingMetadata.syncLabel(next),
                  let text = try? NavigationRecordLine.sync(SyncRecord(t: now, label: label)).jsonLine() else { return }
            self.syncCounter = next
            self.buffer.append(text)
            DispatchQueue.main.async { self.syncCount = next }
        }
    }

    static func makeSessionRecord(scenario: SessionScenario?, role: SessionRole?) -> SessionRecord {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machine = withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(cString: $0)
            }
        }
        let version = ProcessInfo.processInfo.operatingSystemVersion
        let info = Bundle.main.infoDictionary
        return RecordingMetadata.sessionRecord(
            t: Date().timeIntervalSince1970,
            shortVersion: info?["CFBundleShortVersionString"] as? String,
            build: info?["CFBundleVersion"] as? String,
            machine: machine,
            osMajor: version.majorVersion,
            osMinor: version.minorVersion,
            osPatch: version.patchVersion,
            scenario: scenario,
            role: role
        )
    }

    func recordTruth(x: Float, y: Float) {
        let marker = selectedMarker.flatMap { RecordingMetadata.markerLabel($0) }
        record(.truth(TruthRecord(t: Date().timeIntervalSince1970, x: x, y: y, marker: marker)))
        DispatchQueue.main.async { if self.isRecording { self.truthCount += 1 } }
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
