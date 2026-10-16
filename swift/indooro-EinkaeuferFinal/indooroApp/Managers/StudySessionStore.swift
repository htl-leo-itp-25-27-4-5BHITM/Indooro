import Foundation
import Combine

enum StudyFailure: LocalizedError {
    case invalidID, invalidTask, busy, noRunningTask, disabled
    var errorDescription: String? {
        switch self {
        case .invalidID: return "Test-ID im Format T07"
        case .invalidTask: return "Bitte eine gültige, noch offene Aufgabe auswählen."
        case .busy: return "Bitte zuerst die laufende Aufgabe beenden."
        case .noRunningTask: return "Es läuft noch keine Aufgabe."
        case .disabled: return "Die Testleitung ist für diesen Build nicht aktiviert."
        }
    }
}

@MainActor
final class StudySessionStore: ObservableObject {
    static let openRequested = Notification.Name("IndooroStudyOpenRequested")
    @Published private(set) var session: StudySession?
    @Published private(set) var running: StudyRunningTask?
    @Published var errorMessage: String?
    var onStartAppTask: ((StudyTask) -> Void)?
    // Erik can connect his read-only published counters here once available.
    var counterSnapshot: () -> StudyCounters = { StudyCounters() }
    private let root: URL
    private let enabled: Bool
    private let now: () -> Date
    private let uptime: () -> TimeInterval

    init(root: URL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("StudySessions"),
         enabled: Bool, now: @escaping () -> Date = Date.init,
         uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.root = root; self.enabled = enabled; self.now = now; self.uptime = uptime
        guard enabled, FileManager.default.fileExists(atPath: root.path) else { return }
        do {
            var found: [StudySession] = []
            for dir in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) where UUID(uuidString: dir.lastPathComponent) != nil {
                do { found.append(try JSONDecoder.indooro.decode(StudySession.self, from: Data(contentsOf: dir.appendingPathComponent("session.json")))) }
                catch { errorMessage = "Eine gespeicherte Sitzung konnte nicht gelesen werden. Die Dateien bleiben erhalten." }
            }
            session = found.max(by: { $0.startedAt < $1.startedAt })
        } catch { errorMessage = "Gespeicherte Sitzungen konnten nicht geladen werden." }
    }

    func createSession(testId: String, storeCode: String, tasks: [StudyTask]? = nil) throws {
        guard enabled else { throw StudyFailure.disabled }
        guard running == nil else { throw StudyFailure.busy }
        guard StudyFormat.isValidID(testId) else { throw StudyFailure.invalidID }
        let tasks = try tasks ?? bundledTasks()
        guard tasks.allSatisfy({ $0.no > 0 && $0.productId > 0 }), Set(tasks.map(\.no)).count == tasks.count else { throw StudyFailure.invalidTask }
        let next = StudySession(id: UUID(), testId: testId, storeCode: storeCode, startedAt: now(), tasks: tasks)
        try persist(next); session = next; errorMessage = nil
    }

    func addTask(productId: Int, productName: String, layoutCode: String?) throws {
        guard running == nil else { throw StudyFailure.busy }
        guard var next = session, productId > 0 else { throw StudyFailure.invalidTask }
        next.tasks.append(StudyTask(no: (next.tasks.map(\.no).max() ?? 0) + 1, productId: productId, productName: productName, layoutCode: layoutCode))
        try persist(next); session = next
    }

    func updateTask(_ no: Int, condition: StudyCondition? = nil, productName: String? = nil, layoutCode: String? = nil) throws {
        guard running == nil else { throw StudyFailure.busy }
        guard var next = session, let i = next.tasks.firstIndex(where: { $0.no == no }), !next.rows.contains(where: { $0.task.no == no }) else { throw StudyFailure.invalidTask }
        if let condition { next.tasks[i].condition = condition }
        if let productName { next.tasks[i].productName = productName }
        if let layoutCode { next.tasks[i].layoutCode = layoutCode }
        try persist(next); session = next
    }

    func start(taskNo: Int, positioningMode: String) throws {
        guard enabled else { throw StudyFailure.disabled }
        guard running == nil else { throw StudyFailure.busy }
        guard var next = session, let task = next.tasks.first(where: { $0.no == taskNo }), !next.rows.contains(where: { $0.task.no == taskNo }) else { throw StudyFailure.invalidTask }
        guard task.condition == .withoutApp || ["mit_ortung", "ohne_ortung"].contains(positioningMode) else { throw StudyFailure.invalidTask }
        let begin = now()
        let state = StudyRunningTask(task: task, startedAt: begin, startedUptime: uptime(),
                                     positioningMode: task.condition == .withoutApp ? "-" : positioningMode,
                                     counters: task.condition == .app ? counterSnapshot() : StudyCounters())
        next.events.append(StudyEvent(t: begin, type: "taskStart", testId: next.testId, sessionId: next.id, taskNo: task.no))
        try persist(next); session = next; running = state
        if task.condition == .app { onStartAppTask?(task) }
    }

    func finish(_ outcome: StudyOutcome) throws {
        guard let running, var next = session else { throw StudyFailure.noRunningTask }
        let end = now()
        let counts = running.task.condition == .app ? counterSnapshot().difference(from: running.counters) : StudyCounters()
        next.rows.append(StudyRow(task: running.task, positioningMode: running.positioningMode, startedAt: running.startedAt,
                                  endedAt: end, duration: max(0, uptime() - running.startedUptime), outcome: outcome,
                                  counters: counts, appErrorCount: running.appErrorCount))
        next.events.append(StudyEvent(t: end, type: "taskEnd", testId: next.testId, sessionId: next.id, taskNo: running.task.no, counters: counts, outcome: outcome))
        try persist(next); session = next; self.running = nil
    }

    func addNote(_ note: String) throws {
        guard var next = session else { throw StudyFailure.invalidTask }
        let text = String(note.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1000))
        guard !text.isEmpty else { return }
        next.events.append(StudyEvent(t: now(), type: "note", testId: next.testId, sessionId: next.id, taskNo: running?.task.no, note: text))
        try persist(next); session = next
    }

    func recordError(_ message: String) {
        guard var state = running, state.task.condition == .app, var next = session else { return }
        state.appErrorCount += 1
        next.events.append(StudyEvent(t: now(), type: "error", testId: next.testId, sessionId: next.id, taskNo: state.task.no, note: message))
        do { try persist(next); session = next; running = state }
        catch { errorMessage = "Der Fehler konnte nicht in der Sitzung gespeichert werden." }
    }

    var elapsed: TimeInterval { running.map { max(0, uptime() - $0.startedUptime) } ?? 0 }

    func exportURLs() throws -> [URL] {
        guard let session else { throw StudyFailure.invalidTask }
        guard running == nil else { throw StudyFailure.busy }
        #if DEBUG
        NSLog("[StudyExport] begin")
        defer { NSLog("[StudyExport] end") }
        #endif
        try persist(session)
        let dir = directory(session)
        let name = StudyFormat.fileStem(session)
        return [dir.appendingPathComponent(name + ".csv"), dir.appendingPathComponent(name + ".jsonl")]
    }

    func deleteAll() throws {
        guard running == nil else { throw StudyFailure.busy }
        // Delete only directories with session UUID names; preserve unknown files.
        if FileManager.default.fileExists(atPath: root.path) {
            for dir in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) where UUID(uuidString: dir.lastPathComponent) != nil {
                try FileManager.default.removeItem(at: dir)
            }
        }
        session = nil; errorMessage = nil
    }

    private func directory(_ session: StudySession) -> URL { root.appendingPathComponent(session.id.uuidString, isDirectory: true) }
    private func persist(_ session: StudySession) throws {
        let dir = directory(session)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var rootURL = root
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try rootURL.setResourceValues(values)
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601; encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(session).write(to: dir.appendingPathComponent("session.json"), options: .atomic)
        try Data(StudyFormat.csv(session).utf8).write(to: dir.appendingPathComponent(StudyFormat.fileStem(session) + ".csv"), options: .atomic)
        try StudyFormat.jsonLines(session).write(to: dir.appendingPathComponent(StudyFormat.fileStem(session) + ".jsonl"), options: .atomic)
    }
    private func bundledTasks() throws -> [StudyTask] {
        guard let url = Bundle.main.url(forResource: "study-tasks", withExtension: "json") else { return [] }
        return try JSONDecoder.indooro.decode([StudyTask].self, from: Data(contentsOf: url))
    }
}
