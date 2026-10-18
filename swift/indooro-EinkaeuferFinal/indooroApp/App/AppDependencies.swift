import Foundation
import IndooroNetworking
import IndooroPersistence
import IndooroPositioning
import SwiftUI

/// Abhaengigkeiten der App hinter Protokollen (design.md D2, `AppEnvironment` des Entwurfs).
/// Der Name `AppDependencies` vermeidet die Kollision mit dem Konfigurations-Namensraum `AppEnvironment`
/// (Feature-Profil, API-URL, Schalter), den auch `IndooroPilotSupport` und dessen Tests verwenden;
/// die Umbenennung folgt, sobald die Pilot-Linie gemergt ist.
/// Varianten: `.live`, `.preview` und `.test(...)`.
struct AppDependencies: Sendable {
    var apiClient: any APIClientProtocol
    var layoutCache: LayoutCacheStore
    var clock: any PositioningClock
    /// Fabriken statt Instanzen: Funk- und Sensor-Adapter entstehen erst, wenn die Ortung sie braucht
    /// (CoreLocation und CoreBluetooth fragen sonst beim Erzeugen Berechtigungen an).
    var makeBeaconRadio: @MainActor @Sendable () -> any BeaconRadio
    var makeHeadingProvider: @MainActor @Sendable () -> any HeadingProvider
    var makeMotionProvider: @MainActor @Sendable () -> any MotionProvider

    static var live: AppDependencies {
        AppDependencies(
            apiClient: AppEnvironment.apiClient,
            layoutCache: LayoutCacheStore(),
            clock: SystemPositioningClock(),
            makeBeaconRadio: { CoreLocationBeaconRadio() },
            makeHeadingProvider: { CoreLocationHeadingProvider() },
            makeMotionProvider: { CoreMotionStepProvider() }
        )
    }

    /// Fuer Vorschauen und Tests ohne Funk, Netz und Dateizugriff ausserhalb eines temporaeren Ordners.
    static func test(
        apiClient: any APIClientProtocol,
        layoutCache: LayoutCacheStore,
        clock: any PositioningClock = SystemPositioningClock(),
        radio: any BeaconRadio,
        heading: any HeadingProvider,
        motion: any MotionProvider
    ) -> AppDependencies {
        AppDependencies(
            apiClient: apiClient,
            layoutCache: layoutCache,
            clock: clock,
            makeBeaconRadio: { radio },
            makeHeadingProvider: { heading },
            makeMotionProvider: { motion }
        )
    }
}

private struct SilentAPIClient: APIClientProtocol {
    func send<E: Endpoint>(_ endpoint: E) async throws(APIError) -> E.Response {
        throw .offline
    }

    func fire<E: Endpoint>(_ endpoint: E) async {}
}

private struct IdleRadio: BeaconRadio {
    func samples() -> AsyncStream<BeaconSample> { AsyncStream { $0.finish() } }
    func status() -> AsyncStream<RadioStatus> { AsyncStream { $0.finish() } }
    func start(constraints: [BeaconConstraint]) async {}
    func stop() async {}
}

private struct IdleHeading: HeadingProvider {
    func headings() -> AsyncStream<HeadingSample> { AsyncStream { $0.finish() } }
    func start() async {}
    func stop() async {}
}

private struct IdleMotion: MotionProvider {
    func steps() -> AsyncStream<StepSample> { AsyncStream { $0.finish() } }
    func start() async {}
    func stop() async {}
}

extension AppDependencies {
    /// Vorschau: offline, ohne Funkmodul und mit einem Layout-Cache in einem temporaeren Ordner.
    static var preview: AppDependencies {
        .test(
            apiClient: SilentAPIClient(),
            layoutCache: LayoutCacheStore(
                directory: FileManager.default.temporaryDirectory.appendingPathComponent("indooro-preview-cache")
            ),
            radio: IdleRadio(),
            heading: IdleHeading(),
            motion: IdleMotion()
        )
    }
}

private struct AppDependenciesKey: EnvironmentKey {
    static let defaultValue = AppDependencies.live
}

extension EnvironmentValues {
    var appDependencies: AppDependencies {
        get { self[AppDependenciesKey.self] }
        set { self[AppDependenciesKey.self] = newValue }
    }
}
