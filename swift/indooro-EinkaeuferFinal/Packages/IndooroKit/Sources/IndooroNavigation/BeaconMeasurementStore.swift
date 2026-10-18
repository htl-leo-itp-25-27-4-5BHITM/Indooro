import Foundation
import simd

public enum BeaconMeasurementSource: String, Hashable, CaseIterable {
    case ranging
    case rssi
}

/// Schluessel fuer Kalman-Filter: Die beiden Distanzmodelle (CoreLocation-Ranging und
/// RSSI-Pfadverlust) werden nie im selben Filter gemischt.
struct BeaconSourceKey: Hashable {
    let beaconName: String
    let source: BeaconMeasurementSource
}

public struct BeaconSourceMeasurement {
    public var distanceMeters: Double
    public var quality: Float
    public var rssi: Int
    public var lastSeenAt: TimeInterval
}

public struct BeaconMeasurementSelection {
    let beaconName: String
    public let source: BeaconMeasurementSource
    public let measurement: BeaconSourceMeasurement
}

/// Haelt pro (Beacon, Quelle) Kalman-Filter und letzte Messung und entscheidet je Tick,
/// welche Quelle ein Beacon liefert: Ranging solange es juenger als das Stale-Alter ist,
/// sonst RSSI. Callbacks speichern nur; geloest wird ausschliesslich ueber `solveTick`.
public final class BeaconMeasurementStore {
    private let config: BeaconPositioningConfig

    private var anchors: [String: SIMD2<Float>] = [:]
    private var filters: [BeaconSourceKey: KalmanFilter] = [:]
    private var measurements: [BeaconSourceKey: BeaconSourceMeasurement] = [:]

    /// Ranging-Callbacks seit dem letzten Tick (nur Diagnose / Test des Vertrags).
    private(set) var callbacksSinceLastTick = 0
    /// Anzahl der Loesungen; wird nur von `solveTick` erhoeht.
    private(set) var solveCount = 0

    public init(config: BeaconPositioningConfig) {
        self.config = config
    }

    // MARK: - Layout

    /// Legt fuer jeden Beacon beide Filter lazy an und verwirft Filter/Messungen entfernter Beacons.
    public func syncBeacons(_ beacons: [(name: String, point: SIMD2<Float>)]) {
        var updatedAnchors: [String: SIMD2<Float>] = [:]
        var updatedFilters: [BeaconSourceKey: KalmanFilter] = [:]
        var updatedMeasurements: [BeaconSourceKey: BeaconSourceMeasurement] = [:]

        for beacon in beacons {
            updatedAnchors[beacon.name] = beacon.point
            for source in BeaconMeasurementSource.allCases {
                let key = BeaconSourceKey(beaconName: beacon.name, source: source)
                updatedFilters[key] = filters[key] ?? KalmanFilter(processNoise: 0.02, measurementNoise: 4.0)
                updatedMeasurements[key] = measurements[key]
            }
        }

        anchors = updatedAnchors
        filters = updatedFilters
        measurements = updatedMeasurements
    }

    public func clearMeasurements() {
        measurements.removeAll()
        for filter in filters.values {
            filter.reset()
        }
        callbacksSinceLastTick = 0
    }

    // MARK: - Recording (kein Loesen)

    /// Speichert eine Ranging-Messung. Gueltig nur mit negativem RSSI und endlicher,
    /// positiver Accuracy; ungueltige Callbacks gelten nicht als frisch.
    /// Liefert die gefilterte Distanz oder `nil` bei ungueltigem Callback.
    @discardableResult
    public func recordRanging(
        beaconName: String,
        accuracy: Double,
        rssi: Int,
        quality: Float,
        timestamp: TimeInterval
    ) -> Double? {
        callbacksSinceLastTick += 1
        let key = BeaconSourceKey(beaconName: beaconName, source: .ranging)
        guard filters[key] != nil, accuracy.isFinite, accuracy > 0, rssi < 0 else {
            return nil
        }

        let bounded = min(
            Double(config.maxDistanceMeters),
            max(Double(config.minDistanceMeters), accuracy)
        )
        let filtered = filters[key]?.filter(bounded) ?? bounded
        let clamped = min(
            Double(config.maxDistanceMeters),
            max(Double(config.minDistanceMeters), filtered)
        )
        measurements[key] = BeaconSourceMeasurement(
            distanceMeters: clamped,
            quality: quality,
            rssi: rssi,
            lastSeenAt: timestamp
        )
        return clamped
    }

    /// RSSI-Samples eines Beacons werden nur verarbeitet, solange kein frisches Ranging vorliegt.
    func shouldUseRSSI(for beaconName: String, at timestamp: TimeInterval) -> Bool {
        !hasFreshMeasurement(beaconName: beaconName, source: .ranging, at: timestamp)
    }

    /// Speichert eine RSSI-basierte Messung; `rawDistance` wird durch den RSSI-Filter
    /// dieses Beacons geglaettet. Liefert die gefilterte Distanz.
    @discardableResult
    func recordRSSI(
        beaconName: String,
        rawDistance: Double,
        rssi: Int,
        quality: Float,
        timestamp: TimeInterval
    ) -> Double {
        let key = BeaconSourceKey(beaconName: beaconName, source: .rssi)
        let filtered = filters[key]?.filter(rawDistance) ?? rawDistance
        measurements[key] = BeaconSourceMeasurement(
            distanceMeters: filtered,
            quality: quality,
            rssi: rssi,
            lastSeenAt: timestamp
        )
        return filtered
    }

    // MARK: - Selection

    func hasFreshMeasurement(
        beaconName: String,
        source: BeaconMeasurementSource,
        at timestamp: TimeInterval
    ) -> Bool {
        guard let measurement = measurements[BeaconSourceKey(beaconName: beaconName, source: source)] else {
            return false
        }
        return timestamp - measurement.lastSeenAt < config.staleMeasurementSeconds
    }

    func measurement(beaconName: String, source: BeaconMeasurementSource) -> BeaconSourceMeasurement? {
        measurements[BeaconSourceKey(beaconName: beaconName, source: source)]
    }

    /// Ranging, solange frisch; sonst RSSI, solange frisch; sonst keine Messung.
    public func selection(for beaconName: String, at timestamp: TimeInterval) -> BeaconMeasurementSelection? {
        for source in [BeaconMeasurementSource.ranging, .rssi] {
            if hasFreshMeasurement(beaconName: beaconName, source: source, at: timestamp),
               let measurement = measurement(beaconName: beaconName, source: source) {
                return BeaconMeasurementSelection(beaconName: beaconName, source: source, measurement: measurement)
            }
        }
        return nil
    }

    /// Verwirft veraltete Messungen und setzt den zugehoerigen Filter zurueck.
    func expireStaleMeasurements(at timestamp: TimeInterval) {
        for (key, measurement) in measurements
        where timestamp - measurement.lastSeenAt >= config.staleMeasurementSeconds {
            measurements[key] = nil
            filters[key]?.reset()
        }
    }

    /// Eingang des Solvers: eine Messung pro Beacon aus der gewaehlten Quelle.
    func activeMeasurements(at timestamp: TimeInterval) -> [BeaconAnchorMeasurement] {
        anchors.keys.sorted().compactMap { name in
            guard let anchor = anchors[name],
                  let selected = selection(for: name, at: timestamp) else {
                return nil
            }
            let measurement = selected.measurement
            guard measurement.distanceMeters > 0,
                  measurement.distanceMeters < Double(config.maxDistanceMeters),
                  measurement.quality > 0 else {
                return nil
            }
            return BeaconAnchorMeasurement(
                beaconName: name,
                anchorPoint: anchor,
                distanceMeters: Float(measurement.distanceMeters),
                quality: measurement.quality,
                ageSeconds: Float(timestamp - measurement.lastSeenAt)
            )
        }
    }

    // MARK: - Tick

    /// Genau eine Loesung pro Tick, unabhaengig davon, wie viele Callbacks eintrafen.
    func solveTick<Result>(
        at timestamp: TimeInterval,
        _ solve: ([BeaconAnchorMeasurement]) -> Result
    ) -> Result {
        expireStaleMeasurements(at: timestamp)
        solveCount += 1
        callbacksSinceLastTick = 0
        return solve(activeMeasurements(at: timestamp))
    }
}
