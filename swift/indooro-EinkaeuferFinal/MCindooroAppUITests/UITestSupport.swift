import XCTest

/// Gemeinsamer Helfer der Pilot-UI-Tests (add-ios-pilot-ui-tests).
///
/// Die Tests laufen gegen `scripts/dev/mock_mobile_api.py` mit `MOCK_DATASET=ui-test-store` auf
/// 127.0.0.1:18090 (siehe `scripts/ios/run-ui-tests.sh`). Die App startet mit `-uiTesting`
/// (Modus „Ohne Ortung“, keine Standortabfrage) und leerer Einkaufsliste.
/// Gewartet wird nur ueber `waitForExistence` / `waitForNonExistence`, nie ueber Sleeps.
enum UITestSupport {
    static let mockAPIBase = "http://127.0.0.1:18090/api"
    /// Nicht erreichbarer Port fuer den Offline-Start.
    static let unreachableAPIBase = "http://127.0.0.1:9/api"

    static let timeout: TimeInterval = 15

    static let storeName = "UI-Testmarkt"
    static let storeName2 = "UI-Testmarkt 2"
    static let storeCode = "UITEST-001"
    static let storeCode2 = "UITEST-002"

    static let searchPlaceholder = "Was möchtest du kaufen?"
    static let milkShelfLabel = "Gang 2 – Molkereiprodukte"
    /// Alle Regalbeschriftungen des ui-test-store-Layouts (fuer Stoppnamen).
    static let shelfLabels: Set<String> = [
        "Gang 1 – Obst & Gemüse",
        "Gang 2 – Molkereiprodukte",
        "Gang 3 – Brot & Backwaren",
        "Gang 1 – Tiefkühlprodukte",
        "Gang 2 – Konserven & Saucen",
        "Gang 3 – Getränke",
    ]

    /// Startet die App mit dem Test-Launch-Zustand. `apiBase` ueberschreibt die API-Basis.
    /// `studyMode` schaltet im DEBUG-Build die Testleitung (INDOORO_STUDY_MODE=1) ein.
    static func launchApp(apiBase: String = mockAPIBase, studyMode: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-uiTesting",
            // Argument-Domain ueberdeckt den gespeicherten Zustand: leere Liste, keine aktive Tour.
            "-shoppingListStore.v1", "",
            "-shoppingSession.activeListID", "",
            // Die Einführung beim ersten Start (prepare-pilot-ios-build 5.5) würde die Tab-Leiste verdecken.
            "-IndooroIntroductionCompleted", "YES",
        ]
        app.launchEnvironment["INDOORO_API_BASE_URL"] = apiBase
        if studyMode {
            app.launchEnvironment["INDOORO_STUDY_MODE"] = "1"
        }
        app.launch()
        return app
    }

    /// Prueft vor jedem Test, dass der Mock antwortet und der ui-test-store-Datensatz geladen ist.
    /// Wirft mit einer klaren Meldung, falls nicht (dann laeuft z. B. der Default-Datensatz oder gar nichts).
    static func assertMockAvailable() throws {
        guard let url = URL(string: mockAPIBase + "/mobile/stores") else {
            throw SetupError("Mock-URL ungueltig: \(mockAPIBase)")
        }
        let semaphore = DispatchSemaphore(value: 0)
        var responseBody: Data?
        var statusCode = 0
        var transportError: Error?
        URLSession.shared.dataTask(with: URLRequest(url: url, timeoutInterval: 5)) { data, response, error in
            responseBody = data
            statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            transportError = error
            semaphore.signal()
        }.resume()
        guard semaphore.wait(timeout: .now() + 10) == .success else {
            throw SetupError("Mock antwortet nicht unter \(mockAPIBase). Starte ihn mit: MOCK_DATASET=ui-test-store python3 scripts/dev/mock_mobile_api.py")
        }
        if let transportError {
            throw SetupError("Mock nicht erreichbar unter \(mockAPIBase): \(transportError.localizedDescription). Starte ihn mit: MOCK_DATASET=ui-test-store python3 scripts/dev/mock_mobile_api.py")
        }
        let body = responseBody.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        guard statusCode == 200, body.contains("\"\(storeCode)\"") else {
            throw SetupError("Mock läuft mit dem falschen Datensatz (HTTP \(statusCode), kein Store \(storeCode)). Starte ihn mit MOCK_DATASET=ui-test-store.")
        }
    }

    /// Erlaubt im Simulator den Kamera-Systemdialog (nur wenn er erscheint).
    static func registerCameraPermissionMonitor(for test: XCTestCase) {
        test.addUIInterruptionMonitor(withDescription: "Kamera-Berechtigung") { alert -> Bool in
            let label = alert.label
            guard label.contains("Kamera") || label.contains("Camera") else { return false }
            for title in ["Erlauben", "Allow", "OK"] where alert.buttons[title].exists {
                alert.buttons[title].tap()
                return true
            }
            return false
        }
    }

    /// Oeffnet die Karte, waehlt den Store ueber seine Filialkarte und wartet, bis das Layout steht.
    static func openStoreLayout(in app: XCUIApplication, storeCode: String = storeCode, headerName: String = storeName) {
        openTab("Karte", in: app)
        let card = app.buttons.matching(identifier: "storeCard-\(storeCode)").firstMatch
        if !card.waitForExistence(timeout: timeout) {
            // Diagnose: Screenshot und Hierarchie des Karte-Tabs festhalten.
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = "karte-ohne-filialkarte"
            shot.lifetime = .keepAlways
            XCTContext.runActivity(named: "Diagnose Karte ohne Filialkarte") { $0.add(shot) }
            print("DIAG karte-ohne-filialkarte:\n\(app.debugDescription)")
            XCTFail("Filialkarte \(storeCode) erscheint nicht (Mock läuft?)")
            return
        }
        card.tap()
        XCTAssertTrue(storeMap(in: app).waitForExistence(timeout: timeout), "Karte mit Layout erscheint nicht")
        XCTAssertTrue(app.staticTexts[headerName].waitForExistence(timeout: timeout), "Kopfzeile \(headerName) fehlt")
        XCTAssertTrue(card.waitForNonExistence(timeout: timeout), "Filialübersicht bleibt sichtbar")
    }

    /// Zeigt die Karte schon das Layout, passiert nichts; zeigt sie die Filialuebersicht, wird die Filialkarte getippt.
    static func openStoreIfOverviewShown(in app: XCUIApplication, storeCode: String = storeCode) {
        let card = app.buttons.matching(identifier: "storeCard-\(storeCode)").firstMatch
        let map = storeMap(in: app)
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if map.exists { return }
            if card.exists {
                card.tap()
                XCTAssertTrue(map.waitForExistence(timeout: timeout), "Karte mit Layout erscheint nicht")
                return
            }
            _ = map.waitForExistence(timeout: 0.5)
        }
        XCTFail("Weder Layout noch Filialkarte \(storeCode) sichtbar")
    }

    static func openTab(_ name: String, in app: XCUIApplication) {
        dismissKeyboardIfShown(in: app)
        let tab = app.tabBars.buttons[name]
        XCTAssertTrue(tab.waitForExistence(timeout: timeout), "Tab „\(name)“ fehlt")
        tab.tap()
    }

    /// Die Tab-Leiste liegt unter der Tastatur; ein Tap darauf wuerde Tasten treffen.
    static func dismissKeyboardIfShown(in app: XCUIApplication) {
        let keyboard = app.keyboards.firstMatch
        guard keyboard.exists else { return }
        for key in ["Suchen", "Search", "Return", "Fertig", "Done"] where keyboard.buttons[key].exists {
            keyboard.buttons[key].tap()
            break
        }
        _ = keyboard.waitForNonExistence(timeout: timeout)
    }

    static func storeMap(in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: "storeMap").firstMatch
    }

    static func positionBanner(in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: "positionBanner").firstMatch
    }

    /// Ersetzt den Inhalt eines Textfelds (leert zuerst per Loeschtaste).
    static func replaceText(in field: XCUIElement, with text: String) {
        field.tap()
        let current = (field.value as? String) ?? ""
        if !current.isEmpty, current != searchPlaceholder {
            field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
        }
        if !text.isEmpty {
            field.typeText(text)
        }
    }

    /// Sucht in der Planung nach `query` und plant das erste Ergebnis ein.
    static func searchAndPlanFirstResult(_ query: String, in app: XCUIApplication) {
        openTab("Planung", in: app)
        let field = app.textFields[searchPlaceholder]
        XCTAssertTrue(field.waitForExistence(timeout: timeout), "Suchfeld der Planung fehlt")
        replaceText(in: field, with: query)
        let addButton = app.buttons["Einplanen"].firstMatch
        XCTAssertTrue(addButton.waitForExistence(timeout: timeout), "Keine Suchtreffer für „\(query)“")
        addButton.tap()
    }

    /// Oeffnet den QR-Scanner (DEBUG-Fallback ohne Kamera) und liefert das Feld „Payload einfügen“.
    static func openScannerPayloadField(in app: XCUIApplication) -> XCUIElement {
        let scanButton = app.buttons["QR-Code scannen"].firstMatch
        XCTAssertTrue(scanButton.waitForExistence(timeout: timeout), "Schaltfläche „QR-Code scannen“ fehlt")
        scanButton.tap()

        let field = app.descendants(matching: .any).matching(identifier: "debugPayloadField").firstMatch
        // Der Kamera-Systemdialog wird erst bei der naechsten Interaktion behandelt.
        for _ in 0..<3 where !field.waitForExistence(timeout: 3) {
            app.tap()
        }
        XCTAssertTrue(field.exists, "Payload-Feld des Scanners fehlt (Kamera-Fallback nicht sichtbar)")
        return field
    }

    /// Gibt einen Anker-Payload in den Scanner-Fallback ein und übernimmt ihn.
    static func submitScannerPayload(_ payload: String, in app: XCUIApplication) {
        let field = openScannerPayloadField(in: app)
        replaceText(in: field, with: payload)
        let apply = app.buttons["Übernehmen"].firstMatch
        XCTAssertTrue(apply.waitForExistence(timeout: timeout), "Schaltfläche „Übernehmen“ fehlt")
        apply.tap()
    }
}

struct SetupError: LocalizedError {
    let errorDescription: String?

    init(_ message: String) {
        errorDescription = message
    }
}
