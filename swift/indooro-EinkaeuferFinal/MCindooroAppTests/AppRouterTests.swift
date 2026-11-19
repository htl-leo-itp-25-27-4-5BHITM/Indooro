import IndooroModels
import IndooroNetworking
import IndooroPositioning
import XCTest
@testable import MCindooroApp

/// Task 10.1: `AppRouter` (Reiter und Querreiter-Zustand) und `AppDependencies`.
@MainActor
final class AppRouterTests: XCTestCase {
    func testStartsOnStartTab() {
        XCTAssertEqual(AppRouter().selectedSection, .start)
    }

    func testOpenSwitchesTab() {
        let router = AppRouter()
        router.open(.planning)
        XCTAssertEqual(router.selectedSection, .planning)
        router.open(.shopping)
        XCTAssertEqual(router.selectedSection, .shopping)
    }

    func testShowOnMapSetsTargetAndOpensMap() {
        let router = AppRouter()
        let product = Product(id: 7, name: "Milch", price: 1.2, layoutCode: "310/1")
        router.showOnMap(product)
        XCTAssertEqual(router.targetProduct, product)
        XCTAssertEqual(router.selectedSection, .map)
    }

    func testShoppingSessionMapClearsTargetAndRequestsLastStoreLayout() {
        let router = AppRouter()
        router.showOnMap(Product(id: 1, name: "A", price: 1, layoutCode: "1/1"))
        router.openMapForShoppingSession()
        XCTAssertNil(router.targetProduct)
        XCTAssertNotNil(router.pendingLastStoreLayoutOpenRequest)
        XCTAssertEqual(router.selectedSection, .map)
    }

    func testFailedTransferKeepsMessageAndOpensShoppingTab() {
        struct Boom: LocalizedError { var errorDescription: String? { "kaputt" } }
        let router = AppRouter()
        router.receiveShoppingTransfer(.failure(Boom()))
        XCTAssertNil(router.pendingShoppingImportPackage)
        XCTAssertEqual(router.shoppingImportErrorMessage, "kaputt")
        XCTAssertEqual(router.selectedSection, .shopping)
    }

    func testPreviewDependenciesAreOfflineAndIdle() async {
        let dependencies = AppDependencies.preview
        let radio = dependencies.makeBeaconRadio()
        var iterator = radio.samples().makeAsyncIterator()
        let sample = await iterator.next()
        XCTAssertNil(sample)

        let result = await dependencies.apiClient.sendResult(CurrentLayoutEndpoint())
        guard case .failure(.offline) = result else { return XCTFail("Erwartet offline, erhalten \(result)") }
    }
}
