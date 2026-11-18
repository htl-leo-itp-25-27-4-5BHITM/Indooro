import IndooroModels
import SwiftUI

struct ShoppingStopMarker: View {
    let index: Int
    let isActive: Bool

    private var tint: Color {
        isActive ? Color(red: 0.00, green: 0.43, blue: 0.36) : Color(red: 0.15, green: 0.57, blue: 0.88)
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(Color(uiColor: .systemBackground))
                .frame(width: isActive ? 34 : 28, height: isActive ? 34 : 28)
                .shadow(color: tint.opacity(0.18), radius: 8, y: 4)

            Circle()
                .fill(
                    LinearGradient(
                        colors: [tint, tint.opacity(0.82)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: isActive ? 26 : 20, height: isActive ? 26 : 20)

            Text("\(index)")
                .font(.caption2.weight(.bold))
                .foregroundColor(.white)
        }
    }
}

struct ShoppingSessionPanel: View {
    let snapshot: ShoppingRouteSnapshot
    /// „Route ab …“ bei Fallback-Ursprung, sonst nil.
    let routeOriginText: String?
    /// Kundensprachlicher Standorttext eines Stopps (Regal des ersten Artikels).
    let locationText: (ShoppingStop) -> String?
    let onOpenList: () -> Void
    let onMarkCurrentStopDone: () -> Void
    let onSkipCurrentStop: () -> Void
    let onToggleMode: () -> Void
    let onReplan: () -> Void

    private let accent = Color(red: 0.00, green: 0.43, blue: 0.36)
    @ScaledMetric(relativeTo: .title) private var arrowIconSize: CGFloat = 30

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            if let currentStop = snapshot.currentStop {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: arrowIconSize))
                        .foregroundStyle(.white, accent)
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(currentStop.title)
                            .font(.subheadline.weight(.bold))
                            .lineLimit(1)

                        if let location = locationText(currentStop) {
                            Text(location)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(accent)
                                .lineLimit(1)
                        }

                        Text(currentStop.itemNamesPreview)
                            .font(.caption)
                            .foregroundStyle(Color.a11ySecondaryText)
                            .lineLimit(1)

                        if let routeOriginText {
                            Text(routeOriginText)
                                .font(.caption2)
                                .foregroundStyle(Color.a11ySecondaryText)
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: 0)

                    VStack(alignment: .trailing, spacing: 3) {
                        Button(snapshot.routeMode.title) {
                            onToggleMode()
                        }
                        .font(.caption2.weight(.semibold))
                        .buttonStyle(.plain)
                        .foregroundStyle(accent)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())

                        Button("Neu planen") {
                            onReplan()
                        }
                        .font(.caption2.weight(.semibold))
                        .buttonStyle(.plain)
                        .foregroundStyle(accent)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())

                        Text("\(snapshot.remainingStopCount) Stopps · \(snapshot.remainingProductCount) offen")
                            .font(.caption2)
                            .foregroundStyle(Color.a11ySecondaryText)
                            .lineLimit(1)
                    }
                }

                HStack(spacing: 7) {
                    Button {
                        onMarkCurrentStopDone()
                    } label: {
                        Text("Erledigt")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.white)
                    .frame(height: 44)
                    .background(accent, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                    Button("Überspringen") {
                        onSkipCurrentStop()
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(accent)
                    .frame(height: 44)
                    .padding(.horizontal, 10)
                    .background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                    Button {
                        onOpenList()
                    } label: {
                        Image(systemName: "list.bullet")
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(accent)
                    .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityLabel("Einkaufsliste öffnen")
                }
            } else {
                HStack(spacing: 10) {
                    Text("Alle Stopps erledigt!")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Spacer()

                    Button("Einkaufen öffnen") {
                        onOpenList()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(accent)
                    .controlSize(.small)
                }
            }

            if snapshot.unresolvedProductCount > 0 {
                Label(
                    "\(snapshot.unresolvedProductCount) Artikel ohne Regalposition",
                    systemImage: "exclamationmark.triangle"
                )
                .font(.caption2)
                .foregroundStyle(Color.a11yWarningText)
            }
        }
        .padding(12)
        .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.primary.opacity(0.055), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.05), radius: 12, y: 6)
        .accessibilityIdentifier("tourPanel")
    }
}

private enum ShoppingShareMode {
    case copy
    case move
}

private struct ShoppingSharePresentation: Identifiable {
    let id = UUID()
    let fileURL: URL
    let sourceListID: UUID
    let movedSelections: [ShoppingShareSelection]?
}

private struct ShoppingSelectionContext: Identifiable {
    let id = UUID()
    let listID: UUID
}

struct UpsellPromptSheet: View {
    let prompt: UpsellPrompt
    let onAddSuggestion: (UpsellSuggestion) -> Void
    let onDismiss: () -> Void
    let onSuppressProduct: () -> Void

    private let accent = Color(red: 0.00, green: 0.43, blue: 0.36)

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Zu \(prompt.checkedProductName) passt vielleicht noch:")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .accessibilityAddTraits(.isHeader)

                        ForEach(prompt.suggestions) { suggestion in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .firstTextBaseline, spacing: 10) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(suggestion.product.name)
                                            .font(.headline)
                                            .lineLimit(2)

                                        Text(suggestion.product.detailText)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }

                                    Spacer(minLength: 0)

                                    Button {
                                        onAddSuggestion(suggestion)
                                    } label: {
                                        Label("Hinzufügen", systemImage: "plus.circle.fill")
                                            .labelStyle(.iconOnly)
                                            .font(.title3)
                                    }
                                    .buttonStyle(.plain)
                                    .foregroundStyle(accent)
                                    .frame(minWidth: 44, minHeight: 44)
                                    .contentShape(Rectangle())
                                    .accessibilityLabel("\(suggestion.product.name) hinzufügen")
                                    .accessibilityValue(suggestion.reason)
                                    .accessibilityHint("Fügt den Vorschlag der Einkaufsliste hinzu")
                                }

                                Text(suggestion.reason)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(3)
                                    .accessibilityHidden(true)
                            }
                            .padding(.vertical, 5)
                        }
                    }
                }

                Section {
                    Button("Nein danke") {
                        onDismiss()
                    }
                    .foregroundStyle(.primary)

                    Button("Nicht mehr für dieses Produkt") {
                        onSuppressProduct()
                    }
                    .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Passt gut dazu")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private enum ProductDiscoveryMode {
    case none
    case search
    case category
}

private enum ShoppingCategoryFilter: String, CaseIterable, Identifiable {
    case obstGemuese
    case milchprodukte
    case backwaren
    case getraenke
    case snacks
    case tiefkuehlprodukte
    case kaeseWurst
    case teigwarenNudeln
    case konservensaucen
    case muesliFruehstueck
    case oeleEssig
    case haushaltReinigung
    case koerperpflegeHygiene

    var id: String { rawValue }

    static var quickCategories: [ShoppingCategoryFilter] {
        [
            .obstGemuese,
            .milchprodukte,
            .backwaren,
            .getraenke,
            .snacks,
            .tiefkuehlprodukte
        ]
    }

    static var additionalCategories: [ShoppingCategoryFilter] {
        [
            .kaeseWurst,
            .teigwarenNudeln,
            .konservensaucen,
            .muesliFruehstueck,
            .oeleEssig,
            .haushaltReinigung,
            .koerperpflegeHygiene
        ]
    }

    var title: String {
        switch self {
        case .obstGemuese:
            return "Obst & Gemüse"
        case .milchprodukte:
            return "Milchprodukte"
        case .backwaren:
            return "Backwaren"
        case .getraenke:
            return "Getränke"
        case .snacks:
            return "Snacks"
        case .tiefkuehlprodukte:
            return "Tiefkühlprodukte"
        case .kaeseWurst:
            return "Käse & Wurst"
        case .teigwarenNudeln:
            return "Teigwaren & Nudeln"
        case .konservensaucen:
            return "Konserven & Saucen"
        case .muesliFruehstueck:
            return "Müsli & Frühstück"
        case .oeleEssig:
            return "Öle & Essig"
        case .haushaltReinigung:
            return "Haushalt & Reinigung"
        case .koerperpflegeHygiene:
            return "Körperpflege & Hygiene"
        }
    }

    var query: String {
        switch self {
        case .obstGemuese:
            return "Obst Gemuese"
        case .milchprodukte:
            return "Milch"
        case .backwaren:
            return "Brot"
        case .getraenke:
            return "Getraenke"
        case .snacks:
            return "Snack"
        case .tiefkuehlprodukte:
            return "Tiefkuehl"
        case .kaeseWurst:
            return "Kaese Wurst"
        case .teigwarenNudeln:
            return "Nudeln"
        case .konservensaucen:
            return "Konserven"
        case .muesliFruehstueck:
            return "Muesli"
        case .oeleEssig:
            return "Oel Essig"
        case .haushaltReinigung:
            return "Reinigung"
        case .koerperpflegeHygiene:
            return "Hygiene"
        }
    }

    var layoutCodePrefixes: [String] {
        switch self {
        case .obstGemuese:
            return ["310"]
        case .milchprodukte:
            return ["520"]
        case .backwaren:
            return ["445"]
        case .getraenke:
            return ["510"]
        case .snacks:
            return ["470"]
        case .tiefkuehlprodukte:
            return ["530"]
        case .kaeseWurst:
            return ["525"]
        case .teigwarenNudeln:
            return ["430"]
        case .konservensaucen:
            return ["420"]
        case .muesliFruehstueck:
            return ["440"]
        case .oeleEssig:
            return ["450"]
        case .haushaltReinigung:
            return ["610"]
        case .koerperpflegeHygiene:
            return ["640"]
        }
    }

    var symbol: String {
        switch self {
        case .obstGemuese:
            return "carrot.fill"
        case .milchprodukte:
            return "drop.fill"
        case .backwaren:
            return "birthday.cake.fill"
        case .getraenke:
            return "waterbottle.fill"
        case .snacks:
            return "popcorn.fill"
        case .tiefkuehlprodukte:
            return "snowflake"
        case .kaeseWurst:
            return "fork.knife.circle.fill"
        case .teigwarenNudeln:
            return "fork.knife"
        case .konservensaucen:
            return "cylinder.fill"
        case .muesliFruehstueck:
            return "cup.and.saucer.fill"
        case .oeleEssig:
            return "drop.fill"
        case .haushaltReinigung:
            return "sparkles"
        case .koerperpflegeHygiene:
            return "shower.fill"
        }
    }
}

private enum ProductCertificationFilter: String, CaseIterable, Identifiable {
    case plain
    case bio
    case demeter

    var id: String { rawValue }

    var title: String {
        switch self {
        case .plain:
            return "Ohne Kennzeichnung"
        case .bio:
            return "Bio"
        case .demeter:
            return "Demeter"
        }
    }

    var shortTitle: String {
        switch self {
        case .plain:
            return "Ohne"
        case .bio:
            return "Bio"
        case .demeter:
            return "Demeter"
        }
    }
}

struct ProductsPage: View {
    @ObservedObject var listManager: ShoppingListManager
    @ObservedObject var sessionManager: ShoppingSessionManager
    @ObservedObject var beaconManager: BeaconManager
    @ObservedObject var productSearch: ProductSearchStore

    let onNavigateToProduct: (Product) -> Void
    let onAddToList: (Product) -> Void

    @Environment(AppRouter.self) private var router
    @State private var searchText = ""
    @State private var selectedCategory: ShoppingCategoryFilter?
    @State private var selectedCertification: ProductCertificationFilter = .plain
    @State private var discoveryMode: ProductDiscoveryMode = .none
    @State private var resultsScrollRequest = 0

    private let accent = Color(red: 0.00, green: 0.43, blue: 0.36)
    private let routeAccent = Color(red: 0.15, green: 0.57, blue: 0.88)

    private var pageBackground: Color {
        Color(uiColor: .systemGroupedBackground)
    }

    private var controlBackground: Color {
        Color(uiColor: .secondarySystemGroupedBackground)
    }

    private var selectedList: ShoppingList? {
        listManager.selectedList
    }

    private var plannedItems: [ShoppingListItem] {
        guard let selectedList else { return [] }
        return selectedList.items
            .filter { $0.status == .open }
            .sorted(by: ShoppingListItem.sortByListOrder)
    }

    private var displayedProducts: [Product] {
        let sortedResults = productSearch.searchResults.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }

        switch discoveryMode {
        case .none:
            return []
        case .search:
            return sortedResults
        case .category:
            return sortedResults.filter(matchesSelectedCertification)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { scrollProxy in
                List {
                    searchSection

                    if shouldShowResults {
                        resultsSection
                            .id(ProductsPageScrollTarget.results)
                    }

                    plannedItemsSection
                    recommendationsSection
                    categorySection
                }
                .navigationTitle("Planung")
                .scrollContentBackground(.hidden)
                .background(pageBackground.ignoresSafeArea())
                .listStyle(.insetGrouped)
                .onChange(of: resultsScrollRequest, initial: false) { _, _ in
                    scrollToResults(with: scrollProxy)
                }
            }
        }
        .onChange(of: searchText, initial: false) { _, newValue in
            handleSearchTextChange(newValue)
        }
        .onChange(of: selectedCategory, initial: false) { _, newValue in
            handleCategorySelectionChange(newValue)
        }
    }

    private var searchSection: some View {
        Section("Produkt hinzufügen") {
            searchField

            if productSearch.isSearching {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Produkte werden gesucht...")
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)

            TextField("Was möchtest du kaufen?", text: $searchText)
                .textFieldStyle(.plain)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .onSubmit {
                    submitSearch()
                }

            if !searchText.isEmpty {
                Button {
                    searchText = ""
                    if let selectedCategory {
                        discoveryMode = .category
                        productSearch.searchProducts(layoutCodePrefixes: selectedCategory.layoutCodePrefixes, size: 500)
                    } else {
                        discoveryMode = .none
                        productSearch.clearSearch()
                    }
                    dismissKeyboard()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Suche löschen")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(controlBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var plannedItemsSection: some View {
        Section("Schon geplant") {
            if plannedItems.isEmpty {
                HStack(spacing: 12) {
                    Image(systemName: "basket")
                        .font(.title3)
                        .foregroundStyle(accent)
                        .frame(width: 40, height: 40)
                        .background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                    VStack(alignment: .leading, spacing: 3) {
                        Text("Noch keine Produkte")
                            .font(.subheadline.weight(.semibold))

                        Text("Suche oben oder tippe auf eine Kategorie.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            } else {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(selectedList?.name ?? "Meine Einkaufsliste")
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)

                        Text("\(selectedList?.openItemCount ?? 0) Artikel offen")
                            .font(.caption)
                            .foregroundStyle(Color.a11ySecondaryText)
                    }

                    Spacer(minLength: 0)

                    Button {
                        router.open(.shopping)
                    } label: {
                        Text("Einkaufen")
                            .font(.caption.weight(.semibold))
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(accent)
                }
                .padding(.vertical, 2)

                ForEach(plannedItems.prefix(7)) { item in
                    PlannedProductRow(
                        item: item,
                        locationText: shelfPrimaryText(for: item, shelves: beaconManager.shelves),
                        onRemove: {
                            removePlannedItem(item)
                        }
                    )
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            removePlannedItem(item)
                        } label: {
                            Label("Löschen", systemImage: "trash")
                        }
                    }
                }

                if plannedItems.count > 7 {
                    Button {
                        router.open(.shopping)
                    } label: {
                        Label("Alle \(plannedItems.count) Artikel anzeigen", systemImage: "checklist.checked")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(accent)
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private var categorySection: some View {
        Section("Kategorien") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 102), spacing: 10)], spacing: 10) {
                ForEach(ShoppingCategoryFilter.quickCategories) { category in
                    Button {
                        selectCategory(category)
                    } label: {
                        categoryTile(category)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selectedCategory == category ? .isSelected : [])
                }
            }
            .padding(.vertical, 4)

            otherCategoryMenu

            if selectedCategory != nil {
                Picker("Kennzeichnung", selection: $selectedCertification) {
                    ForEach(ProductCertificationFilter.allCases) { filter in
                        Text(filter.shortTitle).tag(filter)
                    }
                }
                .pickerStyle(.segmented)

                Button("Zurücksetzen") {
                    clearCategorySelection()
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(accent)
            }
        }
    }

    private var otherCategoryMenu: some View {
        Menu {
            ForEach(ShoppingCategoryFilter.additionalCategories) { category in
                Button {
                    selectCategory(category)
                } label: {
                    if selectedCategory == category {
                        Label(category.title, systemImage: "checkmark")
                    } else {
                        Label(category.title, systemImage: category.symbol)
                    }
                }
            }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: selectedAdditionalCategory?.symbol ?? "square.grid.2x2")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(accent)
                    .frame(width: 34, height: 34)
                    .background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())

                VStack(alignment: .leading, spacing: 2) {
                    Text("Weitere Kategorie")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Text(selectedAdditionalCategory?.title ?? "Kategorie auswählen")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.down")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.primary.opacity(0.06), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var selectedAdditionalCategory: ShoppingCategoryFilter? {
        guard let selectedCategory,
              ShoppingCategoryFilter.additionalCategories.contains(selectedCategory) else {
            return nil
        }

        return selectedCategory
    }

    private func categoryTile(_ category: ShoppingCategoryFilter) -> some View {
        let isSelected = selectedCategory == category

        return VStack(spacing: 8) {
            Image(systemName: isSelected ? "checkmark.circle.fill" : category.symbol)
                .font(.title3.weight(.semibold))
                .foregroundStyle(isSelected ? .white : accent)
                .frame(width: 38, height: 38)
                .background(isSelected ? accent : accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            Text(category.title)
                .font(.caption.weight(.semibold))
                .multilineTextAlignment(.center)
                .foregroundStyle(.primary)
                .lineLimit(2)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 84)
        .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(isSelected ? accent.opacity(0.28) : Color.primary.opacity(0.06), lineWidth: 1)
        )
    }

    private var resultsSection: some View {
        Section(resultsTitle) {
            if discoveryMode == .category, let selectedCategory {
                HStack {
                    Label(selectedCategory.title, systemImage: selectedCategory.symbol)
                        .foregroundStyle(accent)
                    Spacer()
                    Text(selectedCertification.title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }

            if productSearch.errorMessage != nil {
                ProductSearchFeedback(store: productSearch)
            } else if !displayedProducts.isEmpty {
                ForEach(displayedProducts, id: \.self) { product in
                    ProductSearchRow(
                        product: product,
                        isInShoppingList: listManager.containsProduct(product),
                        onNavigate: {
                            onNavigateToProduct(product)
                            clearDiscovery()
                        },
                        onAddToList: {
                            onAddToList(product)
                        }
                    )
                    .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
            } else if !productSearch.isSearching {
                ContentUnavailableView(
                    productSearch.lastQuery.map { "Keine Treffer für „\($0)“" } ?? "Keine passenden Produkte",
                    systemImage: "magnifyingglass",
                    description: Text(emptyText)
                )
            }
        }
    }

    private var recommendationsSection: some View {
        Section("Passt gut dazu") {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(recommendations) { suggestion in
                        Button {
                            searchSuggestion(suggestion)
                        } label: {
                            Label(suggestion.title, systemImage: suggestion.systemImage)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(suggestion.tint)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .background(suggestion.tint.opacity(0.10), in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var shouldShowResults: Bool {
        productSearch.isSearching || discoveryMode != .none
    }

    private var resultsTitle: String {
        switch discoveryMode {
        case .none:
            return "Produkte"
        case .search:
            return "Suchergebnisse"
        case .category:
            return "Passende Produkte"
        }
    }

    private var emptyText: String {
        switch discoveryMode {
        case .category:
            return "Für diese Kategorie und Kennzeichnung wurden keine Produkte gefunden."
        case .search:
            return "Probiere einen anderen Suchbegriff."
        case .none:
            return "Noch keine Suche aktiv."
        }
    }

    private var recommendations: [ProductSuggestion] {
        switch selectedCategory {
        case .obstGemuese:
            return [
                ProductSuggestion(title: "Joghurt", query: "Joghurt", systemImage: "drop.fill", tint: routeAccent),
                ProductSuggestion(title: "Nüsse", query: "Nuesse", systemImage: "leaf.fill", tint: accent),
                ProductSuggestion(title: "Haferflocken", query: "Hafer", systemImage: "fork.knife", tint: .orange)
            ]
        case .milchprodukte:
            return [
                ProductSuggestion(title: "Müsli", query: "Muesli", systemImage: "fork.knife", tint: .orange),
                ProductSuggestion(title: "Kaffee", query: "Kaffee", systemImage: "cup.and.saucer.fill", tint: accent),
                ProductSuggestion(title: "Brot", query: "Brot", systemImage: "birthday.cake.fill", tint: .brown)
            ]
        case .backwaren:
            return [
                ProductSuggestion(title: "Butter", query: "Butter", systemImage: "drop.fill", tint: routeAccent),
                ProductSuggestion(title: "Marmelade", query: "Marmelade", systemImage: "leaf.fill", tint: .pink),
                ProductSuggestion(title: "Käse", query: "Kaese", systemImage: "square.grid.2x2.fill", tint: accent)
            ]
        case .getraenke:
            return [
                ProductSuggestion(title: "Snacks", query: "Snack", systemImage: "popcorn.fill", tint: .pink),
                ProductSuggestion(title: "Chips", query: "Chips", systemImage: "bag.fill", tint: .orange),
                ProductSuggestion(title: "Wasser", query: "Wasser", systemImage: "drop.fill", tint: routeAccent)
            ]
        case .snacks:
            return [
                ProductSuggestion(title: "Getränke", query: "Getraenke", systemImage: "takeoutbag.and.cup.and.straw.fill", tint: routeAccent),
                ProductSuggestion(title: "Schokolade", query: "Schokolade", systemImage: "heart.fill", tint: .pink),
                ProductSuggestion(title: "Nüsse", query: "Nuesse", systemImage: "leaf.fill", tint: accent)
            ]
        case .tiefkuehlprodukte:
            return [
                ProductSuggestion(title: "Pizza", query: "Pizza", systemImage: "snowflake", tint: routeAccent),
                ProductSuggestion(title: "Gemüse", query: "Gemuese", systemImage: "leaf.fill", tint: accent),
                ProductSuggestion(title: "Eis", query: "Eis", systemImage: "birthday.cake.fill", tint: .pink)
            ]
        case .kaeseWurst:
            return [
                ProductSuggestion(title: "Brot", query: "Brot", systemImage: "birthday.cake.fill", tint: .orange),
                ProductSuggestion(title: "Butter", query: "Butter", systemImage: "drop.fill", tint: routeAccent),
                ProductSuggestion(title: "Gurken", query: "Gurken", systemImage: "leaf.fill", tint: accent)
            ]
        case .teigwarenNudeln, .konservensaucen, .oeleEssig:
            return [
                ProductSuggestion(title: "Tomaten", query: "Tomaten", systemImage: "leaf.fill", tint: .red),
                ProductSuggestion(title: "Käse", query: "Kaese", systemImage: "square.grid.2x2.fill", tint: accent),
                ProductSuggestion(title: "Gewürze", query: "Gewuerze", systemImage: "sparkles", tint: .orange)
            ]
        case .muesliFruehstueck:
            return [
                ProductSuggestion(title: "Milch", query: "Milch", systemImage: "drop.fill", tint: routeAccent),
                ProductSuggestion(title: "Joghurt", query: "Joghurt", systemImage: "cup.and.saucer.fill", tint: accent),
                ProductSuggestion(title: "Bananen", query: "Bananen", systemImage: "leaf.fill", tint: .orange)
            ]
        case .haushaltReinigung, .koerperpflegeHygiene:
            return [
                ProductSuggestion(title: "Seife", query: "Seife", systemImage: "heart.text.square.fill", tint: accent),
                ProductSuggestion(title: "Papier", query: "Papier", systemImage: "shippingbox.fill", tint: routeAccent),
                ProductSuggestion(title: "Reinigung", query: "Reinigung", systemImage: "sparkles", tint: .orange)
            ]
        case nil:
            return [
                ProductSuggestion(title: "Milch", query: "Milch", systemImage: "drop.fill", tint: routeAccent),
                ProductSuggestion(title: "Brot", query: "Brot", systemImage: "birthday.cake.fill", tint: .orange),
                ProductSuggestion(title: "Bananen", query: "Bananen", systemImage: "leaf.fill", tint: accent),
                ProductSuggestion(title: "Kaffee", query: "Kaffee", systemImage: "cup.and.saucer.fill", tint: .brown)
            ]
        }
    }

    private func matchesSelectedCertification(_ product: Product) -> Bool {
        let normalizedName = product.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        let isDemeter = normalizedName.contains("demeter")
        let isBio = normalizedName.contains("bio")

        switch selectedCertification {
        case .plain:
            return !isBio && !isDemeter
        case .bio:
            return isBio
        case .demeter:
            return isDemeter
        }
    }

    private func handleSearchTextChange(_ newValue: String) {
        let trimmedValue = newValue.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedValue.isEmpty else {
            if selectedCategory == nil {
                discoveryMode = .none
                productSearch.clearSearch()
            }
            return
        }

        guard trimmedValue.count > 2 else {
            if selectedCategory == nil {
                discoveryMode = .none
                productSearch.clearSearch()
            }
            return
        }

        if selectedCategory != nil {
            selectedCategory = nil
        }

        discoveryMode = .search
        productSearch.searchProducts(query: trimmedValue, size: 80)
    }

    private func submitSearch() {
        let trimmedValue = searchText.trimmingCharacters(in: .whitespacesAndNewlines)

        guard trimmedValue.count > 2 else { return }

        selectedCategory = nil
        selectedCertification = .plain
        discoveryMode = .search
        productSearch.searchProducts(query: trimmedValue, size: 80)
        dismissKeyboard()
        requestResultsScroll()
    }

    private func handleCategorySelectionChange(_ newValue: ShoppingCategoryFilter?) {
        guard let newValue else {
            if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                discoveryMode = .none
                productSearch.clearSearch()
            }
            return
        }

        discoveryMode = .category
        searchText = ""
        dismissKeyboard()
        productSearch.searchProducts(layoutCodePrefixes: newValue.layoutCodePrefixes, size: 500)
        requestResultsScroll()
    }

    private func selectCategory(_ category: ShoppingCategoryFilter) {
        if selectedCategory == category {
            clearCategorySelection()
        } else {
            selectedCategory = category
        }
    }

    private func clearCategorySelection() {
        selectedCategory = nil
        selectedCertification = .plain

        if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            discoveryMode = .none
            productSearch.clearSearch()
        }
    }

    private func searchSuggestion(_ suggestion: ProductSuggestion) {
        selectedCategory = nil
        selectedCertification = .plain
        searchText = suggestion.query
        discoveryMode = .search
        dismissKeyboard()
        productSearch.searchProducts(query: suggestion.query, size: 80)
    }

    private func requestResultsScroll() {
        resultsScrollRequest += 1
    }

    private func scrollToResults(with proxy: ScrollViewProxy) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
            withAnimation(.spring(response: 0.36, dampingFraction: 0.86)) {
                proxy.scrollTo(ProductsPageScrollTarget.results, anchor: .top)
            }
        }
    }

    private func clearDiscovery() {
        searchText = ""
        selectedCategory = nil
        selectedCertification = .plain
        discoveryMode = .none
        productSearch.clearSearch()
        dismissKeyboard()
    }

    private func removePlannedItem(_ item: ShoppingListItem) {
        guard let selectedList else {
            return
        }

        listManager.removeItem(item.id, from: selectedList.id)
        syncActiveSessionIfNeeded(for: selectedList.id)
    }

    private func syncActiveSessionIfNeeded(for listID: UUID) {
        guard sessionManager.activeListID == listID else {
            return
        }

        sessionManager.sync(listManager: listManager, beaconManager: beaconManager)
    }

    private func dismissKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil, from: nil, for: nil
        )
    }
}

private struct ProductSuggestion: Identifiable {
    var id: String { "\(title)-\(query)" }
    let title: String
    let query: String
    let systemImage: String
    let tint: Color
}

/// Regaltext eines Artikels in Kundensprache (Primaertext des Descriptors); nil ohne passendes Regal.
private func shelfPrimaryText(for item: ShoppingListItem, shelves: [LayoutElement]) -> String? {
    guard let layoutCode = item.layoutCode else { return nil }
    return ShelfLocationDescriptor.make(layoutCode: layoutCode, shelves: shelves)?.primary
}

private struct PlannedProductRow: View {
    let item: ShoppingListItem
    /// Standorttext aus dem Elternview; ohne Wert: „Freier Eintrag“ bzw. Testbereich-Hinweis.
    let locationText: String?
    let onRemove: () -> Void

    private let accent = Color(red: 0.00, green: 0.43, blue: 0.36)

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.title3)
                .foregroundStyle(accent)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(item.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)

                    if item.quantity > 1 {
                        Text("x\(item.quantity)")
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.secondary.opacity(0.12), in: Capsule())
                            .foregroundStyle(.secondary)
                    }
                }

                Text(locationText ?? (item.layoutCode == nil ? "Freier Eintrag" : ShelfLocationDescriptor.notInTestAreaText))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let recipeSourceText = item.recipeSourceText {
                    Text(recipeSourceText)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 0)

            Button {
                onRemove()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Aus Planung entfernen")
        }
        .padding(.vertical, 3)
    }
}

private enum ProductsPageScrollTarget: Hashable {
    case results
}

struct ShoppingListsPage: View {
    @ObservedObject var listManager: ShoppingListManager
    @ObservedObject var sessionManager: ShoppingSessionManager
    @ObservedObject var beaconManager: BeaconManager
    var upsellStore: UpsellModel
    @Binding var pendingImportPackage: ShoppingTransferPackage?
    @Binding var importErrorMessage: String?

    let onStartSession: (UUID) -> Void
    let onStopSession: () -> Void

    @State private var showCreateAlert = false
    @State private var newListName = ""
    @State private var renameTarget: ShoppingList?
    @State private var renameDraft = ""
    @State private var showFileImporter = false
    @State private var shareSelectionContext: ShoppingSelectionContext?
    @State private var sharePresentation: ShoppingSharePresentation?
    @State private var showsCompletedItems = false
    @State private var showsUnresolvedItems = false
    @State private var storedPreview: ShoppingRouteSnapshot?

    private let accent = Color(red: 0.12, green: 0.50, blue: 0.39)

    private var pageBackground: Color {
        Color(uiColor: .systemGroupedBackground)
    }

    private var controlBackground: Color {
        Color(uiColor: .secondarySystemGroupedBackground)
    }

    private var selectedList: ShoppingList? {
        listManager.selectedList
    }

    private var activeStore: MobileStoreSummary? {
        beaconManager.activeLayoutStore ?? beaconManager.detectedStore
    }

    /// Vorschau der gewaehlten Liste. Die aktive Tour-Liste liest den gespeicherten Snapshot der
    /// Einkaufs-Session; andere Listen nutzen `storedPreview`, das nur bei Aenderung von Liste,
    /// offenen Artikeln, Fahrmodus oder Layout-Revision neu berechnet wird (nie im View-Body).
    private var selectedPreview: ShoppingRouteSnapshot? {
        guard let selectedList else {
            return nil
        }
        if selectedList.id == sessionManager.activeListID,
           let snapshot = sessionManager.snapshot,
           snapshot.listID == selectedList.id {
            return snapshot
        }
        return storedPreview
    }

    private struct PreviewKey: Equatable {
        struct Item: Equatable {
            let id: UUID
            let layoutCode: String?
            let sortOrder: Int
        }

        let listID: UUID?
        let openItems: [Item]
        let routeMode: ShoppingRouteMode
        let layoutRevision: Int
        let isActiveList: Bool
    }

    private var previewKey: PreviewKey {
        PreviewKey(
            listID: selectedList?.id,
            openItems: openItems.map {
                PreviewKey.Item(id: $0.id, layoutCode: $0.layoutCode, sortOrder: $0.effectiveSortOrder)
            },
            routeMode: sessionManager.routeMode,
            layoutRevision: beaconManager.layoutRevision,
            isActiveList: selectedList?.id == sessionManager.activeListID
        )
    }

    private func recomputeStoredPreview() {
        guard let selectedList, selectedList.id != sessionManager.activeListID else {
            storedPreview = nil
            return
        }
        storedPreview = sessionManager.previewSnapshot(
            for: selectedList.id,
            listManager: listManager,
            beaconManager: beaconManager,
            mode: .optimized
        )
    }

    private var openItems: [ShoppingListItem] {
        guard let selectedList else { return [] }
        return selectedList.items
            .filter { $0.status == .open }
            .sorted(by: ShoppingListItem.sortByListOrder)
    }

    private var completedItems: [ShoppingListItem] {
        guard let selectedList else { return [] }
        return selectedList.items
            .filter { $0.status.isCompleted }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    var body: some View {
        NavigationStack {
            List {
                if let selectedList {
                    currentListSection(selectedList)
                }

                if let preview = selectedPreview,
                   let currentStop = preview.currentStop,
                   sessionManager.activeListID == selectedList?.id {
                    nextStopSection(preview: preview, currentStop: currentStop)
                }

                openItemsSection

                if let preview = selectedPreview, !preview.unresolvedItems.isEmpty {
                    unresolvedSection(preview: preview)
                }

                if !completedItems.isEmpty {
                    completedSection
                }
            }
            .navigationTitle("Einkaufen")
            .scrollContentBackground(.hidden)
            .background(pageBackground.ignoresSafeArea())
            .listStyle(.insetGrouped)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        newListName = ""
                        showCreateAlert = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Neue Einkaufsliste")
                }
            }
        }
        .alert("Neue Liste", isPresented: $showCreateAlert) {
            TextField("Name", text: $newListName)
            Button("Abbrechen", role: .cancel) {}
            Button("Erstellen") {
                listManager.createList(named: newListName)
            }
        } message: {
            Text("Lege eine weitere Einkaufsliste an.")
        }
        .alert("Liste umbenennen", isPresented: renameAlertBinding) {
            TextField("Name", text: $renameDraft)
            Button("Abbrechen", role: .cancel) {
                renameTarget = nil
            }
            Button("Speichern") {
                if let renameTarget {
                    listManager.renameList(renameTarget.id, to: renameDraft)
                }
                renameTarget = nil
            }
        } message: {
            Text("Passe den Namen der Liste an.")
        }
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.indooroShoppingList]
        ) { result in
            handleFileImport(result)
        }
        .sheet(item: $pendingImportPackage) { package in
            ShoppingImportPreviewSheet(
                package: package,
                availableLists: listManager.lists,
                preferredMergeTargetID: listManager.selectedList?.id,
                onImportAsNewList: { listName in
                    importAsNewList(package, preferredName: listName)
                },
                onMergeIntoList: { targetListID in
                    mergeImport(package, into: targetListID)
                }
            )
        }
        .sheet(item: $shareSelectionContext) { context in
            if let list = listManager.list(with: context.listID) {
                ShoppingItemSelectionSheet(
                    list: list,
                    onShareCopy: { selections in
                        startShare(for: context.listID, selections: selections, mode: .copy)
                    },
                    onShareMove: { selections in
                        startShare(for: context.listID, selections: selections, mode: .move)
                    }
                )
            } else {
                ContentUnavailableView("Liste nicht gefunden", systemImage: "cart")
            }
        }
        .sheet(item: $sharePresentation) { presentation in
            ShareSheet(activityItems: [presentation.fileURL]) { completed in
                completeShare(presentation, completed: completed)
            }
        }
        .onChange(of: previewKey, initial: true) { _, _ in
            recomputeStoredPreview()
        }
        .onAppear {
            preloadUpcomingUpsells()
        }
        .onChange(of: selectedList?.id, initial: false) { _, _ in
            preloadUpcomingUpsells()
        }
        .onChange(of: openItems.compactMap { $0.productID }, initial: false) { _, _ in
            preloadUpcomingUpsells()
        }
        .onChange(of: activeStore?.id, initial: false) { _, _ in
            preloadUpcomingUpsells()
        }
        .alert("Aktion fehlgeschlagen", isPresented: importErrorAlertBinding) {
            Button("OK", role: .cancel) {
                importErrorMessage = nil
            }
        } message: {
            Text(importErrorMessage ?? "Die Liste konnte nicht importiert werden.")
        }
    }

    private func currentListSection(_ list: ShoppingList) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(list.name)
                            .font(.title3.weight(.semibold))
                            .accessibilityAddTraits(.isHeader)

                        Text("\(list.openItemCount) offen, \(list.completedItemCount) erledigt")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Menu {
                        if listManager.lists.count > 1 {
                            Section("Liste wechseln") {
                                ForEach(listManager.lists) { candidate in
                                    Button {
                                        listManager.selectList(candidate.id)
                                    } label: {
                                        if candidate.id == list.id {
                                            Label(candidate.name, systemImage: "checkmark")
                                        } else {
                                            Text(candidate.name)
                                        }
                                    }
                                }
                            }
                        }

                        Button {
                            renameTarget = list
                            renameDraft = list.name
                        } label: {
                            Label("Umbenennen", systemImage: "pencil")
                        }

                        Button {
                            showFileImporter = true
                        } label: {
                            Label("Importieren", systemImage: "square.and.arrow.down")
                        }

                        Button {
                            exportList(listID: list.id)
                        } label: {
                            Label("Liste exportieren", systemImage: "square.and.arrow.up")
                        }

                        if list.openItemCount > 0 {
                            Button {
                                shareSelectionContext = ShoppingSelectionContext(listID: list.id)
                            } label: {
                                Label("Artikel teilen", systemImage: "person.2")
                            }
                        }

                        if !completedItems.isEmpty {
                            Button(role: .destructive) {
                                listManager.clearCompletedItems(in: list.id)
                            } label: {
                                Label("Erledigtes entfernen", systemImage: "trash")
                            }
                        }

                        if listManager.lists.count > 1 {
                            Button(role: .destructive) {
                                if sessionManager.activeListID == list.id {
                                    onStopSession()
                                }
                                listManager.deleteList(list.id)
                            } label: {
                            Label("Liste löschen", systemImage: "trash")
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                            .accessibilityLabel("Listenaktionen")
                    }
                }

                Text(headerDescription(for: list))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                if sessionManager.activeListID == list.id {
                    HStack(spacing: 10) {
                        Button("Tour fortsetzen") {
                            onStartSession(list.id)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(accent)

                        Button("Beenden") {
                            onStopSession()
                        }
                        .buttonStyle(.bordered)
                        .tint(accent)
                    }
                } else {
                    Button("Tour starten") {
                        onStartSession(list.id)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(accent)
                    .disabled(list.openItemCount == 0)
                }
            }
            .padding(.vertical, 6)
        }
    }

    private func nextStopSection(preview: ShoppingRouteSnapshot, currentStop: ShoppingStop) -> some View {
        Section("Nächster Stopp") {
            VStack(alignment: .leading, spacing: 10) {
                Text(currentStop.title)
                    .font(.headline)

                Text(currentStop.itemNamesPreview)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Text("\(preview.remainingStopCount) Stopps und \(preview.remainingProductCount) Artikel sind noch offen.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 6)
        }
    }

    private var openItemsSection: some View {
        Section("Auf deiner Liste") {
            if openItems.isEmpty {
                ContentUnavailableView(
                    "Noch keine Artikel",
                    systemImage: "cart",
                    description: Text("Füge Produkte in der Planung hinzu.")
                )
            } else {
                ForEach(openItems) { item in
                    ShoppingChecklistRow(
                        item: item,
                        locationText: shelfPrimaryText(for: item, shelves: beaconManager.shelves),
                        isCompleted: false,
                        onToggle: {
                            completeItem(item, status: .done, source: "shopping_list")
                        }
                    )
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            if let selectedList {
                                listManager.removeItem(item.id, from: selectedList.id)
                            }
                        } label: {
                            Label("Löschen", systemImage: "trash")
                        }
                    }
                }
            }
        }
    }

    private func unresolvedSection(preview: ShoppingRouteSnapshot) -> some View {
        Section {
            DisclosureGroup(
                isExpanded: $showsUnresolvedItems,
                content: {
                    ForEach(preview.unresolvedItems) { item in
                        ShoppingChecklistRow(
                            item: item,
                            locationText: shelfPrimaryText(for: item, shelves: beaconManager.shelves),
                            isCompleted: false,
                            onToggle: {
                                completeItem(item, status: .missing, source: "shopping_list")
                            }
                        )
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                if let selectedList {
                                    listManager.removeItem(item.id, from: selectedList.id)
                                }
                            } label: {
                                Label("Löschen", systemImage: "trash")
                            }
                        }
                    }
                },
                label: {
                    Label(
                        "\(preview.unresolvedItems.count) Artikel konnten keinem Regal zugeordnet werden",
                        systemImage: "exclamationmark.triangle"
                    )
                    .foregroundStyle(Color.a11yWarningText)
                }
            )
        }
    }

    private var completedSection: some View {
        Section {
            DisclosureGroup(
                isExpanded: $showsCompletedItems,
                content: {
                    ForEach(completedItems) { item in
                        ShoppingChecklistRow(
                            item: item,
                            locationText: shelfPrimaryText(for: item, shelves: beaconManager.shelves),
                            isCompleted: true,
                            onToggle: {
                                if let selectedList {
                                    listManager.updateItemStatus(item.id, in: selectedList.id, status: .open)
                                    if sessionManager.activeListID == selectedList.id {
                                        sessionManager.sync(listManager: listManager, beaconManager: beaconManager)
                                    }
                                }
                            }
                        )
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                if let selectedList {
                                    listManager.removeItem(item.id, from: selectedList.id)
                                }
                            } label: {
                                Label("Löschen", systemImage: "trash")
                            }
                        }
                    }

                    if let selectedList {
                        Button(role: .destructive) {
                            listManager.clearCompletedItems(in: selectedList.id)
                        } label: {
                            Text("Erledigte Artikel entfernen")
                        }
                    }
                },
                label: {
                    Label("Erledigte Artikel (\(completedItems.count))", systemImage: "checkmark.circle")
                }
            )
        }
    }

    private func headerDescription(for list: ShoppingList) -> String {
        if sessionManager.activeListID == list.id {
            return "Die Tour ist aktiv. Hake ab, was du erledigt hast, oder setze die Route fort."
        }
        return "Prüfe kurz deine Artikel und starte dann deine Einkaufstour."
    }

    private func completeItem(
        _ item: ShoppingListItem,
        status: ShoppingListItemStatus,
        source: String
    ) {
        guard let selectedList else {
            return
        }

        listManager.updateItemStatus(item.id, in: selectedList.id, status: status)
        if sessionManager.activeListID == selectedList.id {
            sessionManager.sync(listManager: listManager, beaconManager: beaconManager)
        }

        guard item.productID != nil,
              let updatedList = listManager.list(with: selectedList.id) else {
            return
        }

        upsellStore.showOpportunity(
            opportunityId: UpsellModel.itemOpportunityId(for: item),
            checkedItems: [item],
            list: updatedList,
            store: activeStore,
            source: source
        )
        preloadUpcomingUpsells(for: updatedList)
    }

    private func preloadUpcomingUpsells(for list: ShoppingList? = nil) {
        guard let list = list ?? selectedList else {
            return
        }
        guard sessionManager.activeListID != list.id else {
            return
        }
        upsellStore.preloadPlan(
            for: list,
            stops: [],
            unresolvedItems: [],
            store: activeStore,
            source: "shopping_list"
        )
    }

    private func handleFileImport(_ result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            do {
                pendingImportPackage = try ShoppingTransferService.loadPackage(from: url)
                importErrorMessage = nil
            } catch {
                importErrorMessage = error.localizedDescription
            }
        case .failure(let error):
            importErrorMessage = error.localizedDescription
        }
    }

    private func exportList(listID: UUID) {
        startShare(for: listID, selections: nil, mode: .copy)
    }

    private func startShare(
        for listID: UUID,
        selections: [ShoppingShareSelection]?,
        mode: ShoppingShareMode
    ) {
        do {
            let package = try listManager.makeTransferPackage(
                for: listID,
                selections: selections,
                kind: selections == nil ? .fullList : .itemSelection
            )
            let fileURL = try ShoppingTransferService.writePackageToTemporaryFile(package)
            sharePresentation = ShoppingSharePresentation(
                fileURL: fileURL,
                sourceListID: listID,
                movedSelections: mode == .move ? selections : nil
            )
        } catch {
            importErrorMessage = error.localizedDescription
        }
    }

    private func completeShare(_ presentation: ShoppingSharePresentation, completed: Bool) {
        defer {
            try? FileManager.default.removeItem(at: presentation.fileURL)
            sharePresentation = nil
        }

        guard completed, let movedSelections = presentation.movedSelections else {
            return
        }

        listManager.removeSharedSelections(movedSelections, from: presentation.sourceListID)
        if sessionManager.activeListID == presentation.sourceListID {
            sessionManager.sync(listManager: listManager, beaconManager: beaconManager)
        }
    }

    private func importAsNewList(_ package: ShoppingTransferPackage, preferredName: String) {
        pendingImportPackage = nil
        _ = listManager.importPackageAsNewList(package, preferredName: preferredName)
    }

    private func mergeImport(_ package: ShoppingTransferPackage, into listID: UUID) {
        listManager.mergePackage(package, into: listID)
        if sessionManager.activeListID == listID {
            sessionManager.sync(listManager: listManager, beaconManager: beaconManager)
        }
        pendingImportPackage = nil
    }

    private var renameAlertBinding: Binding<Bool> {
        Binding(
            get: { renameTarget != nil },
            set: { isPresented in
                if !isPresented {
                    renameTarget = nil
                }
            }
        )
    }

    private var importErrorAlertBinding: Binding<Bool> {
        Binding(
            get: { importErrorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    importErrorMessage = nil
                }
            }
        )
    }

}

private struct ShoppingChecklistRow: View {
    let item: ShoppingListItem
    /// Standorttext aus dem Elternview; ohne Wert: „Keine Regalposition“ bzw. Testbereich-Hinweis.
    let locationText: String?
    let isCompleted: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 12) {
                Image(systemName: isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isCompleted ? .green : .blue)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(item.name)
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .strikethrough(isCompleted)

                        if item.quantity > 1 {
                            Text("x\(item.quantity)")
                                .font(.caption2.weight(.bold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.secondary.opacity(0.12), in: Capsule())
                                .foregroundStyle(.secondary)
                        }
                    }

                    Text(locationText ?? (item.layoutCode == nil ? "Keine Regalposition" : ShelfLocationDescriptor.notInTestAreaText))
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let recipeSourceText = item.recipeSourceText {
                        Text(recipeSourceText)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }

                Spacer()

                if let price = item.price {
                    Text("\(String(format: "%.2f", price)) EUR")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(AccessibilityText.shoppingItemValue(isChecked: isCompleted))
        .accessibilityAddTraits(.isButton)
    }
}
