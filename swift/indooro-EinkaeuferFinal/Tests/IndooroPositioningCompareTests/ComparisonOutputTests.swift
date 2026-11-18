import XCTest
@testable import IndooroNavigation
@testable import IndooroNavigationCore

final class ComparisonOutputTests: XCTestCase {
    private func lines(of text: String) -> [String] {
        text.split(whereSeparator: \.isNewline).map(String.init)
    }

    private func run(recording: String, name: String = ComparisonFixtures.recordingName) async throws -> PositioningComparisonResult {
        try await PositioningComparison.run(
            recordingJSONL: recording,
            layoutJSON: ComparisonFixtures.layoutData(),
            recordingName: name
        )
    }

    func testSyntheticResultIsLabelledInEveryOutput() async throws {
        let result = try await ComparisonFixtures.run()
        XCTAssertTrue(result.isSynthetic)
        XCTAssertTrue(result.summaryText().contains("SYNTHETISCH, KEINE MESSUNG"))
        let json = try JSONSerialization.jsonObject(with: result.json()) as? [String: Any]
        XCTAssertEqual(json?["origin"] as? String, "synthetic")
        XCTAssertEqual(json?["schema"] as? String, "indooro-position-comparison/1")
        XCTAssertTrue((json?["warnings"] as? [String] ?? []).contains { $0.hasPrefix("SYNTHETISCH") })
    }

    func testNonSyntheticNameIsNotLabelled() async throws {
        let result = try await run(recording: ComparisonFixtures.recordingText(), name: "testraum-2026-11-20-1.jsonl")
        XCTAssertFalse(result.isSynthetic)
        // The layout name of the fixture itself says SYNTHETISCH; the label comes from the recording name only.
        XCTAssertFalse(result.summaryText().contains("SYNTHETISCH, KEINE MESSUNG"))
        XCTAssertFalse(result.warnings.contains { $0.hasPrefix("SYNTHETISCH") })
    }

    func testSummaryListsAllFiguresOfBothPaths() async throws {
        let text = try await ComparisonFixtures.run().summaryText()
        for label in ["Median (m)", "P90 (m)", "P95 (m)", "Anteil <= 2 m", "Anteil <= 3 m", "Anteil <= 5 m", "Ausfallrate", "Sprungrate"] {
            XCTAssertTrue(text.contains(label), label)
        }
        XCTAssertTrue(text.contains("Aktuell"))
        XCTAssertTrue(text.contains("Engine"))
    }

    func testCSVHasOneRowPerEpochAndTheDocumentedColumns() async throws {
        let result = try await ComparisonFixtures.run()
        let rows = lines(of: result.csv())
        XCTAssertEqual(rows.count, result.epochCount + 1)
        XCTAssertEqual(rows[0], PositioningComparisonResult.csvHeader)
        let columns = rows[0].split(separator: ",", omittingEmptySubsequences: false).count
        XCTAssertEqual(columns, 17)
        for row in rows.dropFirst() {
            XCTAssertEqual(row.split(separator: ",", omittingEmptySubsequences: false).count, columns)
        }
    }

    func testTickCSVsUseTheReplayFormatForFieldStats() async throws {
        let result = try await ComparisonFixtures.run()
        for method in PositioningMethod.allCases {
            let rows = lines(of: result.tickCSV(method))
            XCTAssertEqual(rows[0], NavigationReplay.csvHeader)
            XCTAssertEqual(rows.count, result.epochCount + 1)
        }
    }

    func testJSONHoldsBothMethodsOnTheSameEpochsAndTheSummary() async throws {
        let result = try await ComparisonFixtures.run()
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: result.json()) as? [String: Any])
        let methods = try XCTUnwrap(json["methods"] as? [[String: Any]])
        XCTAssertEqual(methods.compactMap { $0["id"] as? String }, ["current", "engine"])
        let epochs = try XCTUnwrap(json["epochs"] as? [[String: Any]])
        XCTAssertEqual(epochs.count, result.epochCount)
        let first = try XCTUnwrap(epochs.first)
        XCTAssertNotNil(first["current"] as? [String: Any])
        XCTAssertNotNil(first["engine"] as? [String: Any])
        let summary = try XCTUnwrap(json["summary"] as? [String: Any])
        let current = try XCTUnwrap(summary["current"] as? [String: Any])
        XCTAssertEqual(try XCTUnwrap(current["median"] as? Double), try XCTUnwrap(result.currentMetrics.median), accuracy: 1e-6)
        XCTAssertEqual(current["epochsWithTruth"] as? Int, result.currentMetrics.epochsWithTruth)
    }

    func testSameInputGivesByteIdenticalOutput() async throws {
        let first = try await ComparisonFixtures.run()
        let second = try await ComparisonFixtures.run()
        XCTAssertEqual(first.csv(), second.csv())
        XCTAssertEqual(try first.json(), try second.json())
        XCTAssertEqual(first.summaryText(), second.summaryText())
    }

    func testRecordingWithoutTruthHasNoFigures() async throws {
        let withoutTruth = try ComparisonFixtures.recordingText()
            .split(whereSeparator: \.isNewline)
            .filter { !$0.contains("\"type\":\"truth\"") }
            .joined(separator: "\n")
        let result = try await run(recording: withoutTruth)
        XCTAssertFalse(result.hasEvaluableEpochs)
        XCTAssertGreaterThan(result.epochCount, 100)
        XCTAssertNil(result.currentMetrics.median)
        XCTAssertTrue(result.summaryText().contains("keine Kennzahlen"))
    }

    func testSessionRoleAndScenarioAreReported() async throws {
        let session = #"{"app":"1.0 (1)","deviceModel":"iPhone15,2","os":"iOS 18.5","role":"evaluation","scenario":"S2","schema":"indooro-recording/2","t":1792000000.0,"type":"session"}"#
        let result = try await run(recording: session + "\n" + ComparisonFixtures.recordingText())
        XCTAssertEqual(result.session?.role, .evaluation)
        XCTAssertTrue(result.summaryText().contains("Rolle evaluation, Szenario S2"))
        let calibration = session.replacingOccurrences(of: "evaluation", with: "calibration")
        let other = try await run(recording: calibration + "\n" + ComparisonFixtures.recordingText())
        XCTAssertTrue(other.warnings.contains { $0.contains("zaehlt nicht zur Bewertung") })
    }

    func testEmptyRecordingAndBrokenLayoutAreRejected() async throws {
        do {
            _ = try await run(recording: "")
            XCTFail("empty recording must throw")
        } catch is PositioningComparisonError {}
        do {
            _ = try await PositioningComparison.run(
                recordingJSONL: ComparisonFixtures.recordingText(),
                layoutJSON: Data("{}".utf8),
                recordingName: "x.jsonl"
            )
            XCTFail("broken layout must throw")
        } catch is PositioningComparisonError {}
    }

    func testLayoutAnswerWithLayoutKeyIsAccepted() async throws {
        let plain = try ComparisonFixtures.layoutData()
        let wrapped = Data(#"{"storeCode":"X","layout":"#.utf8) + plain + Data("}".utf8)
        let result = try await PositioningComparison.run(
            recordingJSONL: ComparisonFixtures.recordingText(),
            layoutJSON: wrapped,
            recordingName: "x.jsonl"
        )
        XCTAssertGreaterThan(result.epochCount, 100)
    }
}
