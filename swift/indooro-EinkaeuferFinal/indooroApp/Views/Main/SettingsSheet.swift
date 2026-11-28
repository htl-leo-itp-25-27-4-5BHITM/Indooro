import IndooroNavigation
import SwiftUI

struct SettingsSheet: View {
    @Binding var trackingMode: TrackingMode
    @Binding var mapScale: Double
    @Binding var tapSetsTarget: Bool
    let canShowAR: Bool
    let userPosition: CGPoint?
    let onShowAR: () -> Void
    /// In-App-Protokoll (nur DEBUG-Builds zeigen es, Abschnitt „Diagnose“).
    var debugLogText: String = ""
    var onClearDebugLog: () -> Void = {}

    @AppStorage(AppEnvironment.profileOverrideKey) private var profileOverride = ""
    @Environment(\.dismiss) private var dismiss
    #if DEBUG
    @ObservedObject private var recorder = NavigationRecorder.shared
    @State private var shareURL: URL?
    #endif

    var body: some View {
        NavigationStack {
            List {
                if AppEnvironment.isStudyModeEnabled {
                    Section {
                        Button("Testleitung") {
                            dismiss()
                            NotificationCenter.default.post(name: StudySessionStore.openRequested, object: nil)
                        }
                    }
                }
                Section {
                    Picker("Modus", selection: $trackingMode) {
                        Text("Mit Ortung").tag(TrackingMode.beacon)
                        Text("Ohne Ortung").tag(TrackingMode.debugNoBeacons)
                    }

                    if let pos = userPosition {
                        HStack {
                            Text("Position")
                            Spacer()
                            Text("\(String(format: "%.1f", pos.x))m / \(String(format: "%.1f", pos.y))m")
                                .foregroundStyle(Color.a11ySecondaryText)
                        }
                    }
                } header: {
                    Text("Ortung")
                        .font(.headline)
                        .foregroundStyle(Color.a11ySecondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Kartengröße")
                            Spacer()
                            Text("\(Int(mapScale * 100)) %")
                                .foregroundStyle(Color.a11ySecondaryText)
                                .monospacedDigit()
                        }
                        Slider(value: $mapScale, in: 0.65...2.5, step: 0.05)
                            .frame(minHeight: 44)
                            .accessibilityLabel("Kartengröße")
                            .accessibilityValue("\(Int(mapScale * 100)) Prozent")
                            .accessibilityHint("Vergrößert oder verkleinert die Marktkarte")
                    }
                    .padding(.vertical, 2)

                    #if DEBUG
                    Toggle("Tippen setzt Ziel", isOn: $tapSetsTarget)
                    #endif
                } header: {
                    Text("Karte")
                        .font(.headline)
                        .foregroundStyle(Color.a11ySecondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                #if DEBUG
                Section {
                    Text(debugLogText.isEmpty ? "Noch keine Einträge." : debugLogText)
                        .font(.system(.caption2, design: .monospaced))
                        .lineLimit(30)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                    Button("Protokoll kopieren") { UIPasteboard.general.string = debugLogText }
                        .disabled(debugLogText.isEmpty)
                    Button("Protokoll leeren", role: .destructive, action: onClearDebugLog)
                } header: {
                    Text("Diagnose")
                        .font(.headline)
                        .foregroundStyle(Color.a11ySecondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                #endif

                #if DEBUG
                Section {
                    Picker("Funktionsprofil", selection: $profileOverride) {
                        Text("Aus Build").tag("")
                        Text("Pilot").tag("pilot")
                        Text("Vollständig").tag("full")
                    }
                    Toggle("Messungen aufzeichnen", isOn: Binding(
                        get: { recorder.isRecording },
                        set: { $0 ? recorder.start() : recorder.stop() }
                    ))

                    Picker("Szenario", selection: $recorder.selectedScenario) {
                        Text("keins").tag(SessionScenario?.none)
                        ForEach(SessionScenario.allCases, id: \.self) { scenario in
                            Text(scenario.rawValue).tag(SessionScenario?.some(scenario))
                        }
                    }
                    .disabled(recorder.isRecording)
                    Picker("Rolle", selection: $recorder.selectedRole) {
                        Text("keine").tag(SessionRole?.none)
                        Text("Kalibrierung").tag(SessionRole?.some(.calibration))
                        Text("Evaluation").tag(SessionRole?.some(.evaluation))
                    }
                    .disabled(recorder.isRecording)
                    Picker("Marker", selection: $recorder.selectedMarker) {
                        Text("keiner").tag(Int?.none)
                        ForEach(1...30, id: \.self) { number in
                            Text("M\(number)").tag(Int?.some(number))
                        }
                    }
                    if recorder.isRecording {
                        Button("Sync-Marke setzen") {
                            recorder.recordSync()
                        }
                        LabeledContent("Sync-Marken", value: "\(recorder.syncCount)")
                    }

                    if recorder.isRecording {
                        LabeledContent("Wahrheitsmarker", value: "\(recorder.truthCount)")
                        if !recorder.unmatchedBeacons.isEmpty {
                            // Fremde oder falsch registrierte iBeacons: stehen als `scan`-Zeilen in der Aufnahme.
                            Text("Ohne Layout-Treffer: " + recorder.unmatchedBeacons.keys.sorted().joined(separator: ", ") + " (Major-Minor)")
                                .font(.caption)
                                .foregroundStyle(Color.a11yWarningText)
                        }
                    }

                    // Alle Aufnahmen, nicht nur die letzte: nach einem App-Neustart ist `lastRecordingURL` leer.
                    ForEach(recorder.isRecording ? [] : NavigationRecorder.savedRecordings(), id: \.self) { url in
                        Button {
                            shareURL = url
                        } label: {
                            Label(url.lastPathComponent, systemImage: "square.and.arrow.up")
                                .font(.caption)
                        }
                    }

                    Text("Langer Druck auf die Karte setzt eine Wahrheitsmarkierung, ohne die Position zu ändern. Szenario und Rolle gelten ab dem Start der Aufnahme, der Marker ab dem naechsten Wahrheitsmarker.")
                        .font(.caption)
                        .foregroundStyle(Color.a11ySecondaryText)
                } header: {
                    Text("Debug")
                        .font(.headline)
                        .foregroundStyle(Color.a11ySecondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                #endif

                if AppEnvironment.allowsExtendedFeatures {
                Section {
                    Button {
                        onShowAR()
                    } label: {
                        Label("AR Route starten", systemImage: "arkit")
                    }
                    .disabled(!canShowAR)

                    if !canShowAR {
                        Text("Wähle zuerst ein Ziel, damit eine Route berechnet werden kann.")
                            .font(.caption)
                            .foregroundStyle(Color.a11ySecondaryText)
                    }
                } header: {
                    Text("AR")
                        .font(.headline)
                        .foregroundStyle(Color.a11ySecondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                }
            }
            #if DEBUG
            .sheet(isPresented: Binding(get: { shareURL != nil }, set: { if !$0 { shareURL = nil } })) {
                if let shareURL {
                    ShareSheet(activityItems: [shareURL], onComplete: { _ in })
                }
            }
            #endif
            .navigationTitle("Einstellungen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { dismiss() }
                }
            }
        }
    }
}
