import Foundation

/// iBeacon-Daten aus den Herstellerdaten eines BLE-Advertisements (Apple Company ID 0x004C, Typ 0x02, Laenge 0x15).
public enum IBeaconAdvertisement {
    /// Identitaet aus den Herstellerdaten; `nil`, wenn die Daten kein iBeacon beschreiben.
    public static func identity(fromManufacturerData data: Data) -> BeaconIdentity? {
        let bytes = [UInt8](data)
        guard bytes.count >= 25,
              bytes[0] == 0x4C,
              bytes[1] == 0x00,
              bytes[2] == 0x02,
              bytes[3] == 0x15 else {
            return nil
        }
        let u = Array(bytes[4...19])
        let uuid = UUID(uuid: (
            u[0], u[1], u[2], u[3], u[4], u[5], u[6], u[7],
            u[8], u[9], u[10], u[11], u[12], u[13], u[14], u[15]
        ))
        return BeaconIdentity(
            uuid: uuid,
            major: (UInt16(bytes[20]) << 8) | UInt16(bytes[21]),
            minor: (UInt16(bytes[22]) << 8) | UInt16(bytes[23])
        )
    }
}
