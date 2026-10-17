import SwiftUI
import CoreLocation
import CoreBluetooth

struct PermissionBanner: View {
    @ObservedObject var manager: BeaconManager
    var body: some View {
        if manager.trackingMode == .beacon {
            VStack(alignment: .leading, spacing: 8) {
                if manager.locationAuthorization == .denied || manager.locationAuthorization == .restricted || !CLLocationManager.locationServicesEnabled() {
                    Label("Standortzugriff fehlt", systemImage: "location.slash")
                    settingsButton
                }
                if manager.bluetoothState == .poweredOff || manager.bluetoothState == .unauthorized {
                    Label("Bluetooth ist aus – Ortung nicht möglich", systemImage: "antenna.radiowaves.left.and.right.slash")
                    settingsButton
                }
            }
            .font(.subheadline)
            .padding(.horizontal)
            .background(.regularMaterial)
        }
    }
    private var settingsButton: some View {
        Button("Einstellungen öffnen") {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        }
        .buttonStyle(.bordered)
    }
}
