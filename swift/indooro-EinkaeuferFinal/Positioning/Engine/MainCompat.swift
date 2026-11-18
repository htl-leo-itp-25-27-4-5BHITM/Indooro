import Foundation

// Glue between the engine core (copied from `postpilot/ios-architecture`) and the navigation sources on `main`.
// On the postpilot branch `BeaconMeasurementStore.activeMeasurementCount(at:)` is part of the `IndooroNavigation`
// package target. Here it is an extension, so no file under `indooroApp/` has to change.
extension BeaconMeasurementStore {
    /// Number of beacons with a valid, fresh measurement (display and tests).
    func activeMeasurementCount(at timestamp: TimeInterval) -> Int {
        activeMeasurements(at: timestamp).count
    }
}
