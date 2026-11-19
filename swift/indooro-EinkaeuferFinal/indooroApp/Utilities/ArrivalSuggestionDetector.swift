import Foundation
import simd

/// Parameter der Ankunftsvorschlaege. R = max(3 m, gemessener Median-Fehler), T = 5 s (provisional).
public nonisolated struct ArrivalSuggestionConfig: Equatable {
    /// Radius um den aktiven Stopp in Metern (Vergleich mit `<=`).
    public var radiusMeters: Float
    /// Verweildauer innerhalb des Radius bis zum Vorschlag in Sekunden.
    public var dwellSeconds: TimeInterval
    /// Sperrzeit pro Stopp nach „Noch nicht“ in Sekunden.
    public var suppressionSeconds: TimeInterval

    public static let defaultRadiusFloorMeters: Float = 3
    public static let defaultDwellSeconds: TimeInterval = 5 // provisional
    public static let defaultSuppressionSeconds: TimeInterval = 30

    /// Standardwerte; `measuredMedianErrorMeters` (Feldmessung) hebt den Radius auf mindestens diesen Wert an.
    public static func defaults(measuredMedianErrorMeters: Float? = nil) -> ArrivalSuggestionConfig {
        let measured: Float
        if let value = measuredMedianErrorMeters, value.isFinite {
            measured = value
        } else {
            measured = 0
        }
        return ArrivalSuggestionConfig(
            radiusMeters: max(defaultRadiusFloorMeters, measured),
            dwellSeconds: defaultDwellSeconds,
            suppressionSeconds: defaultSuppressionSeconds
        )
    }

    public init(radiusMeters: Float, dwellSeconds: TimeInterval, suppressionSeconds: TimeInterval) {
        self.radiusMeters = radiusMeters
        self.dwellSeconds = dwellSeconds
        self.suppressionSeconds = suppressionSeconds
    }
}

/// Zaehler fuer den Studienmodus.
public nonisolated struct ArrivalSuggestionCounters: Equatable {
    public var shown = 0
    public var accepted = 0
    public var rejected = 0

    public init() {}
}

/// Erkennt, dass der Kunde am aktiven Stopp verweilt, und schlaegt „Bist du bei <Regal>?“ vor.
/// Vollstaendig pur: keine Seiteneffekte ausser dem Zustand dieses Werts, die Zeit wird injiziert.
/// Der Detektor erledigt nie selbst einen Stopp; `accept()` setzt nur die Zaehler und den Dwell zurueck,
/// der Aufrufer fuehrt danach den bestehenden `stopCompleted`-Pfad aus.
public nonisolated struct ArrivalSuggestionDetector {
    /// Groesste erlaubte Luecke zwischen zwei aufeinanderfolgenden Samples innerhalb des Radius.
    public static let maxSampleGapSeconds: TimeInterval = 3

    public private(set) var config: ArrivalSuggestionConfig
    public private(set) var counters = ArrivalSuggestionCounters()
    public private(set) var pendingStopID: String?

    public enum Event: Equatable {
        case shown(stopID: String)
        case withdrawn(stopID: String)
    }

    /// Stopp, dessen Dwell zuletzt verfolgt wurde (Wechsel setzt den Dwell zurueck).
    private var trackedStopID: String?
    /// Beginn des aktuellen Dwell-Laufs; `nil` solange kein Lauf laeuft.
    private var dwellStart: TimeInterval?
    /// Zeitpunkt des letzten Samples innerhalb des Radius (fuer die Lueckenregel).
    private var lastInsideTime: TimeInterval?
    /// Pro Stopp: Vorschlaege sind bis zu diesem Zeitpunkt gesperrt (nach „Noch nicht“).
    private var suppressedUntil: [String: TimeInterval] = [:]
    /// Stopp, fuer den „Ja, erledigt“ gewaehlt wurde; bis zum Stopp-Wechsel kein erneuter Vorschlag.
    private var acceptedStopID: String?

    public init(config: ArrivalSuggestionConfig = .defaults()) {
        self.config = config
    }

    /// Eine Positionsprobe. `positioningEnabled == false` bedeutet „Ohne Ortung“.
    /// Liefert hoechstens ein Ereignis pro Aufruf.
    public mutating func update(
        position: SIMD2<Float>?,
        trusted: Bool,
        positioningEnabled: Bool,
        activeStopID: String?,
        stopPoint: SIMD2<Float>?,
        at time: TimeInterval
    ) -> Event? {
        let stopChanged = activeStopID != trackedStopID
        trackedStopID = activeStopID
        if stopChanged {
            acceptedStopID = nil
        }

        var inside = false
        if positioningEnabled, trusted, activeStopID != nil, let position, let stopPoint {
            inside = simd_length(position - stopPoint) <= config.radiusMeters
        }

        var broken = stopChanged || !inside
        if inside, let last = lastInsideTime, time - last > Self.maxSampleGapSeconds {
            broken = true
        }

        var withdrawal: Event?
        if broken {
            dwellStart = nil
            lastInsideTime = nil
            if let pending = pendingStopID {
                pendingStopID = nil
                withdrawal = .withdrawn(stopID: pending)
            }
        }

        guard inside, let stopID = activeStopID else { return withdrawal }

        lastInsideTime = time
        if isSuppressed(stopID, at: time) || acceptedStopID == stopID {
            dwellStart = nil
            return withdrawal
        }
        if dwellStart == nil {
            dwellStart = time
        }
        guard pendingStopID == nil, let start = dwellStart, time - start >= config.dwellSeconds else {
            return withdrawal
        }

        pendingStopID = stopID
        counters.shown += 1
        return .shown(stopID: stopID)
    }

    /// „Ja, erledigt“: zaehlt als akzeptiert, loescht den Vorschlag und setzt den Dwell zurueck.
    /// Ohne offenen Vorschlag ohne Wirkung.
    public mutating func accept() {
        guard let stopID = pendingStopID else { return }
        counters.accepted += 1
        acceptedStopID = stopID
        clearPending()
    }

    /// „Noch nicht“: zaehlt als abgelehnt und sperrt Vorschlaege fuer diesen Stopp bis `time + suppressionSeconds`.
    /// Ohne offenen Vorschlag ohne Wirkung.
    public mutating func reject(at time: TimeInterval) {
        guard let stopID = pendingStopID else { return }
        counters.rejected += 1
        suppressedUntil[stopID] = time + config.suppressionSeconds
        clearPending()
    }

    /// Verwirft Dwell, Sperren und Vorschlag; die Zaehler bleiben erhalten.
    public mutating func reset() {
        pendingStopID = nil
        trackedStopID = nil
        dwellStart = nil
        lastInsideTime = nil
        suppressedUntil = [:]
        acceptedStopID = nil
    }

    private mutating func clearPending() {
        pendingStopID = nil
        dwellStart = nil
        lastInsideTime = nil
    }

    private func isSuppressed(_ stopID: String, at time: TimeInterval) -> Bool {
        guard let until = suppressedUntil[stopID] else { return false }
        return time < until
    }
}
