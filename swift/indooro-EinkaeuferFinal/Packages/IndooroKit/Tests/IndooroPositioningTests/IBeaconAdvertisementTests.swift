import XCTest
@testable import IndooroPositioning

/// Task 9.1: iBeacon-Herstellerdaten (Port von `DetectedStoreBeacon(manufacturerData:)`).
final class IBeaconAdvertisementTests: XCTestCase {
    private func payload(prefix: [UInt8] = [0x4C, 0x00, 0x02, 0x15]) -> Data {
        let uuid: [UInt8] = [0x11, 0x11, 0x11, 0x11, 0x22, 0x22, 0x33, 0x33, 0x44, 0x44, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55]
        return Data(prefix + uuid + [0x01, 0x02, 0x03, 0x04, 0xC5])
    }

    func testParsesUUIDMajorAndMinor() throws {
        let identity = try XCTUnwrap(IBeaconAdvertisement.identity(fromManufacturerData: payload()))
        XCTAssertEqual(identity.uuid, UUID(uuidString: "11111111-2222-3333-4444-555555555555"))
        XCTAssertEqual(identity.major, 0x0102)
        XCTAssertEqual(identity.minor, 0x0304)
        XCTAssertEqual(identity.uuidLookupKey, "11111111222233334444555555555555")
    }

    func testRejectsOtherManufacturersAndShortPayloads() {
        XCTAssertNil(IBeaconAdvertisement.identity(fromManufacturerData: payload(prefix: [0x4D, 0x00, 0x02, 0x15])))
        XCTAssertNil(IBeaconAdvertisement.identity(fromManufacturerData: payload(prefix: [0x4C, 0x00, 0x09, 0x15])))
        XCTAssertNil(IBeaconAdvertisement.identity(fromManufacturerData: Data([0x4C, 0x00, 0x02, 0x15, 0x01])))
    }
}
