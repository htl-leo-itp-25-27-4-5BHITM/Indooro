import Foundation

/// Deterministischer Zufallsgenerator (SplitMix64) fuer reproduzierbare Tests.
struct SplitMix64: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) {
        state = seed
    }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// Gleichverteilt in [0, 1).
    mutating func nextUnit() -> Double {
        Double(next() >> 11) / Double(1 << 53)
    }

    /// Normalverteilt (Box-Muller) mit Mittelwert 0 und Standardabweichung `sigma`.
    mutating func nextGaussian(sigma: Double = 1) -> Double {
        let u1 = max(nextUnit(), 1e-12)
        let u2 = nextUnit()
        return sigma * sqrt(-2 * log(u1)) * cos(2 * Double.pi * u2)
    }
}
