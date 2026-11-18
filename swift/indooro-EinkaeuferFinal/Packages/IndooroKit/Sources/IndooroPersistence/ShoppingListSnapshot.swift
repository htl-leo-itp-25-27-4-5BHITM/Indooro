import Foundation
import IndooroModels

/// Inhalt der Datei `Application Support/ShoppingLists/lists.json` (Schema v2).
///
/// Enthaelt alles, was die App bisher in `UserDefaults` hielt: die Listen samt Auswahl
/// (`shoppingListStore.v1`) sowie die aktive Tour-Liste und den Routenmodus
/// (`shoppingSession.activeListID`, `shoppingSession.routeMode`). Die Listen werden mit derselben
/// `Codable`-Darstellung geschrieben wie zuvor (Standard-`JSONEncoder`, Datum als Sekunden).
public struct ShoppingListSnapshot: Codable, Equatable, Sendable {
    public static let currentSchemaVersion = 2

    public var schemaVersion: Int
    public var selectedListID: UUID?
    public var activeTourListID: UUID?
    public var routeMode: ShoppingRouteMode
    public var lists: [ShoppingList]

    public init(
        lists: [ShoppingList] = [],
        selectedListID: UUID? = nil,
        activeTourListID: UUID? = nil,
        routeMode: ShoppingRouteMode = .optimized
    ) {
        self.schemaVersion = Self.currentSchemaVersion
        self.lists = lists
        self.selectedListID = selectedListID
        self.activeTourListID = activeTourListID
        self.routeMode = routeMode
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, selectedListID, activeTourListID, routeMode, lists
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        lists = try container.decode([ShoppingList].self, forKey: .lists)
        selectedListID = try container.decodeIfPresent(UUID.self, forKey: .selectedListID)
        activeTourListID = try container.decodeIfPresent(UUID.self, forKey: .activeTourListID)
        routeMode = try container.decodeIfPresent(ShoppingRouteMode.self, forKey: .routeMode) ?? .optimized
    }
}

/// Woher der Startzustand des Repositorys stammt.
public enum ShoppingListLoadSource: Equatable, Sendable {
    /// Keine Daten vorhanden: leerer Zustand (die App legt die Standardliste an).
    case fresh
    /// `lists.json` wurde gelesen.
    case file
    /// `lists.json` fehlte oder war unlesbar; der Zustand stammt aus `lists.json.bak`.
    case backup
    /// Einmalige Uebernahme der alten `UserDefaults`-Schluessel.
    case userDefaultsMigration
}

/// Ergebnis des synchronen Ladens beim Start.
public struct ShoppingListLoadReport: Equatable, Sendable {
    public var source: ShoppingListLoadSource
    /// Dateinamen (im Repository-Verzeichnis) unlesbarer Daten, die als `lists.corrupt-<timestamp>.json` erhalten bleiben.
    public var quarantinedFileNames: [String]
    /// `true`, wenn in diesem Start die alten `UserDefaults`-Schluessel entfernt wurden (zweiter erfolgreicher Start).
    public var legacyKeysRemoved: Bool

    public init(source: ShoppingListLoadSource, quarantinedFileNames: [String] = [], legacyKeysRemoved: Bool = false) {
        self.source = source
        self.quarantinedFileNames = quarantinedFileNames
        self.legacyKeysRemoved = legacyKeysRemoved
    }
}

/// Schluessel der alten Persistenz (`ShoppingListManager`, `ShoppingSessionManager`) und der Zaehler fuer die Entfernung.
public enum ShoppingListLegacyKeys {
    public static let store = "shoppingListStore.v1"
    public static let activeListID = "shoppingSession.activeListID"
    public static let routeMode = "shoppingSession.routeMode"
    /// Anzahl aufeinanderfolgender Starts, in denen `lists.json` erfolgreich geladen (oder nach der Migration
    /// geschrieben und zurueckgelesen) wurde. Bei 2 werden die drei Schluessel und dieser Zaehler entfernt.
    public static let confirmedLoadCount = "shoppingListRepository.confirmedV2Loads"

    public static let all = [store, activeListID, routeMode]
}
