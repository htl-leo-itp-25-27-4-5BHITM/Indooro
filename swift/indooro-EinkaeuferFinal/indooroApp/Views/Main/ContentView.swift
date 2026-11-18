import IndooroModels
import SwiftUI

struct ContentView: View {
    @StateObject var beaconManager: BeaconManager
    @StateObject private var navigationSession = NavigationSession()
    @StateObject private var shoppingListManager = ShoppingListManager()
    @StateObject private var shoppingSessionManager = ShoppingSessionManager()
    @StateObject private var mapProductSearch = ProductSearchStore()
    @StateObject private var productsSearch = ProductSearchStore()
    @StateObject private var recipeStore = RecipeStore()
    @StateObject private var studyStore = StudySessionStore(enabled: AppEnvironment.isStudyModeEnabled)
    @State private var showsStudySession = false
    @State private var upsellStore = UpsellModel()

    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(AppEnvironment.profileOverrideKey) private var profileOverride = ""
    @AppStorage("IndooroIntroductionCompleted") private var introductionCompleted = false
    @State private var showsIntroduction = false
    @State private var router = AppRouter()

    init(dependencies: AppDependencies = .live) {
        _beaconManager = StateObject(wrappedValue: BeaconManager(dependencies: dependencies))
    }

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.selectedSection) {
            Tab("Start", systemImage: "house.fill", value: AppSection.start) {
                HomeDashboardView(
                    selectedList: shoppingListManager.selectedList,
                    activeBanner: shoppingSessionManager.banner()
                )
            }

            Tab("Planung", systemImage: "plus.circle.fill", value: AppSection.planning) {
                ProductsPage(
                    listManager: shoppingListManager,
                    sessionManager: shoppingSessionManager,
                    beaconManager: beaconManager,
                    productSearch: productsSearch,
                    onNavigateToProduct: focusProductOnMap,
                    onAddToList: addProductToShoppingList
                )
            }

            if AppEnvironment.allowsExtendedFeatures {
                Tab("Rezepte", systemImage: "fork.knife", value: AppSection.recipes) {
                    RecipesPage(
                        recipeStore: recipeStore,
                        listManager: shoppingListManager,
                        sessionManager: shoppingSessionManager,
                        beaconManager: beaconManager,
                        onRecipeItemsAdded: { syncShoppingSession() }
                    )
                }
            }

            Tab("Einkaufen", systemImage: "checklist.checked", value: AppSection.shopping) {
                ShoppingListsPage(
                    listManager: shoppingListManager,
                    sessionManager: shoppingSessionManager,
                    beaconManager: beaconManager,
                    upsellStore: upsellStore,
                    pendingImportPackage: $router.pendingShoppingImportPackage,
                    importErrorMessage: $router.shoppingImportErrorMessage,
                    onStartSession: startShoppingSession,
                    onStopSession: stopShoppingSession
                )
            }

            Tab("Karte", systemImage: "map.fill", value: AppSection.map) {
                StoreMapPage(
                    beaconManager: beaconManager,
                    navigationSession: navigationSession,
                    shoppingListManager: shoppingListManager,
                    shoppingSessionManager: shoppingSessionManager,
                    productSearch: mapProductSearch,
                    upsellStore: upsellStore,
                    targetProduct: $router.targetProduct,
                    pendingLastStoreLayoutOpenRequest: $router.pendingLastStoreLayoutOpenRequest,
                    onNavigateToProduct: focusProductOnMap,
                    onAddToList: addProductToShoppingList
                )
                .safeAreaInset(edge: .top) {
                    VStack(spacing: 0) {
                        PermissionBanner(manager: beaconManager)
                        ProductSearchFeedback(store: mapProductSearch)
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    if AppEnvironment.isStudyModeEnabled && studyStore.session != nil {
                        VStack {
                            if studyStore.running?.task.condition == .app { StudyRunningControls(store: studyStore) }
                            Button("Testleitung") { showsStudySession = true }
                        }
                        .padding(.horizontal)
                        .background(.regularMaterial)
                    }
                }
            }
        }
        // Untere Tab-Leiste auch auf dem iPad (die Tab-API zeigt dort sonst eine obere Leiste).
        .tabViewStyle(.tabBarOnly)
        .environment(router)
        .tint(Color(red: 0.12, green: 0.46, blue: 0.39))
        .preferredColorScheme(.light)
        .alert("Filiale erkannt: \(beaconManager.suggestedPilotStore?.name ?? "") – öffnen?", isPresented: Binding(
            get: { beaconManager.suggestedPilotStore != nil },
            set: { if !$0 { beaconManager.suggestedPilotStore = nil } }
        ), presenting: beaconManager.suggestedPilotStore) { store in
            Button("Öffnen") { beaconManager.openSuggestedPilotStore(store) }
            Button("Abbrechen", role: .cancel) { beaconManager.suggestedPilotStore = nil }
        }
        .onReceive(NotificationCenter.default.publisher(for: StudySessionStore.openRequested)) { _ in
            guard AppEnvironment.isStudyModeEnabled else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { showsStudySession = true }
        }
        .sheet(isPresented: $showsStudySession) { StudySessionView(store: studyStore, beaconManager: beaconManager) }
        .onChange(of: mapProductSearch.errorMessage) { _, message in if let message { studyStore.recordError(message) } }
        .onChange(of: productsSearch.errorMessage) { _, message in if let message { studyStore.recordError(message) } }
        .sheet(isPresented: $showsIntroduction) {
            PilotIntroduction { introductionCompleted = true; showsIntroduction = false }
        }
        .onAppear {
            studyStore.onStartAppTask = { task in
                showsStudySession = false
                router.pendingLastStoreLayoutOpenRequest = UUID()
                focusProductOnMap(Product(id: task.productId, name: task.productName, price: 0, layoutCode: task.layoutCode ?? ""))
            }
            studyStore.counterSnapshot = { [weak navigationSession] in
                guard let navigationSession else { return StudyCounters() }
                return StudyCounters(routeBuildCount: navigationSession.routeBuildCount,
                                     rerouteCount: navigationSession.rerouteCount,
                                     stopChangeWithoutEventCount: navigationSession.stopChangeWithoutEventCount,
                                     manualPositionCount: navigationSession.manualPositionCount,
                                     arrivalSuggestionShownCount: navigationSession.arrivalSuggestionShownCount,
                                     arrivalSuggestionAcceptedCount: navigationSession.arrivalSuggestionAcceptedCount,
                                     arrivalSuggestionRejectedCount: navigationSession.arrivalSuggestionRejectedCount)
            }
            showsIntroduction = !introductionCompleted
            let provider: () -> MobileStoreSummary? = { [weak beaconManager] in
                beaconManager?.activeLayoutStore ?? beaconManager?.detectedStore
            }
            mapProductSearch.storeProvider = provider
            productsSearch.storeProvider = provider
            navigationSession.attach(to: beaconManager)
            shoppingSessionManager.bind(navigationSession: navigationSession)
            syncShoppingSession()
        }
        .onChange(of: beaconManager.effectiveStoreCode, initial: true) { _, newStoreCode in
            mapProductSearch.setActiveStore(code: newStoreCode)
            productsSearch.setActiveStore(code: newStoreCode)
        }
        .onChange(of: router.targetProduct, initial: false) { _, newProduct in
            guard !shoppingSessionManager.isActive else { return }
            beaconManager.setTargetProduct(newProduct)
        }
        .onChange(of: beaconManager.layoutRevision) { _, _ in
            if shoppingSessionManager.isActive {
                syncShoppingSession(event: .layoutChanged)
            } else if let targetProduct = router.targetProduct {
                beaconManager.setTargetProduct(targetProduct)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            // Listen werden um 300 ms entprellt geschrieben; beim Verlassen der App sofort sichern.
            if phase != .active {
                Task {
                    await shoppingSessionManager.drainPendingWrites()
                    await shoppingListManager.flush()
                }
            }
        }
        .onChange(of: shoppingListManager.revision) { _, _ in
            guard shoppingSessionManager.isActive else { return }
            syncShoppingSession()
        }
        .onChange(of: profileOverride) { _, _ in
            upsellStore.resetSession()
            if !AppEnvironment.allowsExtendedFeatures && router.selectedSection == .recipes { router.open(.start) }
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
        router.showOnMap(product)
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
        router.openMapForShoppingSession()
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
        router.receiveShoppingTransfer(Result { try ShoppingTransferService.loadPackage(from: url) })
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView(dependencies: .preview)
    }
}
