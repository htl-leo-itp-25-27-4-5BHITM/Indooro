import Foundation
import simd

struct PoseEstimate {
    /// Geglaetteter Schaetzwert (Eingang der Projektion, nie direkt angezeigt).
    let point: SIMD2<Float>
    /// `true`, wenn der geloeste Punkt vom Sprung-Gate gehalten wurde.
    let wasHeld: Bool
    let timestamp: TimeInterval
}

/// Bewegungsdaten eines Ticks (nur mit `motionAided`). Standardwerte = ohne Bewegungseinfluss.
struct MotionAid {
    /// Verschiebung des Schaetzers vor Gate und EMA (Schritte entlang der Kante).
    var displacement: SIMD2<Float> = .zero
    /// Faktor auf die EMA-Alpha (Stehen: BLE-Rauschen daempfen).
    var alphaFactor: Float = 1
    /// Bestaetigungsschwelle fuer Spruenge; `nil` = `PoseFusionConfig.jumpConfirmations`.
    var jumpConfirmations: Int? = nil
}

/// Schaetzer: Sprung-Gate im Tick-Takt, danach ein konfidenz-interpolierter EMA.
/// Kein Geschwindigkeitsmodell, keine Prediction; der Zustand aendert sich nur in `update`.
final class PoseFusionService {
    private let config: PoseFusionConfig

    private(set) var estimate: SIMD2<Float>?
    private var lastAcceptedTimestamp: TimeInterval?
    private var pendingJumpAnchor: SIMD2<Float>?
    private var pendingJumpConfirmations = 0

    init(config: PoseFusionConfig) {
        self.config = config
    }

    /// Setzt den Schaetzer auf `mapPoint` (oder leert ihn) und verwirft Sprung-Kandidaten.
    func reset(to mapPoint: SIMD2<Float>? = nil, timestamp: TimeInterval = Date().timeIntervalSince1970) {
        estimate = mapPoint
        lastAcceptedTimestamp = mapPoint == nil ? nil : timestamp
        clearJumpCandidate()
    }

    /// Verarbeitet einen geloesten Punkt pro Tick. Nicht endliche Punkte werden ignoriert.
    /// `motion` ohne Wirkung (`nil`) = Verhalten ohne Bewegungsdaten.
    func update(
        solvedPoint: SIMD2<Float>,
        confidence: Float,
        timestamp: TimeInterval,
        motion: MotionAid? = nil
    ) -> PoseEstimate? {
        guard solvedPoint.x.isFinite, solvedPoint.y.isFinite else {
            return estimate.map { PoseEstimate(point: $0, wasHeld: true, timestamp: timestamp) }
        }

        guard var current = estimate, let lastAccepted = lastAcceptedTimestamp else {
            estimate = solvedPoint
            lastAcceptedTimestamp = timestamp
            clearJumpCandidate()
            return PoseEstimate(point: solvedPoint, wasHeld: false, timestamp: timestamp)
        }

        // Schritt-Verschiebung als Prior: Gate und EMA arbeiten auf dem verschobenen Schaetzer.
        // lastAcceptedTimestamp bleibt, weil die Verschiebung kein BLE-Punkt ist.
        if let motion, motion.displacement != .zero,
           motion.displacement.x.isFinite, motion.displacement.y.isFinite {
            current += motion.displacement
            estimate = current
        }

        // dt = Zeit seit dem letzten AKZEPTIERTEN Punkt (waehrend des Haltens waechst das Limit).
        let dt = Float(max(0, timestamp - lastAccepted))
        let allowedDistance = config.maxPlausibleSpeed * dt + config.jumpMargin

        if simd_length(solvedPoint - current) > allowedDistance {
            if let anchor = pendingJumpAnchor,
               simd_length(solvedPoint - anchor) <= config.jumpClusterRadius {
                pendingJumpConfirmations += 1
            } else {
                pendingJumpAnchor = solvedPoint
                pendingJumpConfirmations = 1
            }

            let confirmations = motion?.jumpConfirmations ?? config.jumpConfirmations
            guard pendingJumpConfirmations >= max(1, confirmations) else {
                return PoseEstimate(point: current, wasHeld: true, timestamp: timestamp)
            }

            // Bestaetigte Neupositionierung: Schaetzer springt auf den bestaetigten Punkt.
            // Wuerde er nur glaetten, laege er weiter ausserhalb des Gates und jeder
            // Folgepunkt wuerde erneut gehalten.
            clearJumpCandidate()
            estimate = solvedPoint
            lastAcceptedTimestamp = timestamp
            return PoseEstimate(point: solvedPoint, wasHeld: false, timestamp: timestamp)
        }

        clearJumpCandidate()
        let alpha = smoothingAlpha(for: confidence) * (motion?.alphaFactor ?? 1)
        let smoothed = current + (solvedPoint - current) * alpha
        estimate = smoothed
        lastAcceptedTimestamp = timestamp
        return PoseEstimate(point: smoothed, wasHeld: false, timestamp: timestamp)
    }

    private func smoothingAlpha(for confidence: Float) -> Float {
        let c = max(0, min(1, confidence.isFinite ? confidence : 0))
        let low = config.estimatorLowConfidenceAlpha
        let high = config.estimatorHighConfidenceAlpha
        return low + (high - low) * c
    }

    private func clearJumpCandidate() {
        pendingJumpAnchor = nil
        pendingJumpConfirmations = 0
    }
}
