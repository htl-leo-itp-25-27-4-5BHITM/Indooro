import XCTest
@testable import IndooroNavigationCore

/// The expected values are the worked examples of `tools/beacon-lab/docs/METRICS.md`.
final class ComparisonMetricsTests: XCTestCase {
    private func epochs(errors: [Double?], dt: Double = 0.35) -> [MetricEpoch] {
        errors.enumerated().map { index, error in
            MetricEpoch(
                t: 100 + Double(index) * dt,
                truth: SIMD2(0, 0),
                position: error.map { SIMD2($0, 0) }
            )
        }
    }

    func testDocumentedErrorExample() throws {
        let metrics = PathMetrics.compute(epochs(errors: [1, 2, 3, 4]))
        XCTAssertEqual(try XCTUnwrap(metrics.mean), 2.5, accuracy: 1e-12)
        XCTAssertEqual(try XCTUnwrap(metrics.median), 2.5, accuracy: 1e-12)
        XCTAssertEqual(try XCTUnwrap(metrics.rmse), 7.5.squareRoot(), accuracy: 1e-12)
        XCTAssertEqual(try XCTUnwrap(metrics.p90), 3.7, accuracy: 1e-12)
        XCTAssertEqual(try XCTUnwrap(metrics.p95), 3.85, accuracy: 1e-12)
        XCTAssertEqual(metrics.max, 4)
        XCTAssertEqual(metrics.within2, 0.5)
        XCTAssertEqual(metrics.within3, 0.75)
        XCTAssertEqual(metrics.within5, 1)
        XCTAssertEqual(metrics.outageRate, 0)
    }

    func testOutageCountsAsNotWithinAndStaysOutOfTheErrorFigures() throws {
        let metrics = PathMetrics.compute(epochs(errors: [1, nil, 3, nil]))
        XCTAssertEqual(metrics.epochsWithTruth, 4)
        XCTAssertEqual(metrics.validEstimates, 2)
        XCTAssertEqual(metrics.failedEstimates, 2)
        XCTAssertEqual(metrics.outageRate, 0.5)
        XCTAssertEqual(metrics.within2, 0.25)
        XCTAssertEqual(metrics.within3, 0.5)
        XCTAssertEqual(try XCTUnwrap(metrics.median), 2, accuracy: 1e-12)
    }

    func testEpochsWithoutTruthDoNotCount() {
        var list = epochs(errors: [1, 1])
        list.append(MetricEpoch(t: 200, truth: nil, position: SIMD2(50, 50)))
        list.append(MetricEpoch(t: 201, truth: nil, position: nil))
        let metrics = PathMetrics.compute(list)
        XCTAssertEqual(metrics.epochs, 4)
        XCTAssertEqual(metrics.epochsWithTruth, 2)
        XCTAssertEqual(metrics.outageRate, 0)
    }

    func testNoTruthMeansNoFigures() {
        let metrics = PathMetrics.compute([MetricEpoch(t: 1, truth: nil, position: SIMD2(1, 1))])
        XCTAssertEqual(metrics.epochsWithTruth, 0)
        XCTAssertNil(metrics.median)
        XCTAssertNil(metrics.outageRate)
        XCTAssertNil(metrics.within2)
    }

    func testJumpRateUsesConsecutivePositionsWithinTwoSeconds() throws {
        // dt 0.35 s: a step of 0.7 m is exactly 2.0 m/s (not a jump), 0.8 m is 2.29 m/s (a jump).
        let list: [MetricEpoch] = [
            MetricEpoch(t: 0, truth: nil, position: SIMD2(0, 0)),
            MetricEpoch(t: 0.35, truth: nil, position: SIMD2(0.7, 0)),
            MetricEpoch(t: 0.70, truth: nil, position: SIMD2(1.5, 0)),
            MetricEpoch(t: 1.05, truth: nil, position: nil),
            MetricEpoch(t: 1.40, truth: nil, position: SIMD2(1.5, 0.1)),
            MetricEpoch(t: 10, truth: nil, position: SIMD2(50, 0)),
        ]
        let metrics = PathMetrics.compute(list)
        XCTAssertEqual(metrics.pairs, 3, "the pair across the 8.6 s gap does not count")
        XCTAssertEqual(metrics.jumps, 1)
        XCTAssertEqual(try XCTUnwrap(metrics.jumpRate), 1.0 / 3.0, accuracy: 1e-12)
    }
}
