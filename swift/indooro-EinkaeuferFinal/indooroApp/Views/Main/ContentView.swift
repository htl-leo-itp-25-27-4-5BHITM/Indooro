import SwiftUI

private enum AppSection: Hashable {
    case start
    case planning
    case recipes
    case shopping
    case map
}

struct ContentView: View {
    @StateObject var beaconManager = BeaconManager()
    @StateObject private var navigationSession = NavigationSession()
    @StateObject private var shoppingListManager = ShoppingListManager()
    @StateObject private var shoppingSessionManager = ShoppingSessionManager()
    @StateObject private var mapProductSearch = ProductSearchStore()
    @StateObject private var productsSearch = ProductSearchStore()
    @StateObject private var recipeStore = RecipeStore()
    @StateObject private var upsellStore = UpsellSuggestionStore()

    @AppStorage(AppEnvironment.profileOverrideKey) private var profileOverride = ""
    @State private var selectedSection: AppSection = .start
    @State private var targetProduct: Product?
    @State private var pendingShoppingImportPackage: ShoppingTransferPackage?
    @State private var shoppingImportErrorMessage: String?
    @State private var pendingLastStoreLayoutOpenRequest: UUID?

    var body: some View {
        TabView(selection: $selectedSection) {
            HomeDashboardView(
                selectedList: shoppingListManager.selectedList,
                activeBanner: shoppingSessionManager.banner(),
                onOpenPlanning: { selectedSection = .planning },
                onOpenRecipes: { selectedSection = .recipes },
                onOpenShopping: { selectedSection = .shopping },
                onOpenMap: { selectedSection = .map }
            )
            .tabItem {
                Label("Start", systemImage: "house.fill")
            }
            .tag(AppSection.start)

            ProductsPage(
                listManager: shoppingListManager,
                sessionManager: shoppingSessionManager,
                beaconManager: beaconManager,
                productSearch: productsSearch,
                onNavigateToProduct: focusProductOnMap,
                onAddToList: addProductToShoppingList,
                onOpenShopping: { selectedSection = .shopping }
            )
            .tabItem {
                Label("Planung", systemImage: "plus.circle.fill")
            }
            .tag(AppSection.planning)

            if AppEnvironment.allowsExtendedFeatures {
            RecipesPage(
                recipeStore: recipeStore,
                listManager: shoppingListManager,
                sessionManager: shoppingSessionManager,
                beaconManager: beaconManager,
                onOpenShopping: { selectedSection = .shopping },
                onRecipeItemsAdded: { syncShoppingSession() }
            )
            .tabItem {
                Label("Rezepte", systemImage: "fork.knife")
            }
            .tag(AppSection.recipes)
            }

            ShoppingListsPage(
                listManager: shoppingListManager,
                sessionManager: shoppingSessionManager,
                beaconManager: beaconManager,
                upsellStore: upsellStore,
                pendingImportPackage: $pendingShoppingImportPackage,
                importErrorMessage: $shoppingImportErrorMessage,
                onStartSession: startShoppingSession,
                onStopSession: stopShoppingSession
            )
            .tabItem {
                Label("Einkaufen", systemImage: "checklist.checked")
            }
            .tag(AppSection.shopping)

            StoreMapPage(
                beaconManager: beaconManager,
                navigationSession: navigationSession,
                shoppingListManager: shoppingListManager,
                shoppingSessionManager: shoppingSessionManager,
                productSearch: mapProductSearch,
                upsellStore: upsellStore,
                targetProduct: $targetProduct,
                pendingLastStoreLayoutOpenRequest: $pendingLastStoreLayoutOpenRequest,
                onNavigateToProduct: focusProductOnMap,
                onOpenLists: { selectedSection = .shopping },
                onAddToList: addProductToShoppingList
            )
            .tabItem {
                Label("Karte", systemImage: "map.fill")
            }
            .tag(AppSection.map)
        }
        .tint(Color(red: 0.12, green: 0.46, blue: 0.39))
        .preferredColorScheme(.light)
        .alert("Filiale erkannt: \(beaconManager.suggestedPilotStore?.name ?? "") – öffnen?", isPresented: Binding(
            get: { beaconManager.suggestedPilotStore != nil },
            set: { if !$0 { beaconManager.suggestedPilotStore = nil } }
        )) {
            Button("Öffnen") { beaconManager.openSuggestedPilotStore() }
            Button("Abbrechen", role: .cancel) { beaconManager.suggestedPilotStore = nil }
        }
        .onAppear {
            navigationSession.attach(to: beaconManager)
            shoppingSessionManager.bind(navigationSession: navigationSession)
            syncShoppingSession()
        }
        .onChange(of: targetProduct, initial: false) { _, newProduct in
            guard !shoppingSessionManager.isActive else { return }
            beaconManager.setTargetProduct(newProduct)
        }
        .onChange(of: beaconManager.layoutRevision) { _, _ in
            if shoppingSessionManager.isActive {
                syncShoppingSession(event: .layoutChanged)
            } else if let targetProduct {
                beaconManager.setTargetProduct(targetProduct)
            }
        }
        .onChange(of: shoppingListManager.revision) { _, _ in
            guard shoppingSessionManager.isActive else { return }
            syncShoppingSession()
        }
        .onChange(of: profileOverride) { _, _ in
            upsellStore.resetSession()
            if !AppEnvironment.allowsExtendedFeatures && selectedSection == .recipes { selectedSection = .start }
        }
        .onOpenURL { url in
            handleIncomingShoppingTransfer(url)
        }
        .sheet(item: upsellPromptBinding) { prompt in
            UpsellPromptSheet(
                prompt: prompt,
                onAddSuggestion: { suggestion in
                    addUpsellSuggestion(suggestion, prompt: prompt)
                },
                onDismiss: {
                    upsellStore.dismissCurrentPrompt()
                },
                onSuppressProduct: {
                    upsellStore.dismissCurrentPrompt(suppressProduct: true)
                }
            )
            .presentationDetents([.height(360), .medium])
            .presentationDragIndicator(.visible)
        }
    }

    private var upsellPromptBinding: Binding<UpsellPrompt?> {
        Binding(
            get: { AppEnvironment.allowsExtendedFeatures ? upsellStore.activePrompt : nil },
            set: { newValue in
                if newValue == nil {
                    upsellStore.clearPrompt(reason: "sheet_binding_nil")
                }
            }
        )
    }

    private func focusProductOnMap(_ product: Product) {
        stopShoppingSession()
        withAnimation {
            targetProduct = product
            selectedSection = .map
        }
        mapProductSearch.clearSearch()
    }

    private func addProductToShoppingList(_ product: Product) {
        let targetListID = shoppingListManager.selectedList?.id
        _ = shoppingListManager.addProduct(product, to: targetListID)
        if shoppingSessionManager.activeListID == targetListID {
            syncShoppingSession()
        }
    }

    private func addUpsellSuggestion(_ suggestion: UpsellSuggestion, prompt: UpsellPrompt) {
        _ = shoppingListManager.addProduct(
            suggestion.product.product,
            to: prompt.listID,
            addedFromUpsell: true
        )
        if shoppingSessionManager.activeListID == prompt.listID {
            syncShoppingSession()
        }
        upsellStore.accept(suggestion, prompt: prompt)
    }

    private func startShoppingSession(for listID: UUID) {
        shoppingListManager.selectList(listID)
        upsellStore.resetSession()
        withAnimation {
            targetProduct = nil
            pendingLastStoreLayoutOpenRequest = UUID()
            selectedSection = .map
        }
        mapProductSearch.clearSearch()
        productsSearch.clearSearch()
        shoppingSessionManager.startSession(
            for: listID,
            listManager: shoppingListManager,
            beaconManager: beaconManager
        )
    }

    private func stopShoppingSession() {
        upsellStore.clearPrompt(reason: "stop_shopping_session")
        shoppingSessionManager.stopSession(beaconManager: beaconManager)
    }

    private func syncShoppingSession(event: ShoppingSyncEvent = .listChanged) {
        shoppingSessionManager.sync(
            listManager: shoppingListManager,
            beaconManager: beaconManager,
            event: event
        )
    }

    private func handleIncomingShoppingTransfer(_ url: URL) {
        do {
            pendingShoppingImportPackage = try ShoppingTransferService.loadPackage(from: url)
            shoppingImportErrorMessage = nil
        } catch {
            pendingShoppingImportPackage = nil
            shoppingImportErrorMessage = error.localizedDescription
        }
        selectedSection = .shopping
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
