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
    @State private var shadowEnabled = AppEnvironment.isShadowPositioningEnabled
    @State private var engineDrivesNavigation = AppEnvironment.isEngineDrivingNavigation
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
                    Toggle("Schattenmodus (alt + neu aufzeichnen)", isOn: $shadowEnabled)
                        .disabled(recorder.isRecording)
                        .onChange(of: shadowEnabled) { _, value in
                            UserDefaults.standard.set(value, forKey: AppEnvironment.shadowOverrideKey)
                            if !value {
                                engineDrivesNavigation = false
                                UserDefaults.standard.set(false, forKey: AppEnvironment.engineNavigationOverrideKey)
                            }
                        }
                    if shadowEnabled {
                        Toggle("Neue Ortung steuert Navigation", isOn: $engineDrivesNavigation)
                            .disabled(recorder.isRecording)
                            .onChange(of: engineDrivesNavigation) { _, value in
                                UserDefaults.standard.set(value, forKey: AppEnvironment.engineNavigationOverrideKey)
                            }
                        Text("Aus lassen fuer Messungen: Karte und Route bleiben bei der alten Ortung, die neue wird nur aufgezeichnet.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text("Schalter wirken nach dem naechsten App-Start (App beenden und neu oeffnen).")
                        .font(.caption)
                        .foregroundStyle(.secondary)

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
                        // Schnellauswahl Testraum: setzt Marker und Wahrheit auf die Zellmitte, kein Kartentipp noetig.
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 8) {
                            ForEach(TestRoomMarkers.numbers, id: \.self) { number in
                                Button("M\(number)") { recorder.recordTestRoomMarker(number) }
                                    .buttonStyle(.borderedProminent)
                                    .tint(recorder.selectedMarker == number ? .green : .blue)
                                    .accessibilityIdentifier("marker-quick-M\(number)")
                            }
                        }
                        .padding(.vertical, 4)
                        Text("M1 bis M8 stehen am Marker: ein Druck schreibt Marker und Wahrheit an die Zellmitte.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
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
                                .foregroundStyle(.orange)
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

                    Text("Export: Aufnahme antippen (Teilen-Blatt), z. B. In Dateien sichern oder AirDrop. Alternativ Dateien-App, Auf meinem iPhone, Indooro, NavigationRecordings.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("Langer Druck auf die Karte setzt eine Wahrheitsmarkierung, ohne die Position zu aendern. Szenario und Rolle gelten ab dem Start der Aufnahme, der Marker ab dem naechsten Wahrheitsmarker.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                #endif

                #if DEBUG
                Section("Beacons live") {
                    LiveBeaconList()
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

#if DEBUG
/// Alle gehoerten iBeacons nach RSSI sortiert (Sichtpruefung vor Ort: Sind alle vier Beacons da, wie stark?).
private struct LiveBeaconList: View {
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let entries = LiveBeaconStore.shared.snapshot()
            if entries.isEmpty {
                Text("Noch keine Beacons gehoert. Modus „Mit Ortung“ waehlen, Bluetooth und Standort erlauben.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(entries) { entry in
                    let age = context.date.timeIntervalSince(entry.lastSeen)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text("Major \(entry.major) / Minor \(entry.minor)").font(.subheadline.monospacedDigit())
                            Spacer()
                            Text(entry.rssi < 0 ? "\(entry.rssi) dBm" : "– dBm").font(.subheadline.monospacedDigit())
                        }
                        Text("\(entry.uuid) · vor \(Int(max(age, 0))) s")
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    .opacity(age > 5 ? 0.4 : 1)
                }
            }
        }
        Button("Liste leeren", role: .destructive) { LiveBeaconStore.shared.clear() }
    }
}
#endif
