import Foundation

/// Truth reference of a recording, built from its `truth` markers.
///
/// Same rules as the Positioning Lab (`tools/beacon-lab/src/positioning/reference.ts`, mode `interpolate`):
/// - Two or more consecutive markers with the identical position form a hold: the device stood still in
///   `[t_first, t_last]` and the truth is that position.
/// - Between two consecutive markers the truth is linearly interpolated (ASSUMPTION: constant walking speed on the
///   straight line between them; the real path may differ).
/// - Before the first and after the last marker there is no truth, and such an epoch does not count.
struct TruthTrack {
    struct Marker: Equatable {
        var t: Double
        var x: Double
        var y: Double
        var label: String?
    }

    struct Hold: Equatable {
        var start: Double
        var end: Double
        var x: Double
        var y: Double
    }

    /// Positions closer than this (layout units = metres) count as identical, like `HOLD_EPS_UNITS` in the Lab.
    static let holdEpsilon = 1e-6

    let markers: [Marker]
    let holds: [Hold]

    init(markers unsorted: [Marker]) {
        let sorted = unsorted.enumerated()
            .filter { $0.element.t.isFinite && $0.element.x.isFinite && $0.element.y.isFinite }
            .sorted { $0.element.t == $1.element.t ? $0.offset < $1.offset : $0.element.t < $1.element.t }
            .map(\.element)
        markers = sorted
        var found: [Hold] = []
        var i = 0
        while i < sorted.count {
            var j = i
            while j + 1 < sorted.count,
                  abs(sorted[j + 1].x - sorted[i].x) < Self.holdEpsilon,
                  abs(sorted[j + 1].y - sorted[i].y) < Self.holdEpsilon {
                j += 1
            }
            if j > i {
                found.append(Hold(start: sorted[i].t, end: sorted[j].t, x: sorted[i].x, y: sorted[i].y))
            }
            i = j + 1
        }
        holds = found
    }

    init(records: [TruthRecord]) {
        self.init(markers: records.map { Marker(t: $0.t, x: Double($0.x), y: Double($0.y), label: $0.marker) })
    }

    var isEmpty: Bool { markers.isEmpty }

    /// Truth position at `t`, or `nil` outside the marker range.
    func position(at t: Double) -> SIMD2<Double>? {
        guard t.isFinite, !markers.isEmpty else { return nil }
        for hold in holds where t >= hold.start && t <= hold.end {
            return SIMD2(hold.x, hold.y)
        }
        // First marker with marker.t >= t.
        var low = 0
        var high = markers.count
        while low < high {
            let mid = (low + high) / 2
            if markers[mid].t < t { low = mid + 1 } else { high = mid }
        }
        guard low < markers.count else { return nil }
        let next = markers[low]
        if next.t == t { return SIMD2(next.x, next.y) }
        guard low > 0 else { return nil }
        let previous = markers[low - 1]
        let span = next.t - previous.t
        guard span > 0 else { return nil }
        let fraction = (t - previous.t) / span
        return SIMD2(
            previous.x + fraction * (next.x - previous.x),
            previous.y + fraction * (next.y - previous.y)
        )
    }
}
