import Foundation
import IndooroNavigationCore

// compare-positioning: replays one indooro-recording through the current app pipeline and through
// PositioningEngine and prints a summary. Offline only: no network, no app, no flag.
// Usage: see `Positioning/README.md` and `scripts/field/compare_positioning.sh`.
//
// Exit codes: 0 done, 2 wrong call or unreadable input, 3 no epoch with truth (nothing to evaluate; files are still written).

let usage = """
Usage: compare-positioning <recording.jsonl> --layout <layout.json> [--out <dir>] [--name <name>] [--warmup <seconds>]

  <recording.jsonl>  recording in format indooro-recording/1 or /2 (anonymised copy recommended)
  --layout           layout JSON (LayoutData, or the answer of layout/current)
  --out              directory for <name>-comparison.csv/.json/.txt and <name>-current-ticks.csv / <name>-engine-ticks.csv;
                     without --out only the summary is printed and nothing is written
  --name             output name, default: file name without extension
  --warmup           warm-up in seconds for both paths, default: app default (1.2)
"""

func fail(_ message: String, code: Int32 = 2) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(code)
}

var arguments = Array(CommandLine.arguments.dropFirst())
if arguments.isEmpty || arguments.contains("--help") || arguments.contains("-h") {
    print(usage)
    exit(arguments.isEmpty ? 2 : 0)
}

var recordingPath: String?
var layoutPath: String?
var outDirectory: String?
var name: String?
var warmup: Double?

while !arguments.isEmpty {
    let argument = arguments.removeFirst()
    func value() -> String {
        guard !arguments.isEmpty else { fail("Missing value for \(argument)\n\n\(usage)") }
        return arguments.removeFirst()
    }
    switch argument {
    case "--layout": layoutPath = value()
    case "--out": outDirectory = value()
    case "--name": name = value()
    case "--warmup":
        guard let seconds = Double(value()), seconds >= 0 else { fail("--warmup needs a number of seconds >= 0") }
        warmup = seconds
    default:
        guard !argument.hasPrefix("-") else { fail("Unknown option \(argument)\n\n\(usage)") }
        guard recordingPath == nil else { fail("Only one recording per call\n\n\(usage)") }
        recordingPath = argument
    }
}

guard let recordingPath else { fail("No recording given\n\n\(usage)") }
guard let layoutPath else { fail("No --layout given\n\n\(usage)") }

let recordingURL = URL(fileURLWithPath: recordingPath)
let recordingText: String
let layoutData: Data
do {
    recordingText = try String(contentsOf: recordingURL, encoding: .utf8)
    layoutData = try Data(contentsOf: URL(fileURLWithPath: layoutPath))
} catch {
    fail("Input not readable: \(error.localizedDescription)")
}

let baseName = name ?? recordingURL.deletingPathExtension().lastPathComponent
let result: PositioningComparisonResult
do {
    result = try await PositioningComparison.run(
        recordingJSONL: recordingText,
        layoutJSON: layoutData,
        recordingName: recordingURL.lastPathComponent,
        options: PositioningComparisonOptions(warmupSeconds: warmup)
    )
} catch {
    fail("\(error)")
}

let summary = result.summaryText()
print(summary, terminator: "")

if let outDirectory {
    let directory = URL(fileURLWithPath: outDirectory, isDirectory: true)
    do {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        func write(_ text: String, _ file: String) throws {
            try text.write(to: directory.appendingPathComponent(file), atomically: true, encoding: .utf8)
        }
        try write(result.csv(), "\(baseName)-comparison.csv")
        try result.json().write(to: directory.appendingPathComponent("\(baseName)-comparison.json"), options: .atomic)
        try write(summary, "\(baseName)-comparison.txt")
        try write(result.tickCSV(.current), "\(baseName)-current-ticks.csv")
        try write(result.tickCSV(.engine), "\(baseName)-engine-ticks.csv")
        print("\nGeschrieben nach \(directory.path): \(baseName)-comparison.csv, -comparison.json, -comparison.txt, -current-ticks.csv, -engine-ticks.csv")
    } catch {
        fail("Output not writable: \(error.localizedDescription)")
    }
}

exit(result.hasEvaluableEpochs ? 0 : 3)
