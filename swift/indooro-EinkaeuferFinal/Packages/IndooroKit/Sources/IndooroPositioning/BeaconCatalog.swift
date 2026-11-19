import Foundation
import IndooroModels
import simd

/// Beacons eines Layouts samt Zuordnung von Funk-Identitaeten zu Layout-Namen
/// (Logik von `BeaconManager.buildBeacons`, `matchingBeaconName` und `buildRangingConstraints`).
public struct BeaconCatalog: Sendable {
    public let beacons: [IndooroBeacon]

    public init(beacons: [IndooroBeacon]) {
        self.beacons = beacons
    }

    public init(elements: [LayoutElement]) {
        beacons = elements
            .filter { $0.type == "beacon" }
            .compactMap { element in
                guard let name = element.beaconId else { return nil }
                let fallback = Self.trailingInteger(in: name)
                return IndooroBeacon(
                    id: String(element.id),
                    name: name,
                    beaconUUID: BeaconUUIDNormalizer.uuid(from: element.beaconUUID),
                    beaconMajor: element.beaconMajor.map { UInt16(clamping: $0) } ?? fallback.map { UInt16(clamping: $0) },
                    beaconMinor: element.beaconMinor.map { UInt16(clamping: $0) } ?? fallback.map { UInt16(clamping: $0) },
                    positionX: element.x,
                    positionY: element.y
                )
            }
    }

    public var names: [String] {
        beacons.map(\.name)
    }

    /// Ankerpunkte fuer `BeaconMeasurementStore.syncBeacons`.
    public var anchors: [(name: String, point: SIMD2<Float>)] {
        beacons.map { (name: $0.name, point: SIMD2<Float>(Float($0.positionX), Float($0.positionY))) }
    }

    /// Exakte Zuordnung ueber UUID, Major und Minor.
    public func explicitName(for identity: BeaconIdentity) -> String? {
        beacons.first(where: {
            $0.beaconUUID == identity.uuid && $0.beaconMajor == identity.major && $0.beaconMinor == identity.minor
        })?.name
    }

    /// Zuordnung eines geranten iBeacons: exakt, sonst ueber die Endnummer des Beacon-Namens
    /// (Minor und Major, nur Minor, nur Major).
    public func rangingName(for identity: BeaconIdentity) -> String? {
        if let explicit = explicitName(for: identity) {
            return explicit
        }
        let minor = Int(identity.minor)
        let major = Int(identity.major)
        if let match = beacons.first(where: {
            let trailing = Self.trailingInteger(in: $0.name)
            return trailing == minor && trailing == major
        }) {
            return match.name
        }
        if let match = beacons.first(where: { Self.trailingInteger(in: $0.name) == minor }) {
            return match.name
        }
        if let match = beacons.first(where: { Self.trailingInteger(in: $0.name) == major }) {
            return match.name
        }
        return nil
    }

    /// Ranging-Constraints: je UUID ein UUID-weiter Filter, sonst je (UUID, Major). UUIDs der
    /// Store-Erkennung werden UUID-weit aufgenommen und verdraengen engere Filter derselben UUID.
    public func rangingConstraints(storeDetectionUUIDs: Set<UUID> = []) -> [BeaconConstraint] {
        var keys = Set(beacons.compactMap { beacon -> BeaconConstraint? in
            beacon.beaconUUID.map { BeaconConstraint(uuid: $0, major: beacon.beaconMajor) }
        })
        keys.formUnion(storeDetectionUUIDs.map { BeaconConstraint(uuid: $0, major: nil) })
        let wide = Set(keys.compactMap { $0.major == nil ? $0.uuid : nil })
        keys = keys.filter { $0.major == nil || !wide.contains($0.uuid) }
        return keys.sorted {
            if $0.uuid.uuidString == $1.uuid.uuidString {
                return ($0.major ?? 0) < ($1.major ?? 0)
            }
            return $0.uuid.uuidString < $1.uuid.uuidString
        }
    }

    static func trailingInteger(in value: String) -> Int? {
        let digits = value.reversed().prefix { $0.isNumber }.reversed()
        guard !digits.isEmpty else { return nil }
        return Int(String(digits))
    }
}
