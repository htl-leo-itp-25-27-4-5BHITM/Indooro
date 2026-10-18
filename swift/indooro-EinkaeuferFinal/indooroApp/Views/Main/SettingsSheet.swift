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
                Section("Ortung") {
                    Picker("Modus", selection: $trackingMode) {
                        Text("Mit Ortung").tag(TrackingMode.beacon)
                        Text("Ohne Ortung").tag(TrackingMode.debugNoBeacons)
                    }

                    if let pos = userPosition {
                        HStack {
                            Text("Position")
                            Spacer()
                            Text("\(String(format: "%.1f", pos.x))m / \(String(format: "%.1f", pos.y))m")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Karte") {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Kartengröße")
                            Spacer()
                            Text("\(Int(mapScale * 100))%")
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                        Slider(value: $mapScale, in: 0.65...2.5, step: 0.05)
                    }
                    .padding(.vertical, 2)

                    #if DEBUG
                    Toggle("Tippen setzt Ziel", isOn: $tapSetsTarget)
                    #endif
                }

                #if DEBUG
                Section("Diagnose") {
                    ScrollView {
                        Text(debugLogText.isEmpty ? "Noch keine Einträge." : debugLogText)
                            .font(.system(.caption2, design: .monospaced))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }
                    .frame(maxHeight: 220)
                    Button("Protokoll kopieren") { UIPasteboard.general.string = debugLogText }
                        .disabled(debugLogText.isEmpty)
                    Button("Protokoll leeren", role: .destructive, action: onClearDebugLog)
                }
                #endif

                #if DEBUG
                Section("Debug") {
                    Picker("Funktionsprofil", selection: $profileOverride) {
                        Text("Aus Build").tag("")
                        Text("Pilot").tag("pilot")
                        Text("Vollständig").tag("full")
                    }
                    Toggle("Messungen aufzeichnen", isOn: Binding(
                        get: { recorder.isRecording },
                        set: { $0 ? recorder.start() : recorder.stop() }
                    ))

                    if let url = recorder.lastRecordingURL {
                        Button {
                            shareURL = url
                        } label: {
                            Label("Aufzeichnung teilen", systemImage: "square.and.arrow.up")
                        }
                        .disabled(recorder.isRecording)
                        Text(url.lastPathComponent)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Text("Langer Druck auf die Karte setzt eine Wahrheitsmarkierung, ohne die Position zu aendern.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                #endif

                if AppEnvironment.allowsExtendedFeatures {
                Section("AR") {
                    Button {
                        onShowAR()
                    } label: {
                        Label("AR Route starten", systemImage: "arkit")
                    }
                    .disabled(!canShowAR)

                    if !canShowAR {
                        Text("Wähle zuerst ein Ziel, damit eine Route berechnet werden kann.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
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
