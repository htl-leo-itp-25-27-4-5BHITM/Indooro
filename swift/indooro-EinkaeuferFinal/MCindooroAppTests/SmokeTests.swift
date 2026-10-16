import XCTest
@testable import MCindooroApp

final class SmokeTests: XCTestCase {
    func testHostAppModuleLoads() {
        XCTAssertFalse(IndooroAPI.baseURL.isEmpty)
    }
}
