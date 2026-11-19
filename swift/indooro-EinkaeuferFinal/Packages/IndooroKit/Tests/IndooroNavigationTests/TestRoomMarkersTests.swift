import XCTest
import simd
@testable import IndooroNavigation

final class TestRoomMarkersTests: XCTestCase {
    func testMarkersAreCellCentresInsideTheFiveByNineGrid() {
        XCTAssertEqual(TestRoomMarkers.numbers, Array(1...8))
        for number in TestRoomMarkers.numbers {
            let point = TestRoomMarkers.point(forMarker: number)!
            XCTAssertTrue((0..<5).contains(Int(point.x)) && (0..<9).contains(Int(point.y)), "M\(number)")
            XCTAssertEqual(point.x - point.x.rounded(.down), 0.5, "M\(number) x ist Zellmitte")
            XCTAssertEqual(point.y - point.y.rounded(.down), 0.5, "M\(number) y ist Zellmitte")
            XCTAssertTrue(RecordingMetadata.isValidMarker("M\(number)"))
        }
        XCTAssertEqual(TestRoomMarkers.point(forMarker: 1), SIMD2<Float>(0.5, 7.5))
        XCTAssertEqual(TestRoomMarkers.point(forMarker: 8), SIMD2<Float>(0.5, 1.5))
        XCTAssertNil(TestRoomMarkers.point(forMarker: 9))
    }
}
