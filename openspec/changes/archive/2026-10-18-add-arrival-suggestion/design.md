## Decisions

1. Logic in a pure `ArrivalSuggestionDetector` (SwiftPM target): input trusted position samples, active stop point, R, T; output suggestion events; tests with replay recordings.
2. Defaults: R = max(3 m, measured median error), T = 5 s (provisional), suppressed for 30 s after „Noch nicht“.
3. UI owned by Person A as an overlay; completion goes through the existing `stopCompleted` path.
