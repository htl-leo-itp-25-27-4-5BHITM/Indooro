#if os(iOS)
import CoreBluetooth
import CoreLocation
import Foundation
import IndooroNavigation

/// Funkmodul auf CoreLocation (iBeacon-Ranging) und CoreBluetooth (BLE-Scan mit Advertisements).
/// Laeuft auf dem Hauptakteur; die Delegate-Aufrufe von CoreLocation und CoreBluetooth kommen auf dem Hauptthread
/// (beide Manager werden dort erzeugt, die Bluetooth-Queue ist `nil`).
/// Verhalten wie `BeaconManager`: Standortfreigabe „Beim Verwenden“, Ranging je Constraint, BLE-Scan mit
/// Duplikaten, Advertisements mit RSSI 0/127 werden verworfen.
@MainActor
public final class CoreLocationBeaconRadio: NSObject, BeaconRadio {
    private let sampleOutput = StreamBroadcaster<BeaconSample>()
    private let statusOutput = StreamBroadcaster<RadioStatus>()
    private let clock: any PositioningClock

    private var locationManager: CLLocationManager?
    private var centralManager: CBCentralManager?
    private var wantedConstraints: [BeaconConstraint] = []
    private var activeConstraints: [CLBeaconIdentityConstraint] = []
    private var isStarted = false
    private var isScanning = false

    public init(clock: any PositioningClock = SystemPositioningClock()) {
        self.clock = clock
        super.init()
    }

    public nonisolated func samples() -> AsyncStream<BeaconSample> {
        sampleOutput.makeStream()
    }

    public nonisolated func status() -> AsyncStream<RadioStatus> {
        statusOutput.makeStream()
    }

    public func start(constraints: [BeaconConstraint]) async {
        isStarted = true
        wantedConstraints = constraints
        if locationManager == nil {
            let manager = CLLocationManager()
            manager.delegate = self
            locationManager = manager
        }
        if centralManager == nil {
            centralManager = CBCentralManager(delegate: self, queue: nil)
        }
        applyConfiguration()
    }

    public func stop() async {
        isStarted = false
        stopRanging()
        stopScan()
        publishStatus()
    }

    // MARK: - Konfiguration

    private var isAuthorized: Bool {
        guard let status = locationManager?.authorizationStatus else { return false }
        return status == .authorizedAlways || status == .authorizedWhenInUse
    }

    private func applyConfiguration() {
        guard isStarted, let locationManager else { return }
        publishStatus()
        guard CLLocationManager.locationServicesEnabled() else { return }
        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
            return
        case .authorizedAlways, .authorizedWhenInUse:
            break
        default:
            stopRanging()
            return
        }
        startRanging()
        if centralManager?.state == .poweredOn {
            startScan()
        } else {
            stopScan()
        }
    }

    private func startRanging() {
        guard let locationManager else { return }
        for constraint in activeConstraints { locationManager.stopRangingBeacons(satisfying: constraint) }
        activeConstraints = wantedConstraints.map { wanted in
            if let major = wanted.major {
                return CLBeaconIdentityConstraint(uuid: wanted.uuid, major: major)
            }
            return CLBeaconIdentityConstraint(uuid: wanted.uuid)
        }
        for constraint in activeConstraints { locationManager.startRangingBeacons(satisfying: constraint) }
    }

    private func stopRanging() {
        for constraint in activeConstraints { locationManager?.stopRangingBeacons(satisfying: constraint) }
        activeConstraints.removeAll()
    }

    private func startScan() {
        guard let centralManager, !isScanning else { return }
        centralManager.scanForPeripherals(
            withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
        )
        isScanning = true
    }

    private func stopScan() {
        guard isScanning else { return }
        centralManager?.stopScan()
        isScanning = false
    }

    private func publishStatus() {
        statusOutput.send(RadioStatus(
            bluetooth: Self.bluetooth(centralManager?.state),
            authorization: Self.authorization(locationManager?.authorizationStatus)
        ))
    }

    private static func bluetooth(_ state: CBManagerState?) -> RadioStatus.Bluetooth {
        switch state {
        case .poweredOn: .poweredOn
        case .poweredOff: .poweredOff
        case .unauthorized: .unauthorized
        case .unsupported: .unsupported
        case .resetting: .resetting
        default: .unknown
        }
    }

    private static func authorization(_ status: CLAuthorizationStatus?) -> RadioStatus.Authorization {
        switch status {
        case .authorizedAlways, .authorizedWhenInUse: .authorized
        case .denied: .denied
        case .restricted: .restricted
        default: .notDetermined
        }
    }

    private nonisolated static func proximity(_ proximity: CLProximity) -> BeaconProximityClass {
        switch proximity {
        case .immediate: .immediate
        case .near: .near
        case .far: .far
        case .unknown: .unknown
        @unknown default: .unknown
        }
    }
}

extension CoreLocationBeaconRadio: CLLocationManagerDelegate {
    public nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated { applyConfiguration() }
    }

    public nonisolated func locationManager(
        _ manager: CLLocationManager,
        didRange beacons: [CLBeacon],
        satisfying constraint: CLBeaconIdentityConstraint
    ) {
        let measurements = beacons.map { beacon in
            (
                accuracy: beacon.accuracy,
                proximity: Self.proximity(beacon.proximity),
                rssi: beacon.rssi,
                identity: BeaconIdentity(
                    uuid: beacon.uuid,
                    major: beacon.major.uint16Value,
                    minor: beacon.minor.uint16Value
                )
            )
        }
        MainActor.assumeIsolated {
            let timestamp = clock.now()
            for measurement in measurements {
                sampleOutput.send(BeaconSample(
                    source: .ranging(accuracy: measurement.accuracy, proximity: measurement.proximity),
                    rssi: measurement.rssi,
                    timestamp: timestamp,
                    identity: measurement.identity
                ))
            }
        }
    }

    public nonisolated func locationManager(
        _ manager: CLLocationManager,
        didFailRangingFor constraint: CLBeaconIdentityConstraint,
        error: Error
    ) {
        // Ein Ranging-Fehler aendert Berechtigung und Bluetooth nicht; die Ortung faellt ueber veraltete Messungen zurueck.
    }
}

extension CoreLocationBeaconRadio: CBCentralManagerDelegate {
    public nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        MainActor.assumeIsolated { applyConfiguration() }
    }

    public nonisolated func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let value = RSSI.intValue
        guard value != 127, value != 0 else { return }
        let txPower = (advertisementData[CBAdvertisementDataTxPowerLevelKey] as? NSNumber)?.floatValue
        let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name
        let identity = (advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data)
            .flatMap { IBeaconAdvertisement.identity(fromManufacturerData: $0) }
        MainActor.assumeIsolated {
            sampleOutput.send(BeaconSample(
                source: .advertisement(txPower: txPower),
                rssi: value,
                timestamp: clock.now(),
                identity: identity,
                localName: localName
            ))
        }
    }
}
#endif
