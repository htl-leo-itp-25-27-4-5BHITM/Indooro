import XCTest
@testable import MCindooroApp

@MainActor
final class SmokeTests: XCTestCase {
    func testHostAppModuleLoads() {
        XCTAssertFalse(IndooroAPI.baseURL.isEmpty)
    }
}
