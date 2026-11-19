import os

/// Logger der Kategorie `persistence` (modernize-ios-client-architecture, Entscheidung 10).
/// Kennungen und Dateinamen werden mit `privacy: .private(mask: .hash)` protokolliert, Inhalte nie.
enum PersistenceLog {
    static let logger = Logger(subsystem: "at.ac.htl.leonding.indooro", category: "persistence")
}
