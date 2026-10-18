import IndooroModels
import IndooroNetworking
import SwiftUI

struct StudySessionView: View {
    @ObservedObject var store: StudySessionStore
    @ObservedObject var beaconManager: BeaconManager
    @StateObject private var products = ProductSearchStore()
    @State private var testId = ""
    @State private var query = ""
    @State private var note = ""
    @State private var exportFiles: [URL] = []
    @State private var confirmsDeletion = false
    @State private var resolvingTask: Int?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                if let error = store.errorMessage {
                    Section { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.red) }
                }
                Section("Sitzung") {
                    TextField("Test-ID", text: $testId)
                        .textInputAutocapitalization(.characters).autocorrectionDisabled()
                    Text("Test-ID im Format T07. Keine Namen oder Kontaktdaten eingeben.")
                        .font(.caption)
                    Button("Sitzung starten") {
                        perform { try store.createSession(testId: testId, storeCode: beaconManager.activeLayoutStore?.storeCode ?? "") }
                        exportFiles = []
                    }
                    .disabled(!StudyFormat.isValidID(testId) || store.running != nil)
                    if !store.savedSessions.isEmpty {
                        Picker("Gespeicherte Sitzung", selection: Binding(
                            get: { store.session?.id },
                            set: { id in
                                if let id { perform { try store.selectSession(id) }; exportFiles = [] }
                            }
                        )) {
                            ForEach(store.savedSessions) { saved in
                                Text("\(saved.testId) · \(saved.startedAt.formatted(date: .numeric, time: .shortened))").tag(Optional(saved.id))
                            }
                        }
                        .disabled(store.running != nil)
                    }
                    if let session = store.session {
                        Text("Aktive Sitzung: \(session.testId)")
                        Text("Navigationsmesswerte sind noch nicht verfügbar. Zeit und Ergebnis werden erfasst.")
                            .font(.caption)
                    }
                }
                if let session = store.session {
                    Section("Aufgaben") {
                        ForEach(session.tasks) { task in
                            VStack(alignment: .leading, spacing: 10) {
                                Text("\(task.no). \(task.productName)").font(.headline)
                                if session.rows.contains(where: { $0.task.no == task.no }) {
                                    Label("Abgeschlossen", systemImage: "checkmark.circle")
                                } else {
                                    Picker("Bedingung", selection: Binding(
                                        get: { store.session?.tasks.first(where: { $0.no == task.no })?.condition ?? task.condition },
                                        set: { condition in perform { try store.updateTask(task.no, condition: condition) } }
                                    )) {
                                        ForEach(StudyCondition.allCases) { condition in Text(condition.title).tag(condition) }
                                    }
                                    .accessibilityIdentifier("study.condition.\(task.no)")
                                    Button("Start") { prepareAndStart(task) }
                                        .accessibilityIdentifier("study.start.\(task.no)")
                                        .buttonStyle(.borderedProminent)
                                        .frame(minHeight: 44)
                                        .disabled(store.running != nil || resolvingTask != nil)
                                }
                            }
                            .disabled(store.running != nil)
                        }
                    }
                    if store.running != nil {
                        Section { StudyRunningControls(store: store) }
                    }
                    Section("Produkt als Aufgabe hinzufügen") {
                        TextField("Produkt suchen", text: $query)
                            .textInputAutocapitalization(.never)
                            .onSubmit { products.searchProducts(query: query) }
                            .disabled(store.running != nil)
                        ProductSearchFeedback(store: products)
                        ForEach(products.searchResults) { product in
                            Button(product.name) {
                                perform { try store.addTask(productId: product.id, productName: product.name, layoutCode: product.layoutCode) }
                                products.clearSearch(); query = ""
                            }
                            .disabled(store.running != nil)
                        }
                    }
                    Section("Notizen") {
                        Text("Keine Namen oder Kontaktdaten eingeben. Notizen bleiben lokal und erscheinen nur in den Ereignissen.").font(.caption)
                        TextField("Notiz zur Aufgabe", text: $note, axis: .vertical)
                        Button("Notiz speichern") { perform { try store.addNote(note) }; note = "" }
                    }
                    Section("Export") {
                        Button("Export vorbereiten") { perform { exportFiles = try store.exportURLs() } }
                            .disabled(store.running != nil)
                        if !exportFiles.isEmpty {
                            ShareLink(items: exportFiles) { Label("CSV und Ereignisse teilen", systemImage: "square.and.arrow.up") }
                        }
                        Button("Alle Sitzungen löschen", role: .destructive) { confirmsDeletion = true }
                            .disabled(store.running != nil)
                    }
                }
            }
            .navigationTitle("Testleitung")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } } }
            .confirmationDialog("Alle Sitzungen löschen?", isPresented: $confirmsDeletion, titleVisibility: .visible) {
                Button("Alle Sitzungen löschen", role: .destructive) {
                    perform { try store.deleteAll() }; exportFiles = []
                }
            } message: { Text("Alle lokalen Studien-Sitzungen werden entfernt. Bereits geteilte Dateien bleiben bestehen.") }
            .onAppear { products.storeProvider = { [weak beaconManager] in beaconManager?.activeLayoutStore ?? beaconManager?.detectedStore } }
            .onChange(of: products.errorMessage) { _, message in if let message { store.recordError(message) } }
        }
    }

    private func perform(_ action: () throws -> Void) {
        do { try action(); store.errorMessage = nil } catch { store.errorMessage = error.localizedDescription }
    }
    private func begin(_ no: Int) {
        perform { try store.start(taskNo: no, positioningMode: beaconManager.trackingMode == .beacon ? "mit_ortung" : "ohne_ortung") }
    }
    private func prepareAndStart(_ task: StudyTask) {
        guard task.condition == .app && (task.layoutCode?.isEmpty ?? true) else { begin(task.no); return }
        resolvingTask = task.no
        Task { @MainActor in
            defer { resolvingTask = nil }
            do {
                let result = await AppEnvironment.apiClient.sendResult(LegacyGETEndpoint(path: "/products/\(task.productId)"))
                let raw: RawJSON
                switch result {
                case .failure(let error): store.errorMessage = PilotHTTP.message(for: error); return
                case .success(let value): raw = value
                }
                let product = try JSONDecoder.indooro.decode(Product.self, from: raw.data)
                guard !product.layoutCode.isEmpty else { store.errorMessage = "Zu diesem Produkt ist keine Regalposition gespeichert."; return }
                try store.updateTask(task.no, productName: product.name, layoutCode: product.layoutCode)
                begin(task.no)
            } catch { store.errorMessage = "Das Produkt konnte nicht geladen werden. Bitte erneut versuchen." }
        }
    }
}

struct StudyRunningControls: View {
    @ObservedObject var store: StudySessionStore
    var body: some View {
        if let running = store.running {
            VStack(alignment: .leading, spacing: 10) {
                Text(running.task.productName).font(.headline)
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    Text(String(format: "%.0f s", store.elapsed)).font(.title2.monospacedDigit())
                }
                ForEach(StudyOutcome.allCases) { outcome in
                    Button(outcome.title) {
                        do { try store.finish(outcome) } catch { store.errorMessage = "Das Ergebnis konnte nicht gespeichert werden." }
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(minHeight: 44)
                }
            }
            .padding(.vertical, 8)
        }
    }
}
