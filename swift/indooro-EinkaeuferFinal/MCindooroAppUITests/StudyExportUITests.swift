import XCTest

/// Testleitung: Sitzung anlegen, zwei Aufgaben mit App abschließen, Export vorbereiten
/// (add-ios-pilot-ui-tests 3.5). Geprüft wird nur die Oberfläche; Exportdateien werden nicht ausgewertet.
/// Am Ende werden alle Sitzungen gelöscht, zu Beginn ebenfalls bereinigt, damit der Test wiederholbar ist.
final class StudyExportUITests: XCTestCase {
    private let activeSessionPrefix = "Aktive Sitzung:"
    private let deleteAllTitle = "Alle Sitzungen löschen"
    private let deleteDialogTitle = "Alle Sitzungen löschen?"

    override func setUpWithError() throws {
        continueAfterFailure = false
        try UITestSupport.assertMockAvailable()
    }

    func testSessionWithTwoTasksAndExportPreparation() {
        let app = UITestSupport.launchApp(studyMode: true)

        openStudySheetFromSettings(in: app)
        deleteAllSessionsIfPresent(in: app)

        // Ungültige Test-ID: „Sitzung starten“ bleibt deaktiviert.
        let testId = app.textFields["Test-ID"]
        XCTAssertTrue(testId.waitForExistence(timeout: UITestSupport.timeout), "Feld „Test-ID“ fehlt")
        UITestSupport.replaceText(in: testId, with: "Anna")
        let startSession = app.buttons["Sitzung starten"]
        XCTAssertTrue(startSession.waitForExistence(timeout: UITestSupport.timeout), "„Sitzung starten“ fehlt")
        XCTAssertFalse(startSession.isEnabled, "Die Test-ID „Anna“ darf keine Sitzung starten")

        // Gültige Test-ID: Sitzung starten.
        UITestSupport.replaceText(in: testId, with: "T01")
        dismissKeyboard(in: app)
        startSession.tap()
        XCTAssertTrue(
            app.staticTexts["\(activeSessionPrefix) T01"].waitForExistence(timeout: UITestSupport.timeout),
            "„\(activeSessionPrefix) T01“ erscheint nicht"
        )

        // Zwei Produkte als Aufgaben hinzufügen.
        addTask(number: 1, query: "Frischmilch", product: "Frischmilch 1L", in: app)
        addTask(number: 2, query: "Butter", product: "Butter 250g", in: app)

        // Aufgabe 1 mit App: Ergebnis „Gefunden“.
        startTask(1, in: app)
        finishRunningTask("Gefunden", in: app)
        openStudySheetFromMap(in: app)

        // Aufgabe 2 mit App: Ergebnis „Hilfe gebraucht“.
        startTask(2, in: app)
        finishRunningTask("Hilfe gebraucht", in: app)
        openStudySheetFromMap(in: app)

        // Export vorbereiten: danach erscheint das Teilen-Element. Es wird nicht angetippt.
        scrollUntilHittable(buttons("Export vorbereiten", in: app), "Export vorbereiten", in: app).tap()
        XCTAssertTrue(
            app.buttons["CSV und Ereignisse teilen"].waitForExistence(timeout: UITestSupport.timeout),
            "„CSV und Ereignisse teilen“ erscheint nach „Export vorbereiten“ nicht"
        )

        deleteAllSessions(in: app)
    }

    // MARK: - Navigation

    /// Karte → Einstellungen (Schaltfläche slider.horizontal.3) → Testleitung.
    private func openStudySheetFromSettings(in app: XCUIApplication) {
        UITestSupport.openTab("Karte", in: app)
        let settings = buttons("slider.horizontal.3", in: app)
        XCTAssertTrue(settings.firstMatch.waitForExistence(timeout: UITestSupport.timeout), "Einstellungen (slider.horizontal.3) fehlen auf der Karte")
        hittable(settings).tap()

        let entry = buttons("Testleitung", in: app)
        XCTAssertTrue(entry.firstMatch.waitForExistence(timeout: UITestSupport.timeout), "„Testleitung“ fehlt in den Einstellungen")
        hittable(entry).tap()
        XCTAssertTrue(app.navigationBars["Testleitung"].waitForExistence(timeout: UITestSupport.timeout), "Testleitung öffnet sich nicht")
    }

    /// Nach einem Ergebnis schließt sich die Testleitung; über die Karte öffnet sie sich wieder.
    private func openStudySheetFromMap(in app: XCUIApplication) {
        let entry = buttons("Testleitung", in: app)
        XCTAssertTrue(entry.firstMatch.waitForExistence(timeout: UITestSupport.timeout), "Schaltfläche „Testleitung“ auf der Karte fehlt")
        hittable(entry).tap()
        XCTAssertTrue(app.navigationBars["Testleitung"].waitForExistence(timeout: UITestSupport.timeout), "Testleitung öffnet sich nicht")
    }

    // MARK: - Aufgaben

    /// Sucht über „Produkt suchen“ (Eingabetaste löst die Suche aus) und tippt den Treffer an.
    /// `number` ist die erwartete Aufgabennummer, unter der die Aufgabe danach steht.
    private func addTask(number: Int, query: String, product: String, in app: XCUIApplication) {
        // Das Feld hat keinen Label, sondern nur den Platzhalter „Produkt suchen“ (placeholderValue).
        let field = app.textFields["Produkt suchen"]
        scrollUntilHittable(field, "Produkt suchen", in: app).tap()
        field.typeText(query + "\n")

        XCTAssertTrue(buttons(product, in: app).firstMatch.waitForExistence(timeout: UITestSupport.timeout), "Treffer „\(product)“ erscheint nicht")
        scrollUntilHittable(buttons(product, in: app), product, in: app).tap()

        XCTAssertTrue(
            app.staticTexts["\(number). \(product)"].waitForExistence(timeout: UITestSupport.timeout),
            "Aufgabe „\(number). \(product)“ erscheint nach dem Antippen nicht"
        )
    }

    /// Startet Aufgabe `no` (Schaltfläche study.start.N); die Testleitung schließt sich, die Karte zeigt die Aufgabe.
    private func startTask(_ no: Int, in app: XCUIApplication) {
        scrollUntilHittable(buttons("study.start.\(no)", in: app), "study.start.\(no)", in: app).tap()
        XCTAssertTrue(
            app.navigationBars["Testleitung"].waitForNonExistence(timeout: UITestSupport.timeout),
            "Die Testleitung schließt sich nach dem Start von Aufgabe \(no) nicht"
        )
    }

    /// Ergebnis der laufenden Aufgabe auf der Karte antippen.
    private func finishRunningTask(_ outcome: String, in app: XCUIApplication) {
        let button = app.buttons[outcome].firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: UITestSupport.timeout), "Abschlussknopf „\(outcome)“ fehlt auf der Karte")
        button.tap()
        XCTAssertTrue(button.waitForNonExistence(timeout: UITestSupport.timeout), "„\(outcome)“ bleibt nach dem Tippen sichtbar")
    }

    // MARK: - Aufräumen

    /// Zu Testbeginn: existiert noch eine aktive Sitzung aus einem früheren Lauf, wird alles gelöscht.
    private func deleteAllSessionsIfPresent(in app: XCUIApplication) {
        XCTAssertTrue(app.buttons["Sitzung starten"].waitForExistence(timeout: UITestSupport.timeout), "Testleitung ohne „Sitzung starten“")
        let previousSession = app.staticTexts
            .matching(NSPredicate(format: "label BEGINSWITH %@", activeSessionPrefix))
            .firstMatch
        guard previousSession.exists else { return }
        deleteAllSessions(in: app)
    }

    /// Löscht alle Sitzungen über „Alle Sitzungen löschen“ und bestätigt den Dialog.
    private func deleteAllSessions(in app: XCUIApplication) {
        scrollUntilHittable(buttons(deleteAllTitle, in: app), deleteAllTitle, in: app).tap()

        XCTAssertTrue(
            app.staticTexts[deleteDialogTitle].waitForExistence(timeout: UITestSupport.timeout),
            "Bestätigungsdialog „\(deleteDialogTitle)“ fehlt"
        )
        // Gleiches Label wie die Formular-Schaltfläche; `hittable` nimmt die tippbare, also die des Dialogs.
        let confirm = hittable(buttons(deleteAllTitle, in: app))
        XCTAssertTrue(confirm.waitForExistence(timeout: UITestSupport.timeout), "Bestätigungsschaltfläche fehlt im Dialog")
        confirm.tap()

        XCTAssertTrue(
            app.staticTexts[deleteDialogTitle].waitForNonExistence(timeout: UITestSupport.timeout),
            "Der Bestätigungsdialog bleibt offen"
        )
        XCTAssertTrue(
            app.staticTexts
                .matching(NSPredicate(format: "label BEGINSWITH %@", activeSessionPrefix))
                .firstMatch
                .waitForNonExistence(timeout: UITestSupport.timeout),
            "Die Sitzung ist nach dem Löschen noch sichtbar"
        )
    }

    // MARK: - Hilfen

    /// Alle Schaltflächen mit diesem Label oder Identifier.
    private func buttons(_ name: String, in app: XCUIApplication) -> XCUIElementQuery {
        app.buttons.matching(NSPredicate(format: "identifier == %@ OR label == %@", name, name))
    }

    /// Erstes tippbares Element der Abfrage; ohne tippbaren Treffer das erste vorhandene (für Wartezeiten).
    /// Verdeckte Treffer hinter Sheets oder Dialogen sind dann nicht tippbar und werden übergangen.
    private func hittable(_ query: XCUIElementQuery) -> XCUIElement {
        query.allElementsBoundByIndex.first(where: { $0.isHittable }) ?? query.firstMatch
    }

    /// Scrollt die Testleitung nach unten, bis die Abfrage ein tippbares Element liefert.
    @discardableResult
    private func scrollUntilHittable(_ query: XCUIElementQuery, _ description: String, in app: XCUIApplication) -> XCUIElement {
        for _ in 0..<12 {
            let element = hittable(query)
            if element.exists, element.isHittable { return element }
            _ = query.firstMatch.waitForExistence(timeout: 0.5)
            app.swipeUp()
        }
        let element = hittable(query)
        if !(element.exists && element.isHittable) {
            // Diagnose: Screenshot und Hierarchie der Testleitung festhalten.
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = "nicht-tippbar-\(description)"
            shot.lifetime = .keepAlways
            add(shot)
            print("DIAG nicht tippbar \(description):\n\(app.debugDescription)")
        }
        XCTAssertTrue(element.exists && element.isHittable, "„\(description)“ ist in der Testleitung nicht tippbar")
        return element
    }

    /// Scrollt die Testleitung nach unten, bis genau dieses Element existiert und tippbar ist.
    @discardableResult
    private func scrollUntilHittable(_ element: XCUIElement, _ description: String, in app: XCUIApplication) -> XCUIElement {
        for _ in 0..<12 {
            if element.waitForExistence(timeout: 0.5), element.isHittable { return element }
            app.swipeUp()
        }
        XCTAssertTrue(element.exists && element.isHittable, "„\(description)“ ist in der Testleitung nicht tippbar")
        return element
    }

    /// Schließt die Tastatur, falls sie offen ist, damit Schaltflächen darunter tippbar werden.
    private func dismissKeyboard(in app: XCUIApplication) {
        let keyboard = app.keyboards.firstMatch
        guard keyboard.exists else { return }
        for key in ["return", "Return", "Zeilenumbruch", "Suchen", "Search", "Fertig", "Done"] where keyboard.buttons[key].exists {
            keyboard.buttons[key].tap()
            break
        }
        _ = keyboard.waitForNonExistence(timeout: UITestSupport.timeout)
    }
}
