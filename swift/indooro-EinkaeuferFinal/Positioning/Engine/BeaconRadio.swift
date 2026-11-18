import Foundation

/// Identitaet eines iBeacons (UUID, Major, Minor).
struct BeaconIdentity: Sendable, Hashable {
    let uuid: UUID
    let major: UInt16
    let minor: UInt16

    init(uuid: UUID, major: UInt16, minor: UInt16) {
        self.uuid = uuid
        self.major = major
        self.minor = minor
    }

    /// Schluessel fuer Store-Lookups: UUID klein und ohne Bindestriche, wie ihn das Backend erwartet.
    var uuidLookupKey: String {
        uuid.uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }
}

/// Ranging-Filter: alle Beacons einer UUID oder nur einer UUID mit Major.
struct BeaconConstraint: Sendable, Hashable {
    let uuid: UUID
    let major: UInt16?

    init(uuid: UUID, major: UInt16? = nil) {
        self.uuid = uuid
        self.major = major
    }
}

/// Eine Messung des Funkmoduls.
struct BeaconSample: Sendable, Equatable {
    enum Source: Sendable, Equatable {
        /// iBeacon-Ranging von CoreLocation (Genauigkeit in Metern, Naehe-Klasse).
        case ranging(accuracy: Double, proximity: BeaconProximityClass)
        /// BLE-Advertisement (optional mit TX-Power-Level).
        case advertisement(txPower: Float?)
    }

    let source: Source
    let rssi: Int
    let timestamp: TimeInterval
    /// iBeacon-Identitaet; bei Advertisements nur, wenn die Herstellerdaten ein iBeacon beschreiben.
    let identity: BeaconIdentity?
    /// Lokaler Name des Advertisements (nur Advertisements).
    let localName: String?

    init(
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
struct RadioStatus: Sendable, Equatable {
    enum Bluetooth: String, Sendable, Equatable {
        case unknown, resetting, unsupported, unauthorized, poweredOff, poweredOn
    }

    enum Authorization: String, Sendable, Equatable {
        case notDetermined, restricted, denied, authorized
    }

    var bluetooth: Bluetooth
    var authorization: Authorization

    init(bluetooth: Bluetooth = .unknown, authorization: Authorization = .notDetermined) {
        self.bluetooth = bluetooth
        self.authorization = authorization
    }
}

/// Funkmodul: iBeacon-Ranging, BLE-Scan und Berechtigungen hinter einem Protokoll (design.md D3).
/// Jeder Aufruf von `samples()`/`status()` liefert einen eigenen Strom; so koennen die Ortung und die
/// Store-Erkennung dieselben Samples lesen.
protocol BeaconRadio: Sendable {
    func samples() -> AsyncStream<BeaconSample>
    func status() -> AsyncStream<RadioStatus>
    /// Startet Ranging fuer `constraints` und den BLE-Scan. Ein erneuter Aufruf ersetzt die Constraints.
    func start(constraints: [BeaconConstraint]) async
    func stop() async
}
