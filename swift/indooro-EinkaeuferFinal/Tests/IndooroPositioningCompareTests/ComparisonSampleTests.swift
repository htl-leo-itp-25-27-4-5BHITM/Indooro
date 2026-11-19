import XCTest
@testable import IndooroNavigation
@testable import IndooroNavigationCore

/// `tools/beacon-lab/samples/synthetic-position-comparison.json` is the output of this tool on the SYNTHETIC fixture
/// and the Lab test reads it. If the tool changes, regenerate it (command in the failure message) so the Lab
/// importer keeps being tested against the real output.
final class ComparisonSampleTests: XCTestCase {
    private var sampleURL: URL {
        ComparisonFixtures.directory
            .deletingLastPathComponent() // NavigationFixtures
            .deletingLastPathComponent() // indooro-EinkaeuferFinal
            .deletingLastPathComponent() // swift
            .deletingLastPathComponent() // repo root
            .appendingPathComponent("tools/beacon-lab/samples/synthetic-position-comparison.json")
    }

    func testCommittedLabSampleMatchesAFreshRun() async throws {
        let hint = """
        Regenerate: cd swift/indooro-EinkaeuferFinal && swift run compare-positioning NavigationFixtures/synthetic/synthetic-testraum-2026-10-19-1.jsonl \
        --layout NavigationFixtures/synthetic/layout-synthetic-testraum.json --out /tmp/cmp && \
        cp /tmp/cmp/synthetic-testraum-2026-10-19-1-comparison.json ../../tools/beacon-lab/samples/synthetic-position-comparison.json
        """
        let committed = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(contentsOf: sampleURL)) as? [String: Any], hint
        )
        let fresh = try await ComparisonFixtures.run()
        let current = try XCTUnwrap(JSONSerialization.jsonObject(with: fresh.json()) as? [String: Any])

        XCTAssertEqual(committed["schema"] as? String, current["schema"] as? String, hint)
        XCTAssertEqual((committed["epochs"] as? [Any])?.count, (current["epochs"] as? [Any])?.count, hint)
        XCTAssertEqual((committed["recording"] as? [String: Any])?["sha256"] as? String,
                       (current["recording"] as? [String: Any])?["sha256"] as? String, hint)
        let committedSummary = try XCTUnwrap(committed["summary"] as? [String: [String: Any]])
        let freshSummary = try XCTUnwrap(current["summary"] as? [String: [String: Any]])
        for method in ["current", "engine"] {
            for key in ["median", "p90", "p95", "within2", "within3", "within5", "outageRate", "jumpRate"] {
                let a = try XCTUnwrap(committedSummary[method]?[key] as? Double, "\(method).\(key)")
                let b = try XCTUnwrap(freshSummary[method]?[key] as? Double, "\(method).\(key)")
                XCTAssertEqual(a, b, accuracy: 1e-3, "\(method).\(key). \(hint)")
            }
        }
    }
}
