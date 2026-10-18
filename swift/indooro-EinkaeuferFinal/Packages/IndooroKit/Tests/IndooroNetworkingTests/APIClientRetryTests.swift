import XCTest
@testable import IndooroNetworking

/// Task 6.3: Wiederholung, Fehlerabbildung und Abbruch des `APIClient` mit `StubURLProtocol`.
final class APIClientRetryTests: XCTestCase {
    override func tearDown() {
        StubRegistry.script = nil
        super.tearDown()
    }

    /// Echte Store-Antwort aus den Fixtures (4 Filialen).
    private func storesJSON() throws -> Data {
        try fixtureData("stores.json")
    }

    // MARK: - Wiederholung

    func testServiceUnavailableThenSuccessRetriesOnce() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 503), .respond(status: 200, body: try storesJSON())])
        let sleeper = RecordingSleeper()
        let client = StubClient.make(script: script, sleeper: sleeper)

        let stores = try await client.send(ListStoresEndpoint())

        XCTAssertEqual(stores.count, 4)
        XCTAssertEqual(script.requestCount, 2)
        let durations = await sleeper.durations
        XCTAssertEqual(durations, [.milliseconds(500)])
    }

    func testGatewayErrorsAreRetriedUpToTwoTimes() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 502), .respond(status: 504), .respond(status: 200, body: try storesJSON())])
        let sleeper = RecordingSleeper()
        let client = StubClient.make(script: script, sleeper: sleeper)

        _ = try await client.send(ListStoresEndpoint())

        XCTAssertEqual(script.requestCount, 3)
        let durations = await sleeper.durations
        XCTAssertEqual(durations, [.milliseconds(500), .milliseconds(1000)])
    }

    func testTimeoutIsRetriedThenThrowsTransportTimedOut() async throws {
        let script = StubScript()
        script.enqueue([.fail(.timedOut), .fail(.timedOut), .fail(.timedOut)])
        let client = StubClient.make(script: script)

        await assertThrows(.transport(.timedOut)) {
            _ = try await client.send(ListStoresEndpoint())
        }
        XCTAssertEqual(script.requestCount, 3, "Erstversuch plus zwei Wiederholungen")
    }

    func testConnectionLostIsRetried() async throws {
        let script = StubScript()
        script.enqueue([.fail(.networkConnectionLost), .respond(status: 200, body: try storesJSON())])
        let client = StubClient.make(script: script)

        _ = try await client.send(ListStoresEndpoint())

        XCTAssertEqual(script.requestCount, 2)
    }

    func testCannotConnectToHostIsRetriedThenSucceeds() async throws {
        let script = StubScript()
        script.enqueue([.fail(.cannotConnectToHost), .respond(status: 200, body: try storesJSON())])
        let client = StubClient.make(script: script)

        _ = try await client.send(ListStoresEndpoint())

        XCTAssertEqual(script.requestCount, 2)
    }

    func testBackoffJitterIsAddedButCapped() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 503), .respond(status: 200, body: try storesJSON())])
        let sleeper = RecordingSleeper()
        let environment = StubClient.environment
        let session = URLSession(configuration: environment.makeSessionConfiguration(additionalProtocolClasses: [StubURLProtocol.self]))
        StubRegistry.script = script
        // Jitter-Quelle liefert die Obergrenze; der Client muss sie auf 250 ms begrenzen.
        let client = APIClient(environment: environment, session: session, sleeper: sleeper, jitter: { $0 * 10 })

        _ = try await client.send(ListStoresEndpoint())

        let durations = await sleeper.durations
        XCTAssertEqual(durations, [.milliseconds(750)], "0,5 s plus Jitter, begrenzt auf 0,25 s")
    }

    // MARK: - Keine Wiederholung

    func testOfflineIsNotRetried() async throws {
        let script = StubScript()
        script.enqueue([.fail(.notConnectedToInternet)])
        let sleeper = RecordingSleeper()
        let client = StubClient.make(script: script, sleeper: sleeper)

        await assertThrows(.offline) {
            _ = try await client.send(ListStoresEndpoint())
        }
        XCTAssertEqual(script.requestCount, 1)
        let durations = await sleeper.durations
        XCTAssertTrue(durations.isEmpty)
    }

    func testTooManyRequestsIsNotRetried() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 429, body: Data(#"{"error":"Zu viele Anfragen."}"#.utf8))])
        let client = StubClient.make(script: script)

        await assertThrows(.http(status: 429, message: "Zu viele Anfragen.")) {
            _ = try await client.send(ListStoresEndpoint())
        }
        XCTAssertEqual(script.requestCount, 1)
    }

    func testNotFoundIsNotRetriedAndKeepsBackendMessage() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 404, body: Data(#"{"status":404,"error":"Filiale nicht gefunden.","method":"GET","path":"api/mobile/stores/x"}"#.utf8))])
        let client = StubClient.make(script: script)

        await assertThrows(.http(status: 404, message: "Filiale nicht gefunden.")) {
            _ = try await client.send(ListStoresEndpoint())
        }
        XCTAssertEqual(script.requestCount, 1)
    }

    func testNotFoundWithoutJSONBodyHasNoMessage() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 404, body: Data("<html>not found</html>".utf8))])
        let client = StubClient.make(script: script)

        await assertThrows(.http(status: 404, message: nil)) {
            _ = try await client.send(ListStoresEndpoint())
        }
    }

    func testPostIsNeverRetried() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 503), .respond(status: 200, body: Data("{}".utf8))])
        let client = StubClient.make(script: script)

        await assertThrows(.http(status: 503, message: nil)) {
            _ = try await client.send(UpsellPlanEndpoint(request: .sample))
        }
        XCTAssertEqual(script.requestCount, 1)
    }

    func testMalformedBodyIsDecodingErrorWithoutRetry() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 200, body: Data("kein json".utf8))])
        let client = StubClient.make(script: script)

        do {
            _ = try await client.send(ListStoresEndpoint())
            XCTFail("Dekodierfehler erwartet")
        } catch let error as APIError {
            guard case .decoding = error else {
                return XCTFail("Erwartet .decoding, erhalten \(error)")
            }
        }
        XCTAssertEqual(script.requestCount, 1)
    }

    // MARK: - Abbruch

    func testCancellationMapsToCancelled() async throws {
        let script = StubScript()
        script.enqueue([.hang])
        let client = StubClient.make(script: script)

        let task = Task { try await client.send(ListStoresEndpoint()) }
        try await waitUntil { script.requestCount == 1 }
        task.cancel()

        do {
            _ = try await task.value
            XCTFail("Abbruch erwartet")
        } catch let error as APIError {
            XCTAssertEqual(error, .cancelled)
        }
    }

    func testCancellationDuringBackoffMapsToCancelled() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 503)])
        let client = StubClient.make(script: script, sleeper: CancellingSleeper())

        await assertThrows(.cancelled) {
            _ = try await client.send(ListStoresEndpoint())
        }
        XCTAssertEqual(script.requestCount, 1)
    }

    // MARK: - Anfrageform

    func testRequestCarriesAcceptLanguageAndNoAuthorization() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 200, body: try storesJSON())])
        let client = StubClient.make(script: script)

        _ = try await client.send(ListStoresEndpoint())

        let request = try XCTUnwrap(script.recordedRequests.first)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept-Language"), "de-AT")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertEqual(request.timeoutInterval, 15)
    }

    func testFireSwallowsErrorsAndDoesNotRetryPost() async throws {
        let script = StubScript()
        script.enqueue([.respond(status: 503)])
        let client = StubClient.make(script: script)

        await client.fire(UpsellEventEndpoint(event: .sample))

        XCTAssertEqual(script.requestCount, 1)
    }

    // MARK: - Helfer

    private func assertThrows(_ expected: APIError, file: StaticString = #filePath, line: UInt = #line, _ operation: () async throws -> Void) async {
        do {
            try await operation()
            XCTFail("APIError \(expected) erwartet", file: file, line: line)
        } catch let error as APIError {
            XCTAssertEqual(error, expected, file: file, line: line)
        } catch {
            XCTFail("Unerwarteter Fehlertyp: \(error)", file: file, line: line)
        }
    }

    private func waitUntil(timeout: Duration = .seconds(2), file: StaticString = #filePath, line: UInt = #line, _ condition: () -> Bool) async throws {
        let deadline = ContinuousClock.now.advanced(by: timeout)
        while !condition() {
            if ContinuousClock.now > deadline {
                XCTFail("Bedingung nicht innerhalb von \(timeout) erreicht", file: file, line: line)
                throw CancellationError()
            }
            try await Task.sleep(for: .milliseconds(5))
        }
    }
}

/// Sleeper, dessen Warten durch Abbruch endet (simuliert Task-Cancellation waehrend des Backoffs).
private struct CancellingSleeper: RetrySleeper {
    func sleep(for duration: Duration) async throws {
        throw CancellationError()
    }
}
