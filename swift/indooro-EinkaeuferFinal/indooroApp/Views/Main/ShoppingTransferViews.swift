import IndooroModels
import SwiftUI

struct ShoppingImportPreviewSheet: View {
    let package: ShoppingTransferPackage
    let availableLists: [ShoppingList]
    let preferredMergeTargetID: UUID?
    let onImportAsNewList: (String) -> Void
    let onMergeIntoList: (UUID) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var mergeTargetID: UUID?
    @State private var importedListName = ""

    private var sortedItems: [ShoppingTransferItem] {
        package.items.sorted { lhs, rhs in
            lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Datei") {
                    infoRow(title: "Typ", value: package.kind.title)
                    infoRow(title: "Listenname", value: package.sourceListName)
                    infoRow(title: "Artikel", value: "\(package.totalQuantity)")
                    infoRow(title: "Exportiert", value: package.exportedAt.formatted(date: .abbreviated, time: .shortened))

                    if let sender = package.senderDisplayName, !sender.isEmpty {
                        infoRow(title: "Absender", value: sender)
                    }

                    if let note = package.note, !note.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Notiz")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(note)
                                .font(.subheadline)
                        }
                        .padding(.vertical, 2)
                    }
                }

                Section("Importieren") {
                    TextField("Name der neuen Liste", text: $importedListName)
                        .textInputAutocapitalization(.words)

                    Button("Neue Liste erstellen und importieren") {
                        onImportAsNewList(normalizedImportedListName)
                    }
                    .buttonStyle(.borderedProminent)

                    if !availableLists.isEmpty {
                        Picker("In Liste zusammenführen", selection: mergeTargetBinding) {
                            ForEach(availableLists) { list in
                                Text(list.name).tag(Optional(list.id))
                            }
                        }

                        Button("In gewählte Liste zusammenführen") {
                            guard let mergeTargetID else { return }
                            onMergeIntoList(mergeTargetID)
                        }
                        .disabled(mergeTargetID == nil)
                    }
                }

                Section("Vorschau") {
                    ForEach(sortedItems.indices, id: \.self) { index in
                        let item = sortedItems[index]
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 8) {
                                Text(item.name)
                                    .font(.subheadline.weight(.semibold))
                                if item.quantity > 1 {
                                    Text("x\(item.quantity)")
                                        .font(.caption2.weight(.bold))
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.secondary.opacity(0.12), in: Capsule())
                                }
                                Spacer()
                                Text(item.status.badgeTitle)
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(item.status == .open ? .blue : .secondary)
                            }

                            Text("Regal: \(item.layoutCode)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .navigationTitle("Liste importieren")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            if mergeTargetID == nil {
                mergeTargetID = preferredMergeTargetID ?? availableLists.first?.id
            }
            if importedListName.isEmpty {
                importedListName = package.suggestedImportedListName
            }
        }
    }

    private var normalizedImportedListName: String {
        let trimmed = importedListName.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? package.suggestedImportedListName : trimmed
    }

    private var mergeTargetBinding: Binding<UUID?> {
        Binding(
            get: { mergeTargetID },
            set: { mergeTargetID = $0 }
        )
    }

    @ViewBuilder
    private func infoRow(title: String, value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.trailing)
        }
    }
}

struct ShoppingItemSelectionSheet: View {
    let list: ShoppingList
    let onShareCopy: ([ShoppingShareSelection]) -> Void
    let onShareMove: ([ShoppingShareSelection]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selectedQuantities: [UUID: Int] = [:]

    private var openItems: [ShoppingListItem] {
        list.items
            .filter { $0.status == .open }
            .sorted(by: ShoppingListItem.sortByListOrder)
    }

    private var selectedSelections: [ShoppingShareSelection] {
        openItems.compactMap { item in
            guard let quantity = selectedQuantities[item.id] else {
                return nil
            }

            return ShoppingShareSelection(
                itemID: item.id,
                quantity: min(item.quantity, max(1, quantity))
            )
        }
    }

    private var selectedItemCount: Int {
        selectedSelections.count
    }

    private var selectedQuantityCount: Int {
        selectedSelections.reduce(0) { $0 + $1.quantity }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Text("\(selectedItemCount) von \(openItems.count) Positionen, \(selectedQuantityCount) Artikel ausgewählt")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("Alle") {
                            selectAll()
                        }
                        .font(.caption.weight(.semibold))

                        Button("Keine") {
                            selectedQuantities.removeAll()
                        }
                        .font(.caption.weight(.semibold))
                    }
                }

                Section("Offene Artikel") {
                    ForEach(openItems) { item in
                        VStack(alignment: .leading, spacing: 10) {
                            Button {
                                toggle(item)
                            } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Image(systemName: isSelected(item) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(isSelected(item) ? .blue : .secondary)
                                        .font(.title3)

                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack(spacing: 6) {
                                            Text(item.name)
                                                .font(.subheadline.weight(.semibold))
                                                .foregroundStyle(.primary)
                                            if item.quantity > 1 {
                                                Text("x\(item.quantity)")
                                                    .font(.caption2.weight(.bold))
                                                    .padding(.horizontal, 5)
                                                    .padding(.vertical, 2)
                                                    .background(Color.secondary.opacity(0.12), in: Capsule())
                                                    .foregroundStyle(.secondary)
                                            }
                                        }

                                        Text(item.layoutCode.map { "Regal: \($0)" } ?? "Freier Eintrag")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)

                                        if let note = item.trimmedNote {
                                            Text(note)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                                .lineLimit(2)
                                        }
                                    }

                                    Spacer()
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)

                            if isSelected(item), item.quantity > 1 {
                                Stepper(
                                    value: quantityBinding(for: item),
                                    in: 1...item.quantity
                                ) {
                                    Text("Teilen: \(selectedQuantities[item.id] ?? item.quantity) von \(item.quantity)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .navigationTitle("Artikel teilen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 10) {
                    Button("Kopie teilen") {
                        share(using: onShareCopy)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(selectedSelections.isEmpty)

                    Button("Aus Liste senden") {
                        share(using: onShareMove)
                    }
                    .buttonStyle(.bordered)
                    .disabled(selectedSelections.isEmpty)
                }
                .padding()
                .background(.regularMaterial)
            }
        }
    }

    private func isSelected(_ item: ShoppingListItem) -> Bool {
        selectedQuantities[item.id] != nil
    }

    private func toggle(_ item: ShoppingListItem) {
        if isSelected(item) {
            selectedQuantities[item.id] = nil
        } else {
            selectedQuantities[item.id] = item.quantity
        }
    }

    private func selectAll() {
        selectedQuantities = Dictionary(
            uniqueKeysWithValues: openItems.map { ($0.id, $0.quantity) }
        )
    }

    private func share(using action: @escaping ([ShoppingShareSelection]) -> Void) {
        let selections = selectedSelections
        dismiss()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            action(selections)
        }
    }

    private func quantityBinding(for item: ShoppingListItem) -> Binding<Int> {
        Binding(
            get: { selectedQuantities[item.id] ?? item.quantity },
            set: { newValue in
                selectedQuantities[item.id] = min(item.quantity, max(1, newValue))
            }
        )
    }
}
