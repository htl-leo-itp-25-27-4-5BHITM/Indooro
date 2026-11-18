import XCTest
@testable import IndooroNavigationCore

final class TruthTrackTests: XCTestCase {
    private func marker(_ t: Double, _ x: Double, _ y: Double) -> TruthTrack.Marker {
        TruthTrack.Marker(t: t, x: x, y: y, label: nil)
    }

    func testInterpolatesLinearlyBetweenDifferentMarkers() {
        let track = TruthTrack(markers: [marker(10, 0, 0), marker(20, 10, 4)])
        XCTAssertEqual(track.position(at: 15), SIMD2(5, 2))
        XCTAssertEqual(track.position(at: 10), SIMD2(0, 0))
        XCTAssertEqual(track.position(at: 20), SIMD2(10, 4))
    }

    func testNoTruthOutsideTheMarkerRange() {
        let track = TruthTrack(markers: [marker(10, 0, 0), marker(20, 10, 0)])
        XCTAssertNil(track.position(at: 9.99))
        XCTAssertNil(track.position(at: 20.01))
        XCTAssertNil(TruthTrack(markers: []).position(at: 1))
    }

    func testIdenticalConsecutiveMarkersFormAHold() {
        let track = TruthTrack(markers: [marker(0, 1, 1), marker(30, 1, 1), marker(40, 11, 1)])
        XCTAssertEqual(track.holds, [TruthTrack.Hold(start: 0, end: 30, x: 1, y: 1)])
        XCTAssertEqual(track.position(at: 12), SIMD2(1, 1))
        XCTAssertEqual(track.position(at: 35), SIMD2(6, 1))
    }

    func testUnsortedMarkersAreSortedStably() {
        let track = TruthTrack(markers: [marker(20, 10, 0), marker(10, 0, 0)])
        XCTAssertEqual(track.position(at: 15), SIMD2(5, 0))
    }

    func testNonFiniteMarkersAreIgnored() {
        let track = TruthTrack(markers: [marker(10, 0, 0), marker(.nan, 5, 5), marker(20, 10, 0)])
        XCTAssertEqual(track.markers.count, 2)
    }
}
