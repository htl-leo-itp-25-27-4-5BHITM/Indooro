import Foundation

/// Kalman Filter zur Glättung von Beacon-Distanzmessungen
/// Reduziert das "Zittern" der Distanzwerte durch statistische Filterung
class KalmanFilter {
    
    // === PARAMETER ===
    private var R: Double  // Prozessrauschen (wie stark ändert sich die echte Distanz?)
    private var Q: Double  // Messrauschen (wie ungenau sind die Messungen?)
    
    // === ZUSTANDSVARIABLEN ===
    private var x: Double = Double.nan        // Geschätzte Distanz
    private var P: Double = 1.0               // Unsicherheit der Schätzung
    
    // === KONSTANTEN ===
    private let A: Double = 1.0   // Zustandsübergangsmatrix (statisches Modell)
    private let H: Double = 1.0   // Messmatrix
    
    /// Initialisiert den Kalman Filter
    /// - Parameters:
    ///   - processNoise: Wie stark sich die echte Distanz ändern kann (0.01-0.1)
    ///   - measurementNoise: Wie verrauscht die RSSI-Messungen sind (0.5-3.0)
    init(processNoise: Double = 0.05, measurementNoise: Double = 1.5) {
        self.R = processNoise
        self.Q = measurementNoise
    }
    
    /// Filtert einen neuen Distanzwert
    /// - Parameter measurement: Gemessene Distanz vom RSSI
    /// - Returns: Geglättete Distanz
    func filter(_ measurement: Double) -> Double {
        
        // === ERSTE MESSUNG: Initialisierung ===
        if x.isNaN {
            x = measurement
            P = 1.0
            return x
        }
        
        // === PREDICT STEP (Vorhersage) ===
        // Wir nehmen an, dass sich die Position nicht ändert (statisches Modell)
        let x_pred = A * x
        let P_pred = A * P * A + R
        
        // === UPDATE STEP (Korrektur mit Messung) ===
        // Kalman Gain: Wie sehr vertrauen wir der neuen Messung?
        let K = P_pred * H / (H * P_pred * H + Q)
        
        // Update der Schätzung
        x = x_pred + K * (measurement - H * x_pred)
        
        // Update der Unsicherheit
        P = (1 - K * H) * P_pred
        
        return x
    }
    
    /// Setzt den Filter zurück (z.B. wenn Beacon lange nicht gesehen wurde)
    func reset() {
        x = Double.nan
        P = 1.0
    }
    
    /// Gibt zurück ob der Filter initialisiert ist
    var isInitialized: Bool {
        return !x.isNaN
    }
}
