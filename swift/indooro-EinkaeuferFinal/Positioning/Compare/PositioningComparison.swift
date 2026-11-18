import CryptoKit
import Foundation
import IndooroModels
import simd

/// Which of the two pipelines.
public enum PositioningMethod: String, CaseIterable, Sendable {
    /// The current app pipeline as `BeaconManager` runs it.
    case current
    /// `PositioningEngine` (branch `postpilot/ios-architecture`), off in every build.
    case engine

    var label: String {
        switch self {
        case .current: return "Aktuelle App-Pipeline (BeaconManager)"
        case .engine: return "PositioningEngine (neu)"
        }
    }
}

public struct PositioningComparisonOptions: Sendable {
    /// Warm-up in seconds; `nil` takes the app default (`StabilizedNavigationConfig.default`, 1.2 s).
    public var warmupSeconds: Double?

    public init(warmupSeconds: Double? = nil) {
        self.warmupSeconds = warmupSeconds
    }
}

public enum PositioningComparisonError: Error, CustomStringConvertible {
    case layoutUnreadable(String)
    case recordingUnreadable(String)
    case emptyRecording

    public var description: String {
        switch self {
        case .layoutUnreadable(let reason): return "Layout nicht lesbar: \(reason)"
        case .recordingUnreadable(let reason): return "Aufnahme nicht lesbar: \(reason)"
        case .emptyRecording: return "Die Aufnahme enthaelt keine Messung und keine Wahrheitsmarke."
        }
    }
}

/// Entry point: one recording and one layout through both pipelines.
public enum PositioningComparison {
    public static let schema = "indooro-position-comparison/1"

    /// - Parameters:
    ///   - recordingJSONL: content of an `indooro-recording/1` or `/2` file.
    ///   - layoutJSON: a `LayoutData` object or the `layout/current` answer (object with a `layout` key).
    ///   - recordingName: file name; a name that starts with `synthetic-` marks the result as SYNTHETIC.
    public static func run(
        recordingJSONL: String,
        layoutJSON: Data,
        recordingName: String,
        options: PositioningComparisonOptions = PositioningComparisonOptions()
    ) async throws -> PositioningComparisonResult {
        let layout = try decodeLayout(layoutJSON)
        let lines: [NavigationRecordLine]
        do {
            lines = try NavigationRecordLine.parse(jsonl: recordingJSONL)
        } catch {
            throw PositioningComparisonError.recordingUnreadable("\(error)")
        }
        var config = StabilizedNavigationConfig.default
        if let warmup = options.warmupSeconds { config.beacon.warmupSeconds = warmup }
        let plan = ReplayPlan(recording: lines, config: config)
        guard !plan.ticks.isEmpty else { throw PositioningComparisonError.emptyRecording }

        let current = CurrentPipelinePath.run(plan: plan, layout: layout, config: config)
        let engine = await EnginePath.run(plan: plan, layout: layout, config: config)

        let truthRecords: [TruthRecord] = lines.compactMap {
            if case .truth(let record) = $0 { return record }
            return nil
        }
        let session: SessionRecord? = lines.lazy.compactMap {
            if case .session(let record) = $0 { return record }
            return nil
        }.first

        return PositioningComparisonResult(
            recordingName: recordingName,
            recordingLineCount: lines.count,
            recordingSHA256: SHA256.hash(data: Data(recordingJSONL.utf8)).map { String(format: "%02x", $0) }.joined(),
            layout: layout,
            session: session,
            config: config,
            truth: TruthTrack(records: truthRecords),
            current: current,
            engine: engine.ticks,
            unmappedEngineMeasurements: engine.unmappedMeasurements
        )
    }

    static func decodeLayout(_ data: Data) throws -> LayoutData {
        let decoder = JSONDecoder()
        do {
            return try decoder.decode(LayoutData.self, from: data)
        } catch let direct {
            struct Wrapped: Decodable { let layout: LayoutData }
            if let wrapped = try? decoder.decode(Wrapped.self, from: data) { return wrapped.layout }
            throw PositioningComparisonError.layoutUnreadable("\(direct)")
        }
    }
}
