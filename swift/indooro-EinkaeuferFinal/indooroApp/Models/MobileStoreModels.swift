import Foundation

struct MobileStoreSummary: Decodable, Hashable, Identifiable, Sendable {
    let id: UUID
    let storeCode: String
    let name: String
    let city: String
    let address: String?
    let street: String?
    let zipCode: String?
    let country: String?
    let latitude: Double?
    let longitude: Double?

    private enum CodingKeys: String, CodingKey {
        case id
        case storeCode
        case name
        case city
        case address
        case street
        case zipCode
        case country
        case latitude
        case longitude
        case lat
        case lng
        case lon
        case coordinate
        case location
    }

    private enum CoordinateKeys: String, CodingKey {
        case latitude
        case longitude
        case lat
        case lng
        case lon
    }

    init(
        id: UUID,
        storeCode: String,
        name: String,
        city: String,
        address: String? = nil,
        street: String? = nil,
        zipCode: String? = nil,
        country: String? = nil,
        latitude: Double? = nil,
        longitude: Double? = nil
    ) {
        self.id = id
        self.storeCode = storeCode
        self.name = name
        self.city = city
        self.address = address
        self.street = street
        self.zipCode = zipCode
        self.country = country
        self.latitude = latitude
        self.longitude = longitude
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        storeCode = try container.decode(String.self, forKey: .storeCode)
        name = try container.decode(String.self, forKey: .name)
        city = try container.decode(String.self, forKey: .city)
        address = try container.decodeIfPresent(String.self, forKey: .address)
        street = try container.decodeIfPresent(String.self, forKey: .street)
        zipCode = try container.decodeIfPresent(String.self, forKey: .zipCode)
        country = try container.decodeIfPresent(String.self, forKey: .country)

        let coordinate = Self.decodeCoordinate(from: decoder, container: container)
        latitude = try container.decodeFlexibleDoubleIfPresent(forKey: .latitude)
            ?? container.decodeFlexibleDoubleIfPresent(forKey: .lat)
            ?? coordinate.latitude
        longitude = try container.decodeFlexibleDoubleIfPresent(forKey: .longitude)
            ?? container.decodeFlexibleDoubleIfPresent(forKey: .lng)
            ?? container.decodeFlexibleDoubleIfPresent(forKey: .lon)
            ?? coordinate.longitude
    }

    /// Plausible Kartenposition. `nil` bei fehlendem, nicht endlichem oder außerhalb −90…90 / −180…180
    /// liegendem Wert sowie bei (0, 0), dem typischen Platzhalter ohne echte Koordinate.
    var validCoordinate: MobileStoreCoordinate? {
        Self.validCoordinate(latitude: latitude, longitude: longitude)
    }

    static func validCoordinate(latitude: Double?, longitude: Double?) -> MobileStoreCoordinate? {
        guard let latitude, let longitude,
              latitude.isFinite, longitude.isFinite,
              (-90...90).contains(latitude),
              (-180...180).contains(longitude),
              !(latitude == 0 && longitude == 0) else {
            return nil
        }
        return MobileStoreCoordinate(latitude: latitude, longitude: longitude)
    }

    var displaySubtitle: String {
        if let address = address?.trimmingCharacters(in: .whitespacesAndNewlines), !address.isEmpty { return address }
        return [street, city]
            .compactMap { value in
                let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed?.isEmpty == false ? trimmed : nil
            }
            .joined(separator: ", ")
    }

    private static func decodeCoordinate(
        from decoder: Decoder,
        container: KeyedDecodingContainer<CodingKeys>
    ) -> (latitude: Double?, longitude: Double?) {
        for key in [CodingKeys.coordinate, .location] {
            guard container.contains(key),
                  let nested = try? container.nestedContainer(keyedBy: CoordinateKeys.self, forKey: key) else {
                continue
            }

            let latitude = try? nested.decodeFlexibleDoubleIfPresent(forKey: .latitude)
                ?? nested.decodeFlexibleDoubleIfPresent(forKey: .lat)
            let longitude = try? nested.decodeFlexibleDoubleIfPresent(forKey: .longitude)
                ?? nested.decodeFlexibleDoubleIfPresent(forKey: .lng)
                ?? nested.decodeFlexibleDoubleIfPresent(forKey: .lon)
            return (latitude ?? nil, longitude ?? nil)
        }

        if let nested = try? decoder.container(keyedBy: CoordinateKeys.self) {
            let latitude = try? nested.decodeFlexibleDoubleIfPresent(forKey: .latitude)
                ?? nested.decodeFlexibleDoubleIfPresent(forKey: .lat)
            let longitude = try? nested.decodeFlexibleDoubleIfPresent(forKey: .longitude)
                ?? nested.decodeFlexibleDoubleIfPresent(forKey: .lng)
                ?? nested.decodeFlexibleDoubleIfPresent(forKey: .lon)
            return (latitude ?? nil, longitude ?? nil)
        }

        return (nil, nil)
    }
}

/// Validierte Koordinate einer Filiale (ohne CoreLocation, damit die Prüfung paketweit testbar bleibt).
struct MobileStoreCoordinate: Equatable, Sendable {
    let latitude: Double
    let longitude: Double
}

/// Beschreibung des angewendeten Filial-Layouts für die Indoor-Kopfzeile.
enum StoreLayoutDescription {
    /// `fallback == true` heißt: der Server hat nicht das aktive Filial-Layout, sondern ein Standard-Layout geliefert.
    static func storeLayout(storeName: String, fallback: Bool?, regularDescription: String) -> String {
        guard fallback == true else { return regularDescription }
        return "\(storeName) • Ersatzplan (kein aktueller Marktplan)"
    }
}

struct MatchedBeaconSummary: Decodable, Hashable, Sendable {
    let beaconId: UUID
    let beaconCode: String
    let identityKey: String
}

struct StoreByBeaconResponse: Decodable, Sendable {
    let store: MobileStoreSummary
    let matchedBeacon: MatchedBeaconSummary
}

struct MobileLayoutResponse: Decodable, Sendable {
    let storeId: UUID?
    let layoutId: UUID?
    let source: String?
    let fallback: Bool?
    let layout: LayoutData
}

struct MobileStoresEnvelope: Decodable, Sendable {
    let stores: [MobileStoreSummary]?
    let items: [MobileStoreSummary]?
    let data: [MobileStoreSummary]?
}

struct StoreDetectionBeaconCatalog: Decodable, Sendable {
    let uuidStrings: [String]

    private enum CodingKeys: String, CodingKey {
        case uuids
        case beacons
        case identities
    }

    init(from decoder: Decoder) throws {
        if let strings = try? [String](from: decoder) {
            uuidStrings = strings
            return
        }

        if let identities = try? [StoreDetectionBeaconIdentity](from: decoder) {
            uuidStrings = identities.map(\.uuid)
            return
        }

        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let strings = try container.decodeIfPresent([String].self, forKey: .uuids) {
            uuidStrings = strings
            return
        }
        if let identities = try container.decodeIfPresent([StoreDetectionBeaconIdentity].self, forKey: .beacons) {
            uuidStrings = identities.map(\.uuid)
            return
        }
        if let identities = try container.decodeIfPresent([StoreDetectionBeaconIdentity].self, forKey: .identities) {
            uuidStrings = identities.map(\.uuid)
            return
        }

        uuidStrings = []
    }
}

private struct StoreDetectionBeaconIdentity: Decodable, Sendable {
    let uuid: String

    private enum CodingKeys: String, CodingKey {
        case uuid
        case identityKey
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let uuid = try container.decodeIfPresent(String.self, forKey: .uuid) {
            self.uuid = uuid
        } else if let identityKey = try container.decodeIfPresent(String.self, forKey: .identityKey),
                  let uuid = identityKey.split(separator: ":").first {
            self.uuid = String(uuid)
        } else {
            self.uuid = ""
        }
    }
}

private extension KeyedDecodingContainer {
    func decodeFlexibleDoubleIfPresent(forKey key: Key) throws -> Double? {
        guard contains(key), !(try decodeNil(forKey: key)) else {
            return nil
        }

        if let value = try? decode(Double.self, forKey: key) {
            return value
        }
        if let value = try? decode(Int.self, forKey: key) {
            return Double(value)
        }
        if let value = try? decode(String.self, forKey: key) {
            return Double(value.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return nil
    }
}
