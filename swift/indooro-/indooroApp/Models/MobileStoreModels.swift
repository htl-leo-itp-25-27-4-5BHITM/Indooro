import CoreLocation
import Foundation

struct MobileStoreSummary: Decodable, Identifiable, Hashable {
    let id: String
    let storeCode: String
    let name: String
    let city: String
    let address: String?
    let latitude: Double?
    let longitude: Double?

    var coordinate: CLLocationCoordinate2D? {
        guard let latitude,
              let longitude,
              (-90...90).contains(latitude),
              (-180...180).contains(longitude) else {
            return nil
        }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var displayAddress: String {
        if let address, !address.isEmpty {
            return address
        }
        return city
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case storeCode
        case name
        case city
        case address
        case latitude
        case longitude
        case lat
        case lng
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeFlexibleString(forKey: .id)
        storeCode = try container.decode(String.self, forKey: .storeCode)
        name = try container.decode(String.self, forKey: .name)
        city = try container.decode(String.self, forKey: .city)
        address = try container.decodeIfPresent(String.self, forKey: .address)
        latitude = try container.decodeIfPresent(Double.self, forKey: .latitude)
            ?? container.decodeIfPresent(Double.self, forKey: .lat)
        longitude = try container.decodeIfPresent(Double.self, forKey: .longitude)
            ?? container.decodeIfPresent(Double.self, forKey: .lng)
    }
}

struct MatchedBeaconSummary: Decodable, Hashable {
    let beaconId: String
    let beaconCode: String
    let identityKey: String
}

struct StoreByBeaconResponse: Decodable {
    let store: MobileStoreSummary
    let matchedBeacon: MatchedBeaconSummary
}

enum StoreLayoutSelectionSource: Sendable {
    case manual
    case beacon
}

@MainActor
final class MobileStoreListViewModel: ObservableObject {
    @Published private(set) var stores: [MobileStoreSummary] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    private let storesURL = URL(string: "\(IndooroAPI.baseURL)/mobile/stores")

    var storesWithCoordinates: [MobileStoreSummary] {
        stores.filter { store in
            if store.coordinate == nil {
                print("Store ohne Koordinaten wird nicht auf der Map angezeigt: \(store.storeCode)")
                return false
            }
            return true
        }
    }

    func loadStores() {
        guard !isLoading else { return }
        guard let storesURL else {
            errorMessage = "Store-URL ist ungueltig."
            return
        }

        isLoading = true
        errorMessage = nil

        URLSession.shared.dataTask(with: storesURL) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isLoading = false

                if let error {
                    self.errorMessage = error.localizedDescription
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse,
                      (200...299).contains(httpResponse.statusCode),
                      let data else {
                    self.errorMessage = "Stores konnten nicht geladen werden."
                    return
                }

                do {
                    self.stores = try JSONDecoder().decode([MobileStoreSummary].self, from: data)
                } catch {
                    self.errorMessage = "Store-Daten konnten nicht gelesen werden."
                }
            }
        }.resume()
    }
}

private extension KeyedDecodingContainer {
    func decodeFlexibleString(forKey key: Key) throws -> String {
        if let stringValue = try decodeIfPresent(String.self, forKey: key) {
            return stringValue
        }
        if let uuidValue = try decodeIfPresent(UUID.self, forKey: key) {
            return uuidValue.uuidString
        }
        throw DecodingError.typeMismatch(
            String.self,
            .init(codingPath: codingPath + [key], debugDescription: "Expected string-compatible value.")
        )
    }
}
