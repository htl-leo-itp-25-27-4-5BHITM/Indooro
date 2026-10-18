import Foundation

public struct IndooroBeacon: Identifiable, Sendable {
    public let id: String
    public let name: String
    public let beaconUUID: UUID?
    public let beaconMajor: UInt16?
    public let beaconMinor: UInt16?
    public var rssi: Int = 0
    public var distance: Double = 0.0
    public var lastSeenAt: TimeInterval?
    public var measurementQuality: Double = 0.0
    public var txPower: Double?

    public var positionX: Double
    public var positionY: Double

    public init(id: String, name: String, beaconUUID: UUID?, beaconMajor: UInt16?, beaconMinor: UInt16?, rssi: Int = 0, distance: Double = 0.0, lastSeenAt: TimeInterval? = nil, measurementQuality: Double = 0.0, txPower: Double? = nil, positionX: Double, positionY: Double) {
        self.id = id
        self.name = name
        self.beaconUUID = beaconUUID
        self.beaconMajor = beaconMajor
        self.beaconMinor = beaconMinor
        self.rssi = rssi
        self.distance = distance
        self.lastSeenAt = lastSeenAt
        self.measurementQuality = measurementQuality
        self.txPower = txPower
        self.positionX = positionX
        self.positionY = positionY
    }
}
