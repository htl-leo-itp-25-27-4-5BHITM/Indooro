import SwiftUI

struct RecipesPage: View {
    @ObservedObject var recipeStore: RecipeStore
    @ObservedObject var listManager: ShoppingListManager
    @ObservedObject var sessionManager: ShoppingSessionManager
    @ObservedObject var beaconManager: BeaconManager
    let onOpenShopping: () -> Void
    let onRecipeItemsAdded: () -> Void

    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            RecipeListView(
                recipes: recipeStore.recipes,
                isLoading: recipeStore.isLoading || recipeStore.isSearching,
                errorMessage: recipeStore.errorMessage,
                onRetry: loadCurrentRecipes,
                destination: { recipe in
                    RecipeDetailView(
                        recipeID: recipe.id,
                        recipeStore: recipeStore,
                        listManager: listManager,
                        sessionManager: sessionManager,
                        beaconManager: beaconManager,
                        onOpenShopping: onOpenShopping,
                        onRecipeItemsAdded: onRecipeItemsAdded
                    )
                }
            )
            .navigationTitle("Rezepte")
            .searchable(text: $searchText, prompt: "Rezepte suchen")
            .onChange(of: searchText) { _, newValue in
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.count >= 2 {
                    recipeStore.searchRecipes(query: trimmed)
                } else if trimmed.isEmpty {
                    recipeStore.loadRecipes()
                }
            }
            .onAppear {
                if recipeStore.recipes.isEmpty {
                    recipeStore.loadRecipes()
                }
            }
            .refreshable {
                loadCurrentRecipes()
            }
        }
    }

    private func loadCurrentRecipes() {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count >= 2 {
            recipeStore.searchRecipes(query: trimmed)
        } else {
            recipeStore.loadRecipes()
        }
    }
}

struct RecipeListView<Destination: View>: View {
    let recipes: [RecipeSummary]
    let isLoading: Bool
    let errorMessage: String?
    let onRetry: () -> Void
    @ViewBuilder let destination: (RecipeSummary) -> Destination

    var body: some View {
        Group {
            if isLoading && recipes.isEmpty {
                ProgressView("Rezepte werden geladen")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage, recipes.isEmpty {
                RecipeStateView(
                    systemImage: "wifi.exclamationmark",
                    title: "Rezepte nicht erreichbar",
                    message: errorMessage,
                    buttonTitle: "Erneut laden",
                    action: onRetry
                )
            } else if recipes.isEmpty {
                RecipeStateView(
                    systemImage: "fork.knife.circle",
                    title: "Keine Rezepte gefunden",
                    message: "Sobald veröffentlichte Rezepte im Backend sind, erscheinen sie hier.",
                    buttonTitle: "Aktualisieren",
                    action: onRetry
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(recipes) { recipe in
                            NavigationLink {
                                destination(recipe)
                            } label: {
                                RecipeCard(recipe: recipe)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                }
                .background(Color(uiColor: .systemGroupedBackground))
            }
        }
    }
}

struct RecipeDetailView: View {
    let recipeID: UUID
    @ObservedObject var recipeStore: RecipeStore
    @ObservedObject var listManager: ShoppingListManager
    @ObservedObject var sessionManager: ShoppingSessionManager
    @ObservedObject var beaconManager: BeaconManager
    let onOpenShopping: () -> Void
    let onRecipeItemsAdded: () -> Void

    @State private var showsAddSheet = false

    private var activeStore: MobileStoreSummary? {
        beaconManager.activeLayoutStore ?? beaconManager.detectedStore
    }

    var body: some View {
        Group {
            if recipeStore.isLoadingDetail && recipeStore.selectedRecipe?.id != recipeID {
                ProgressView("Rezept wird geladen")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let recipe = recipeStore.selectedRecipe, recipe.id == recipeID {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        RecipeHero(recipe: recipe)

                        if recipeStore.isLoadingMapping {
                            ProgressView("Produktzuordnung wird geprüft")
                                .frame(maxWidth: .infinity, alignment: .center)
                        }

                        RecipeIngredientList(
                            ingredients: recipe.ingredients,
                            mappings: recipeStore.mappingResponse?.ingredients ?? []
                        )

                        RecipeStepsView(steps: recipe.steps)
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 96)
                }
                .background(Color(uiColor: .systemGroupedBackground))
                .safeAreaInset(edge: .bottom) {
                    Button {
                        showsAddSheet = true
                    } label: {
                        Label("Zur Einkaufsliste", systemImage: "cart.badge.plus")
                            .font(.headline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.white)
                    .background(Color(red: 0.00, green: 0.43, blue: 0.36), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .padding(16)
                    .background(.ultraThinMaterial)
                    .disabled(recipeStore.mappingResponse == nil)
                    .accessibilityLabel("Rezept zur Einkaufsliste hinzufügen")
                }
                .sheet(isPresented: $showsAddSheet) {
                    if let mapping = recipeStore.mappingResponse {
                        AddRecipeToShoppingListSheet(
                            recipe: recipe,
                            mapping: mapping,
                            listManager: listManager,
                            includeFreeIngredientsDefault: true,
                            onAdded: { targetListID in
                                if sessionManager.activeListID == targetListID {
                                    onRecipeItemsAdded()
                                }
                                onOpenShopping()
                            }
                        )
                    }
                }
            } else {
                RecipeStateView(
                    systemImage: "exclamationmark.triangle",
                    title: "Rezept nicht geladen",
                    message: recipeStore.errorMessage ?? "Bitte versuche es erneut.",
                    buttonTitle: "Erneut laden",
                    action: loadRecipe
                )
            }
        }
        .navigationTitle(recipeStore.selectedRecipe?.id == recipeID ? recipeStore.selectedRecipe?.displayTitle ?? "Rezept" : "Rezept")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color(uiColor: .systemGroupedBackground), for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .onAppear(perform: loadRecipe)
    }

    private func loadRecipe() {
        recipeStore.loadRecipe(id: recipeID)
        recipeStore.loadMapping(recipeId: recipeID, store: activeStore)
    }
}

struct AddRecipeToShoppingListSheet: View {
    let recipe: RecipeDetail
    let mapping: RecipeProductMappingResponse
    @ObservedObject var listManager: ShoppingListManager
    let includeFreeIngredientsDefault: Bool
    let onAdded: (UUID?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var includeFreeIngredients: Bool
    @State private var selectedIngredientIDs: Set<UUID>
    @State private var selectedListID: UUID?

    init(
        recipe: RecipeDetail,
        mapping: RecipeProductMappingResponse,
        listManager: ShoppingListManager,
        includeFreeIngredientsDefault: Bool,
        onAdded: @escaping (UUID?) -> Void
    ) {
        self.recipe = recipe
        self.mapping = mapping
        self.listManager = listManager
        self.includeFreeIngredientsDefault = includeFreeIngredientsDefault
        self.onAdded = onAdded
        _includeFreeIngredients = State(initialValue: includeFreeIngredientsDefault)
        _selectedIngredientIDs = State(initialValue: Set(recipe.ingredients.map(\.id)))
        _selectedListID = State(initialValue: listManager.selectedList?.id)
    }

    private var mappedCount: Int {
        mapping.ingredients.filter {
            selectedIngredientIDs.contains($0.ingredientId) && $0.product?.product != nil
        }.count
    }

    private var unmappedCount: Int {
        recipe.ingredients.filter { ingredient in
            selectedIngredientIDs.contains(ingredient.id)
                && mapping.ingredients.first(where: { $0.ingredientId == ingredient.id })?.product?.product == nil
        }.count
    }

    private var selectedCount: Int {
        selectedIngredientIDs.count
    }

    private var canAdd: Bool {
        selectedListID != nil && !selectedIngredientIDs.isEmpty
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Liste", selection: $selectedListID) {
                        ForEach(listManager.lists) { list in
                            Text(list.name).tag(Optional(list.id))
                        }
                    }

                    Toggle("Zutaten ohne Marktprodukt als freie Einträge behalten", isOn: $includeFreeIngredients)
                }

                Section("Vorschau") {
                    Label("\(mappedCount) Zutaten werden als Marktprodukte hinzugefügt", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    if unmappedCount > 0 {
                        Label("\(unmappedCount) Zutaten ohne Produkt bleiben sichtbar", systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(Color.a11yWarningText)
                    }
                    if selectedCount == 0 {
                        Label("Wähle mindestens eine Zutat aus", systemImage: "info.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Zutaten auswählen") {
                    ForEach(recipe.ingredients.sorted(by: { $0.position < $1.position })) { ingredient in
                        AddRecipeIngredientSelectionRow(
                            ingredient: ingredient,
                            status: mapping.ingredients.first(where: { $0.ingredientId == ingredient.id }),
                            isSelected: selectedIngredientIDs.contains(ingredient.id),
                            onToggle: {
                                toggleIngredient(ingredient.id)
                            }
                        )
                    }
                }
            }
            .navigationTitle("Rezept hinzufügen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hinzufügen") {
                        let changed = listManager.addRecipeIngredients(
                            recipe: recipe,
                            mapping: mapping,
                            includeFreeIngredients: includeFreeIngredients,
                            selectedIngredientIDs: selectedIngredientIDs,
                            to: selectedListID
                        )
                        if !changed.isEmpty {
                            onAdded(selectedListID)
                        }
                        dismiss()
                    }
                    .disabled(!canAdd)
                }
            }
        }
    }

    private func toggleIngredient(_ id: UUID) {
        if selectedIngredientIDs.contains(id) {
            selectedIngredientIDs.remove(id)
        } else {
            selectedIngredientIDs.insert(id)
        }
    }
}

struct RecipeIngredientList: View {
    let ingredients: [RecipeIngredient]
    let mappings: [RecipeIngredientMappingStatus]

    private var mappingByIngredientID: [UUID: RecipeIngredientMappingStatus] {
        Dictionary(uniqueKeysWithValues: mappings.map { ($0.ingredientId, $0) })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Zutaten")
                .font(.headline.weight(.semibold))

            ForEach(ingredients.sorted(by: { $0.position < $1.position })) { ingredient in
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            if let amount = ingredient.amountText {
                                Text(amount)
                                    .font(.subheadline.weight(.semibold))
                            }
                            Text(ingredient.cleanLocalizedDisplayName)
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                        }

                        if let note = ingredient.localizedPreparationNote, !note.isEmpty {
                            Text(note)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer(minLength: 0)

                    IngredientMappingStatusView(status: mappingByIngredientID[ingredient.id])
                }
                .padding(12)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }
}

struct IngredientMappingStatusView: View {
    let status: RecipeIngredientMappingStatus?

    private var title: String {
        guard let status else { return "Nicht gefunden" }
        switch status.status {
        case .mapped:
            return "Im Markt"
        case .productWithoutLayout:
            return "Ohne Regal"
        case .multipleCandidates:
            return "Auswahl nötig"
        case .unavailableInStore:
            return "Nicht im Markt"
        case .unmapped:
            return "Nicht gefunden"
        }
    }

    private var symbol: String {
        guard let status else { return "questionmark.circle" }
        switch status.status {
        case .mapped:
            return "checkmark.circle.fill"
        case .productWithoutLayout:
            return "mappin.slash.circle.fill"
        case .multipleCandidates:
            return "ellipsis.circle.fill"
        case .unavailableInStore:
            return "xmark.circle.fill"
        case .unmapped:
            return "questionmark.circle"
        }
    }

    private var tint: Color {
        guard let status else { return Color.a11yWarningText }
        switch status.status {
        case .mapped:
            return .green
        case .productWithoutLayout, .multipleCandidates:
            return Color.a11yWarningText
        case .unavailableInStore, .unmapped:
            return .secondary
        }
    }

    var body: some View {
        Label(title, systemImage: symbol)
            .font(.caption.weight(.semibold))
            .foregroundStyle(tint)
            .accessibilityLabel("Zuordnung: \(title)")
    }
}

private struct AddRecipeIngredientSelectionRow: View {
    let ingredient: RecipeIngredient
    let status: RecipeIngredientMappingStatus?
    let isSelected: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(isSelected ? Color(red: 0.00, green: 0.43, blue: 0.36) : .secondary)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        if let amount = ingredient.amountText {
                            Text(amount)
                                .font(.subheadline.weight(.bold))
                        }
                        Text(ingredient.cleanLocalizedDisplayName)
                            .font(.subheadline)
                    }
                    if let note = ingredient.localizedPreparationNote, !note.isEmpty {
                        Text(note)
                            .font(.caption)
                            .foregroundStyle(Color.a11ySecondaryText)
                    }
                }

                Spacer(minLength: 8)

                IngredientMappingStatusView(status: status)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(ingredient.amountText.map { "\($0) " } ?? "")\(ingredient.cleanLocalizedDisplayName)")
        .accessibilityValue(isSelected ? "Wird hinzugefügt" : "Wird nicht hinzugefügt")
    }
}

struct RecipeCard: View {
    let recipe: RecipeSummary

    private let accent = Color(red: 0.00, green: 0.43, blue: 0.36)

    var body: some View {
        HStack(alignment: .top, spacing: 18) {
            RecipeImage(urlString: recipe.imageUrl, title: recipe.title)
                .frame(width: 108, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .shadow(color: .black.opacity(0.06), radius: 5, x: 0, y: 3)

            VStack(alignment: .leading, spacing: 7) {
                Text(recipe.displayTitle)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                if let summary = recipe.displaySummary, !summary.isEmpty {
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 10) {
                    Label("\(recipe.servings)", systemImage: "person.2")
                    if let total = recipe.totalTimeMinutes {
                        Label("\(total) min", systemImage: "clock")
                    }
                    if let total = recipe.totalIngredientCount {
                        Label("\(total)", systemImage: "basket")
                    }
                }
                .font(.caption2.weight(.semibold))
                .foregroundStyle(accent)
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 128, alignment: .leading)
        .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.primary.opacity(0.06), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }
}

private struct RecipeHero: View {
    let recipe: RecipeDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack(alignment: .bottomLeading) {
                RecipeImage(urlString: recipe.imageUrl, title: recipe.title)
                    .frame(maxWidth: .infinity)
                    .frame(height: 260)

                LinearGradient(
                    colors: [
                        .clear,
                        Color(uiColor: .systemBackground).opacity(0.82),
                        Color(uiColor: .systemBackground)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 150)

                VStack(alignment: .leading, spacing: 10) {
                    Text(recipe.displayTitle)
                        .font(.system(.title, design: .rounded, weight: .bold))
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)

                    if let summary = recipe.displaySummary, !summary.isEmpty {
                        Text(summary)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }

                    HStack(spacing: 12) {
                        Label("\(recipe.servings) Portionen", systemImage: "person.2")
                        if let total = recipe.totalTimeMinutes {
                            Label("\(total) min", systemImage: "clock")
                        }
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color(red: 0.00, green: 0.43, blue: 0.36))
                }
                .padding(18)
            }
            .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 8)

            if !recipe.tags.isEmpty {
                FlowTagRow(tags: recipe.tags)
            }
        }
        .padding(.top, 16)
    }
}

private struct RecipeStepsView: View {
    let steps: [RecipeStep]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Zubereitung")
                .font(.headline.weight(.semibold))

            ForEach(steps.sorted(by: { $0.position < $1.position })) { step in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(step.position)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(Color(red: 0.00, green: 0.43, blue: 0.36), in: Circle())

                    VStack(alignment: .leading, spacing: 4) {
                        Text(step.displayInstruction)
                            .font(.subheadline)
                        if let duration = step.durationMinutes {
                            Text("\(duration) min")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(12)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }
}

private struct RecipeImage: View {
    let urlString: String?
    let title: String
    @ScaledMetric(relativeTo: .title) private var fallbackIconSize: CGFloat = 34

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(red: 0.00, green: 0.43, blue: 0.36).opacity(0.10))

            if let urlString,
               let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case let .success(image):
                        image
                            .resizable()
                            .scaledToFill()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .clipped()
                    case .failure:
                        fallback
                    case .empty:
                        ProgressView()
                    @unknown default:
                        fallback
                    }
                }
            } else {
                fallback
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityLabel("Bild zu \(title)")
    }

    private var fallback: some View {
        Image(systemName: "fork.knife.circle.fill")
            .font(.system(size: fallbackIconSize))
            .foregroundStyle(Color(red: 0.00, green: 0.43, blue: 0.36))
    }
}

private struct FlowTagRow: View {
    let tags: [RecipeTag]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tags) { tag in
                    Text(tag.displayName)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(Color.primary.opacity(0.07), in: Capsule())
                }
            }
        }
    }
}

private struct RecipeStateView: View {
    let systemImage: String
    let title: String
    let message: String
    let buttonTitle: String
    let action: () -> Void
    @ScaledMetric(relativeTo: .title) private var iconSize: CGFloat = 42

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: iconSize))
                .foregroundStyle(Color(red: 0.00, green: 0.43, blue: 0.36))

            Text(title)
                .font(.headline.weight(.semibold))

            Text(message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 28)

            Button(buttonTitle, action: action)
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.00, green: 0.43, blue: 0.36))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(uiColor: .systemGroupedBackground))
    }
}
