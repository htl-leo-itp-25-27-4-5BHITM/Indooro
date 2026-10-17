import XCTest
@testable import MCindooroApp

final class StudyExportTests: XCTestCase {
    private let sessionID = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
    /// 2026-10-16T12:00:00Z
    private let start = Date(timeIntervalSince1970: 1_792_152_000)

    private func makeSession() -> StudySession {
        let first = StudyRow(
            task: StudyTask(no: 1, productId: 101, productName: "Testprodukt, \"Stufe A\"", layoutCode: "310/1/1/1", condition: .app),
            positioningMode: "ohne_ortung",
            startedAt: start,
            endedAt: start.addingTimeInterval(48),
            duration: 48.04,
            outcome: .found,
            counters: StudyCounters(),
            appErrorCount: 1
        )
        let second = StudyRow(
            task: StudyTask(no: 2, productId: 102, productName: "Testprodukt B", condition: .withoutApp),
            positioningMode: "mit_ortung",
            startedAt: start.addingTimeInterval(60.5),
            endedAt: start.addingTimeInterval(82.5),
            duration: 22.0,
            outcome: .help,
            counters: StudyCounters(routeBuildCount: 4, rerouteCount: 1, stopChangeWithoutEventCount: 0, manualPositionCount: 2),
            appErrorCount: 0
        )
        let events = [
            StudyEvent(t: start, type: "session_start", testId: "T01", sessionId: sessionID, taskNo: nil),
            StudyEvent(t: start.addingTimeInterval(0.5), type: "task_start", testId: "T01", sessionId: sessionID, taskNo: 1),
            StudyEvent(t: start.addingTimeInterval(48), type: "task_end", testId: "T01", sessionId: sessionID, taskNo: 1,
                       note: nil, counters: StudyCounters(), outcome: .found),
        ]
        return StudySession(id: sessionID, testId: "T01", storeCode: "SYNTH", startedAt: start,
                            tasks: [], rows: [first, second], events: events)
    }

    /// Zerlegt eine CSV-Zeile und beachtet Anführungszeichen mit verdoppelten Quotes.
    private func fields(of line: String) -> [String] {
        let chars = Array(line)
        var result: [String] = []
        var current = ""
        var inQuotes = false
        var index = 0
        while index < chars.count {
            let char = chars[index]
            if inQuotes {
                if char == "\"" {
                    if index + 1 < chars.count, chars[index + 1] == "\"" {
                        current.append("\"")
                        index += 1
                    } else {
                        inQuotes = false
                    }
                } else {
                    current.append(char)
                }
            } else if char == "\"" {
                inQuotes = true
            } else if char == "," {
                result.append(current)
                current = ""
            } else {
                current.append(char)
            }
            index += 1
        }
        result.append(current)
        return result
    }

    // MARK: - CSV

    func testCSVHasHeaderAndSixteenColumnsPerLine() {
        let csv = StudyFormat.csv(makeSession())

        XCTAssertTrue(csv.hasPrefix(StudyFormat.header + "\n"))
        XCTAssertTrue(csv.hasSuffix("\n"))
        XCTAssertEqual(fields(of: StudyFormat.header).count, 16)

        let lines = csv.split(separator: "\n").map(String.init)
        XCTAssertEqual(lines.count, 3)
        for line in lines {
            XCTAssertEqual(fields(of: line).count, 16, line)
        }
    }

    func testCSVRowValuesFormatDurationTimestampsCountersAndQuoting() {
        let lines = StudyFormat.csv(makeSession()).split(separator: "\n").map(String.init)

        let first = fields(of: lines[1])
        XCTAssertEqual(first[0], "T01")
        XCTAssertEqual(first[1], sessionID.uuidString)
        XCTAssertEqual(first[2], "SYNTH")
        XCTAssertEqual(first[3], "1")
        XCTAssertEqual(first[4], "101")
        XCTAssertEqual(first[5], "Testprodukt, \"Stufe A\"")
        XCTAssertEqual(first[6], "app")
        XCTAssertEqual(first[7], "ohne_ortung")
        XCTAssertEqual(first[8], "2026-10-16T12:00:00.000Z")
        XCTAssertEqual(first[9], "2026-10-16T12:00:48.000Z")
        XCTAssertEqual(first[10], "48.0")
        XCTAssertEqual(first[11], "gefunden")
        XCTAssertEqual(first[12], "-")
        XCTAssertEqual(first[13], "-")
        XCTAssertEqual(first[14], "-")
        XCTAssertEqual(first[15], "1")
        XCTAssertTrue(lines[1].contains(",\"Testprodukt, \"\"Stufe A\"\"\","))

        let second = fields(of: lines[2])
        XCTAssertEqual(second[3], "2")
        XCTAssertEqual(second[6], "ohne_app")
        XCTAssertEqual(second[7], "mit_ortung")
        XCTAssertEqual(second[8], "2026-10-16T12:01:00.500Z")
        XCTAssertEqual(second[9], "2026-10-16T12:01:22.500Z")
        XCTAssertEqual(second[10], "22.0")
        XCTAssertEqual(second[11], "hilfe")
        XCTAssertEqual(Array(second[12...15]), ["2", "1", "0", "0"])
    }

    // MARK: - JSON Lines

    func testJSONLinesEmitsOneValidObjectPerEvent() throws {
        let session = makeSession()

        let data = try StudyFormat.jsonLines(session)
        let lines = try XCTUnwrap(String(data: data, encoding: .utf8)).split(separator: "\n")

        XCTAssertEqual(lines.count, session.events.count)
        for line in lines {
            let object = try JSONSerialization.jsonObject(with: Data(line.utf8))
            let dictionary = try XCTUnwrap(object as? [String: Any])
            XCTAssertEqual(dictionary["testId"] as? String, "T01")
        }
        let firstObject = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(lines[0].utf8)) as? [String: Any])
        XCTAssertEqual(firstObject["t"] as? String, "2026-10-16T12:00:00.000Z")
        XCTAssertEqual(firstObject["type"] as? String, "session_start")
    }
}
