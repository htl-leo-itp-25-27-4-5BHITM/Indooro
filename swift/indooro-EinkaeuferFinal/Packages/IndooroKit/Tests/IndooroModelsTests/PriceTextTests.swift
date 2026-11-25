import XCTest
import IndooroModels

final class PriceTextTests: XCTestCase {
    func testFormatsWithDecimalCommaAndEuroSign() {
        let text = PriceText.format(1.5)
        XCTAssertTrue(text.contains("1,50"), text)
        XCTAssertTrue(text.contains("€"), text)
    }
}
