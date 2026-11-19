import os

/// Gemeinsame `Logger`-Instanzen (modernize-ios-client-architecture, Entscheidung 10).
/// Kennungen werden mit `privacy: .private(mask: .hash)` protokolliert, Antwortinhalte nie.
nonisolated enum AppLog {
    static let subsystem = "at.ac.htl.leonding.indooro"

    static let network = Logger(subsystem: subsystem, category: "network")
    static let positioning = Logger(subsystem: subsystem, category: "positioning")
    static let upsell = Logger(subsystem: subsystem, category: "upsell")
    static let persistence = Logger(subsystem: subsystem, category: "persistence")
    static let ar = Logger(subsystem: subsystem, category: "ar")
}
