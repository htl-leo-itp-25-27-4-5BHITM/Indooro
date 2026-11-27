import SwiftUI
import UIKit
import XCTest
@testable import MCindooroApp

@MainActor
final class IndooroTokensTests: XCTestCase {
    private func token(_ path: String) throws -> [String: Any] {
        // Read the shared source from the checkout, including on CI simulators.
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent("design-tokens/tokens.json"))
        let source = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        func resolve(_ path: String) throws -> [String: Any] {
            var node = source
            for part in path.split(separator: ".") {
                node = try XCTUnwrap(node[String(part)] as? [String: Any])
            }
            if let alias = node["$value"] as? String, alias.hasPrefix("{"), alias.hasSuffix("}") {
                return try resolve(String(alias.dropFirst().dropLast()))
            }
            return try XCTUnwrap(node["$value"] as? [String: Any])
        }
        return try resolve(path)
    }

    func testGeneratedColorsMatchSourceIncludingAliasAndAlpha() throws {
        for (path, color) in [
            ("color.brand.primary", IndooroTokens.Color.brandPrimary),
            ("color.brand.accent", IndooroTokens.Color.brandAccent),
            ("color.palette.hex-102a3b33", IndooroTokens.Color.paletteHex102a3b33),
            ("color.palette.hex-ffffff", IndooroTokens.Color.paletteHexffffff),
        ] {
            let value = try token(path)
            let components = try XCTUnwrap(value["components"] as? [Double])
            let alpha = try XCTUnwrap(value["alpha"] as? Double)
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            XCTAssertTrue(UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a), path)
            for (actual, expected) in zip([r, g, b, a], components + [alpha]) {
                XCTAssertEqual(Double(actual), expected, accuracy: 0.000001, path)
            }
        }
    }

    func testGeneratedDimensionsMatchSourceInPoints() throws {
        for (path, actual) in [
            ("space.8px", IndooroTokens.Spacing.value8px),
            ("space.16px", IndooroTokens.Spacing.value16px),
            ("radius.14px", IndooroTokens.Radius.value14px),
            ("radius.28px", IndooroTokens.Radius.value28px),
        ] {
            let value = try token(path)
            XCTAssertEqual(value["unit"] as? String, "px", path)
            XCTAssertEqual(Double(actual), try XCTUnwrap(value["value"] as? Double), path)
        }
    }
}
