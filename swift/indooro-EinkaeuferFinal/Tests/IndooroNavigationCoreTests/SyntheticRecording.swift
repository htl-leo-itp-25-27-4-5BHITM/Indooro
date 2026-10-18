import IndooroModels
import Foundation
import simd
@testable import IndooroNavigationCore

/// Baut synthetische Aufzeichnungen (`NavigationRecordLine`) aus Wahrheitsbewegungen auf dem Demo-Layout
/// mit eingespeisten Beacons. Je Tick (0.35 s) entstehen Messzeilen aller Beacons in Reichweite
/// (Distanz + Gauss-Rauschen), eine Wahrheitszeile und optional Ereignisse.
struct SyntheticRecording {
    let layout: LayoutData
    let beacons: [(name: String, point: SIMD2<Float>)]
    var source: MeasurementSourceKind = .ranging
    var noiseSigmaMeters = 0.3
    var beaconDropoutProbability = 0.0
    var tick: TimeInterval = 0.35

    private(set) var lines: [NavigationRecordLine] = []
    private(set) var clock: TimeInterval
    private var rng: SplitMix64
    private let range: Float = 10.5

    init(layout: LayoutData, seed: UInt64, start: TimeInterval = 1_000_000) {
        self.layout = layout
        beacons = NavigationReplay.layoutBeacons(layout)
        clock = start
        rng = SplitMix64(seed: seed)
        lines.append(.layout(LayoutRecord(t: start, layoutId: layout.layoutId, revision: 1, shopName: layout.shopName)))
    }

    // MARK: Ereignisse

    mutating func event(_ kind: NavigationEventKind, plan: [RecordedStop]? = nil, x: Float? = nil, y: Float? = nil, optimize: Bool? = nil) {
        lines.append(.event(EventRecord(t: clock, kind: kind, plan: plan, x: x, y: y, optimize: optimize)))
    }

    // MARK: Bewegung

    mutating func stand(at point: SIMD2<Float>, seconds: TimeInterval) {
        for _ in 0..<Int((seconds / tick).rounded()) {
            emit(truth: point)
        }
    }

    /// `outlierEvery`: in jedem n-ten Tick meldet ein Beacon eine um `outlierMeters` zu grosse Distanz (Einzelausreisser).
    mutating func walk(_ polyline: [SIMD2<Float>], speed: Double, outlierEvery: Int? = nil, outlierMeters: Float = 6) {
        let path = SyntheticWalk(polyline: polyline, speedMetersPerSecond: speed)
        let steps = Int((Double(path.totalLength) / speed / tick).rounded(.up))
        for step in 0...steps {
            let truth = path.truth(atDistance: Float(speed * tick * Double(step)))
            var spike: Float = 0
            if let outlierEvery, step > 0, step % outlierEvery == 0 {
                spike = outlierMeters
            }
            emit(truth: truth, rangeSpike: spike)
        }
    }

    /// Alle Beacons verstummen (Truth laeuft weiter, z. B. waehrend eines Funklochs).
    mutating func blackout(seconds: TimeInterval, truth: SIMD2<Float>) {
        for _ in 0..<Int((seconds / tick).rounded()) {
            emit(truth: truth, visible: false)
        }
    }

    private mutating func emit(truth: SIMD2<Float>, rangeSpike: Float = 0, visible: Bool = true) {
        lines.append(.truth(TruthRecord(t: clock, x: truth.x, y: truth.y)))
        if visible {
            // Der Beacon mit der kleinsten Distanz uebernimmt den Ausreisser (staerkster Einfluss).
            let spikeBeacon = rangeSpike > 0
                ? beacons.min { simd_length($0.point - truth) < simd_length($1.point - truth) }?.name
                : nil
            for beacon in beacons {
                var distance = simd_length(beacon.point - truth)
                guard distance <= range else { continue }
                if beacon.name == spikeBeacon { distance += rangeSpike }
                if beaconDropoutProbability > 0, rng.nextUnit() < beaconDropoutProbability { continue }
                switch source {
                case .ranging:
                    let accuracy = max(0.4, Double(distance) + rng.nextGaussian(sigma: noiseSigmaMeters))
                    lines.append(.measurement(MeasurementRecord(
                        t: clock - 0.1, source: .ranging, beacon: beacon.name,
                        rssi: -Int((55 + 4 * distance).rounded()), accuracy: accuracy,
                        proximity: distance < 1 ? .immediate : (distance < 4 ? .near : .far),
                        txPower: nil
                    )))
                case .rssi:
                    for sample in 0..<3 {
                        let rssi = -72 - 28 * log10(Double(max(distance, 0.4))) + rng.nextGaussian(sigma: 1.5)
                        lines.append(.measurement(MeasurementRecord(
                            t: clock - 0.25 + 0.08 * Double(sample), source: .rssi, beacon: beacon.name,
                            rssi: Int(rssi.rounded()), accuracy: nil, proximity: nil, txPower: nil
                        )))
                    }
                }
            }
        }
        clock += tick
    }
}
