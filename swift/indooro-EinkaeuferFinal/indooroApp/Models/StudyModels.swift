import Foundation

enum StudyCondition: String, Codable, CaseIterable, Identifiable {
    case app
    case withoutApp = "ohne_app"
    var id: String { rawValue }
    var title: String { self == .app ? "Mit App" : "Ohne App" }
}

enum StudyOutcome: String, Codable, CaseIterable, Identifiable {
    case found = "gefunden"
    case help = "hilfe"
    case aborted = "abgebrochen"
    var id: String { rawValue }
    var title: String {
        switch self { case .found: return "Gefunden"; case .help: return "Hilfe gebraucht"; case .aborted: return "Abgebrochen" }
    }
}

struct StudyTask: Codable, Identifiable {
    var id: Int { no }
    let no: Int
    let productId: Int
    var productName: String
    var layoutCode: String?
    var condition: StudyCondition

    init(no: Int, productId: Int, productName: String, layoutCode: String? = nil, condition: StudyCondition = .app) {
        self.no = no; self.productId = productId; self.productName = productName
        self.layoutCode = layoutCode; self.condition = condition
    }
    enum CodingKeys: String, CodingKey { case no, productId, productName, layoutCode, condition }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        no = try c.decode(Int.self, forKey: .no)
        productId = try c.decode(Int.self, forKey: .productId)
        productName = try c.decodeIfPresent(String.self, forKey: .productName) ?? "Produkt \(productId)"
        layoutCode = try c.decodeIfPresent(String.self, forKey: .layoutCode)
        condition = try c.decode(StudyCondition.self, forKey: .condition)
    }
}

/// nil means unavailable; never turn missing instrumentation into a measured zero.
struct StudyCounters: Codable, Equatable {
    var routeBuildCount: Int?
    var rerouteCount: Int?
    var stopChangeWithoutEventCount: Int?
    var manualPositionCount: Int?

    func difference(from start: StudyCounters) -> StudyCounters {
        func delta(_ end: Int?, _ begin: Int?) -> Int? {
            guard let end, let begin, begin >= 0, end >= begin else { return nil }
            return end - begin
        }
        return StudyCounters(routeBuildCount: delta(routeBuildCount, start.routeBuildCount),
                             rerouteCount: delta(rerouteCount, start.rerouteCount),
                             stopChangeWithoutEventCount: delta(stopChangeWithoutEventCount, start.stopChangeWithoutEventCount),
                             manualPositionCount: delta(manualPositionCount, start.manualPositionCount))
    }
}

struct StudyRow: Codable {
    let task: StudyTask
    let positioningMode: String
    let startedAt: Date
    let endedAt: Date
    let duration: TimeInterval
    let outcome: StudyOutcome
    let counters: StudyCounters
    let appErrorCount: Int
}

struct StudyEvent: Codable {
    let t: Date
    let type: String
    let testId: String
    let sessionId: UUID
    let taskNo: Int?
    var note: String?
    var counters: StudyCounters?
    var outcome: StudyOutcome?
}

struct StudySession: Codable, Identifiable {
    let id: UUID
    let testId: String
    let storeCode: String
    let startedAt: Date
    var tasks: [StudyTask]
    var rows: [StudyRow] = []
    var events: [StudyEvent] = []
}

struct StudyRunningTask {
    let task: StudyTask
    let startedAt: Date
    let startedUptime: TimeInterval
    let positioningMode: String
    let counters: StudyCounters
    var appErrorCount: Int = 0
}

enum StudyFormat {
    static let header = "test_id,session_id,store_code,task_no,product_id,product_name,condition,positioning_mode,started_at,ended_at,duration_s,outcome,manual_position_count,reroute_count,stop_change_without_event_count,app_error_count"
    static func isValidID(_ value: String) -> Bool {
        value.range(of: "^T[0-9]{1,3}$", options: .regularExpression) == (value.startIndex..<value.endIndex)
    }
    static func iso(_ date: Date) -> String { ISO8601DateFormatter().string(from: date) }
    static func fileStem(_ session: StudySession) -> String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "yyyyMMdd-HHmmss"
        return "study-\(session.testId)-\(formatter.string(from: session.startedAt))"
    }
    static func csvField(_ value: String) -> String {
        value.contains(where: { [",", "\"", "\n", "\r"].contains($0) }) ? "\"" + value.replacingOccurrences(of: "\"", with: "\"\"") + "\"" : value
    }
    static func csv(_ session: StudySession) -> String {
        func count(_ value: Int?) -> String { value.map(String.init) ?? "-" }
        let rows = session.rows.map { row in
            [session.testId, session.id.uuidString, session.storeCode, String(row.task.no), String(row.task.productId),
             row.task.productName, row.task.condition.rawValue, row.positioningMode,
             iso(row.startedAt), iso(row.endedAt), String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), row.duration),
             row.outcome.rawValue, count(row.counters.manualPositionCount), count(row.counters.rerouteCount),
             count(row.counters.stopChangeWithoutEventCount), String(row.appErrorCount)].map(csvField).joined(separator: ",")
        }
        return ([header] + rows).joined(separator: "\n") + "\n"
    }
    static func jsonLines(_ session: StudySession) throws -> Data {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601; encoder.outputFormatting = [.sortedKeys]
        var data = Data()
        for event in session.events { data.append(try encoder.encode(event)); data.append(0x0A) }
        return data
    }
}
