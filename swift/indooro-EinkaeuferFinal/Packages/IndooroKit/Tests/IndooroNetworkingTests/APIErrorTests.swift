import XCTest
@testable import IndooroNetworking

/// Fehlerabbildung, deutsche Nutzertexte und Wiederholungsregeln.
final class APIErrorTests: XCTestCase {
    // MARK: - Texte

    func testMessagesMatchExistingAppTexts() {
        XCTAssertEqual(APIError.offline.message, "Die Verbindung zum Server ist nicht verfügbar.")
        XCTAssertEqual(APIError.transport(.timedOut).message, "Die Anfrage hat zu lange gedauert.")
        XCTAssertEqual(APIError.transport(.cannotConnectToHost).message, "Die Verbindung zum Server ist nicht verfügbar.")
        XCTAssertEqual(APIError.decoding("x").message, "Die Antwort des Servers konnte nicht gelesen werden.")
        XCTAssertEqual(APIError.cancelled.message, "Die Anfrage wurde abgebrochen.")
    }

    func testHTTPMessageUsesBackendTextOrStatusFallback() {
        XCTAssertEqual(APIError.http(status: 404, message: "Filiale nicht gefunden.").message, "Filiale nicht gefunden.")
        XCTAssertEqual(APIError.http(status: 500, message: nil).message, "Der Server meldet einen Fehler (HTTP 500).")
        XCTAssertEqual(APIError.http(status: 502, message: "").message, "Der Server meldet einen Fehler (HTTP 502).")
    }

    func testMessagesContainUmlauts() {
        XCTAssertFalse(APIError.offline.message.contains("ue"), "Umlaute statt ASCII-Umschrift")
        XCTAssertTrue(APIError.cancelled.message.contains("abgebrochen"))
    }

    // MARK: - Abbildung von Transportfehlern

    func testURLErrorMapping() {
        XCTAssertEqual(APIError(transportError: URLError(.notConnectedToInternet)), .offline)
        XCTAssertEqual(APIError(transportError: URLError(.cancelled)), .cancelled)
        XCTAssertEqual(APIError(transportError: URLError(.timedOut)), .transport(.timedOut))
        XCTAssertEqual(APIError(transportError: URLError(.networkConnectionLost)), .transport(.networkConnectionLost))
    }

    func testCancellationErrorMapsToCancelled() {
        XCTAssertEqual(APIError(transportError: CancellationError()), .cancelled)
    }

    func testUnknownErrorMapsToTransportUnknown() {
        struct Other: Error {}
        XCTAssertEqual(APIError(transportError: Other()), .transport(.unknown))
    }

    // MARK: - Wiederholungsregel

    func testRetryableClassification() {
        XCTAssertTrue(RetryPolicy.isRetryable(.transport(.timedOut)))
        XCTAssertTrue(RetryPolicy.isRetryable(.transport(.networkConnectionLost)))
        XCTAssertTrue(RetryPolicy.isRetryable(.transport(.cannotConnectToHost)))
        for status in [502, 503, 504] {
            XCTAssertTrue(RetryPolicy.isRetryable(.http(status: status, message: nil)), "\(status)")
        }

        XCTAssertFalse(RetryPolicy.isRetryable(.offline))
        XCTAssertFalse(RetryPolicy.isRetryable(.cancelled))
        XCTAssertFalse(RetryPolicy.isRetryable(.decoding("x")))
        XCTAssertFalse(RetryPolicy.isRetryable(.transport(.badURL)))
        for status in [400, 404, 409, 429, 500] {
            XCTAssertFalse(RetryPolicy.isRetryable(.http(status: status, message: nil)), "\(status)")
        }
    }

    func testBackoffDelaysDoubleAndAddJitterUpToCap() {
        let policy = RetryPolicy.idempotentRead
        XCTAssertEqual(policy.delay(forRetry: 0, jitter: { _ in 0 }), .milliseconds(500))
        XCTAssertEqual(policy.delay(forRetry: 1, jitter: { _ in 0 }), .milliseconds(1000))
        XCTAssertEqual(policy.delay(forRetry: 0, jitter: { $0 }), .milliseconds(750), "Jitter maximal 250 ms")
        XCTAssertEqual(policy.delay(forRetry: 1, jitter: { $0 / 2 }), .milliseconds(1125))
        XCTAssertEqual(policy.delay(forRetry: 0, jitter: { _ in -1 }), .milliseconds(500), "Negativer Jitter wird auf 0 gesetzt")
    }

    func testRetryPolicyPresets() {
        XCTAssertEqual(RetryPolicy.none.maxRetries, 0)
        XCTAssertEqual(RetryPolicy.idempotentRead.maxRetries, 2)
        XCTAssertEqual(RetryPolicy(maxRetries: -3).maxRetries, 0)
    }
}
