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
