import simd

/// Referenzpunkte M1 bis M8 des Testraums `SPAR-Leonding-002` (Raster 5 x 9, 1 Zelle = 1 m, Ursprung an der
/// Ecke von Indooro3, Zellen ab 0 gezaehlt). Jeder Punkt ist eine Zellmitte, so kann die Schnellauswahl
/// im Debug-Menue den Wahrheitsmarker ohne Kartentipp setzen.
public enum TestRoomMarkers {
    public static let centres: [Int: SIMD2<Float>] = [
        1: SIMD2(0.5, 7.5),
        2: SIMD2(4.5, 7.5),
        3: SIMD2(4.5, 5.5),
        4: SIMD2(0.5, 5.5),
        5: SIMD2(0.5, 3.5),
        6: SIMD2(4.5, 3.5),
        7: SIMD2(4.5, 1.5),
        8: SIMD2(0.5, 1.5),
    ]

    public static let numbers: [Int] = centres.keys.sorted()

    public static func point(forMarker number: Int) -> SIMD2<Float>? {
        centres[number]
    }
}
