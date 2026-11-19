import Foundation
import IndooroNavigation

/// Identitaet eines iBeacons (UUID, Major, Minor).
public struct BeaconIdentity: Sendable, Hashable {
    public let uuid: UUID
    public let major: UInt16
    public let minor: UInt16

    public init(uuid: UUID, major: UInt16, minor: UInt16) {
        self.uuid = uuid
        self.major = major
        self.minor = minor
    }

    /// Schluessel fuer Store-Lookups: UUID klein und ohne Bindestriche, wie ihn das Backend erwartet.
    public var uuidLookupKey: String {
        uuid.uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }
}

/// Ranging-Filter: alle Beacons einer UUID oder nur einer UUID mit Major.
public struct BeaconConstraint: Sendable, Hashable {
    public let uuid: UUID
    public let major: UInt16?

    public init(uuid: UUID, major: UInt16? = nil) {
        self.uuid = uuid
        self.major = major
    }
}

/// Eine Messung des Funkmoduls.
public struct BeaconSample: Sendable, Equatable {
    public enum Source: Sendable, Equatable {
        /// iBeacon-Ranging von CoreLocation (Genauigkeit in Metern, Naehe-Klasse).
        case ranging(accuracy: Double, proximity: BeaconProximityClass)
        /// BLE-Advertisement (optional mit TX-Power-Level).
        case advertisement(txPower: Float?)
    }

    public let source: Source
    public let rssi: Int
    public let timestamp: TimeInterval
    /// iBeacon-Identitaet; bei Advertisements nur, wenn die Herstellerdaten ein iBeacon beschreiben.
    public let identity: BeaconIdentity?
    /// Lokaler Name des Advertisements (nur Advertisements).
    public let localName: String?

    public init(
        source: Source,
        rssi: Int,
        timestamp: TimeInterval,
        identity: BeaconIdentity? = nil,
        localName: String? = nil
    ) {
        self.source = source
        self.rssi = rssi
        self.timestamp = timestamp
        self.identity = identity
        self.localName = localName
    }
}

/// Zustand von Bluetooth und Standortfreigabe, soweit die Ortung davon abhaengt.
public struct RadioStatus: Sendable, Equatable {
    public enum Bluetooth: String, Sendable, Equatable {
        case unknown, resetting, unsupported, unauthorized, poweredOff, poweredOn
    }

    public enum Authorization: String, Sendable, Equatable {
        case notDetermined, restricted, denied, authorized
    }

    public var bluetooth: Bluetooth
    public var authorization: Authorization

    public init(bluetooth: Bluetooth = .unknown, authorization: Authorization = .notDetermined) {
        self.bluetooth = bluetooth
        self.authorization = authorization
    }
}

/// Funkmodul: iBeacon-Ranging, BLE-Scan und Berechtigungen hinter einem Protokoll (design.md D3).
/// Jeder Aufruf von `samples()`/`status()` liefert einen eigenen Strom; so koennen die Ortung und die
/// Store-Erkennung dieselben Samples lesen.
public protocol BeaconRadio: Sendable {
    func samples() -> AsyncStream<BeaconSample>
    func status() -> AsyncStream<RadioStatus>
    /// Startet Ranging fuer `constraints` und den BLE-Scan. Ein erneuter Aufruf ersetzt die Constraints.
    func start(constraints: [BeaconConstraint]) async
    func stop() async
}
