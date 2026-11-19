import XCTest
import IndooroNavigation
import IndooroPositioning
@testable import MCindooroApp

/// Schattenmodus ist reine Aufzeichnung: Navigation bleibt beim alten Pfad, ohne Schalter startet keine Engine.
@MainActor
final class ShadowModeTests: XCTestCase {
    func testFlagsOffStartNoShadowEngine() {
        let manager = BeaconManager(dependencies: .preview, shadowEnabled: false, engineDrivesNavigation: false)
        XCTAssertFalse(manager.hasShadowEngine)
        XCTAssertNil(manager.positionSnapshots())
    }

    func testEngineFlagWithoutShadowStartsNoEngine() {
        let manager = BeaconManager(dependencies: .preview, shadowEnabled: false, engineDrivesNavigation: true)
        XCTAssertFalse(manager.hasShadowEngine)
        XCTAssertNil(manager.positionSnapshots())
    }

    func testShadowOnKeepsNavigationOnLegacySamples() {
        let manager = BeaconManager(dependencies: .preview, shadowEnabled: true, engineDrivesNavigation: false)
        XCTAssertTrue(manager.hasShadowEngine)
        XCTAssertNil(manager.positionSnapshots(), "Schattenmodus allein darf die Route nicht auf die Engine umstellen")
        let session = NavigationSession()
        session.attach(to: manager)
        XCTAssertFalse(session.isUsingEngineSnapshots)
    }

    func testExplicitEngineFlagSwitchesNavigationToSnapshots() {
        let manager = BeaconManager(dependencies: .preview, shadowEnabled: true, engineDrivesNavigation: true)
        XCTAssertNotNil(manager.positionSnapshots())
        let session = NavigationSession()
        session.attach(to: manager)
        XCTAssertTrue(session.isUsingEngineSnapshots)
    }

    func testShadowRecordCarriesBothSides() {
        let snapshot = PositionSnapshot(
            sequence: 1, timestamp: 5, layoutRevision: 1, status: .tracking,
            displayedPoint: SIMD2(4.5, 7.5), confidence: 0.75
        )
        let record = ShadowPositioning.shadowRecord(
            snapshot: snapshot, legacy: ShadowSide(x: 4, y: 7, status: "tracking"), at: 100
        )
        XCTAssertEqual(record.t, 100)
        XCTAssertEqual(record.legacy, ShadowSide(x: 4, y: 7, status: "tracking"))
        XCTAssertEqual(record.engine, ShadowSide(x: 4.5, y: 7.5, status: "tracking", confidence: 0.75))
    }
}
