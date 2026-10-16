import SwiftUI
import MapKit

struct StoreMapPage: View {
    @ObservedObject var beaconManager: BeaconManager
    @ObservedObject var navigationSession: NavigationSession
    @ObservedObject var shoppingListManager: ShoppingListManager
    @ObservedObject var shoppingSessionManager: ShoppingSessionManager
    @ObservedObject var productSearch: ProductSearchStore
    @ObservedObject var upsellStore: UpsellSuggestionStore

    @Binding var targetProduct: Product?
    @Binding var pendingLastStoreLayoutOpenRequest: UUID?

    let onNavigateToProduct: (Product) -> Void
    let onOpenLists: () -> Void
    let onAddToList: (Product) -> Void

    @State private var searchText = ""
    @State private var showARRoute = false
    @State private var mapScale: Double = 1.0
    @State private var showSettings = false
    @State private var isShowingStoreOverview = true
    @State private var nextTapSetsPosition = false
    @State private var showAnchorScanner = false
    @State private var anchorScanStatusMessage: String?
    /// Payload eines Scans einer anderen Filiale; solange gesetzt, zeigt ein Alert den Wechsel an.
    @State private var pendingStoreSwitchPayload: AnchorPayload?
    /// Gescannter Anker, der nach dem Store-Wechsel automatisch gesetzt wird.
    @State private var pendingAnchorScan: PendingAnchorScan?
    @State private var pendingStoreSelectionID: UUID?
    @State private var storeCameraPosition: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 48.3069, longitude: 14.2858),
            span: MKCoordinateSpan(latitudeDelta: 0.34, longitudeDelta: 0.48)
        )
    )

    private let accent = Color(red: 0.00, green: 0.43, blue: 0.36)
    private let routeAccent = Color(red: 0.15, green: 0.57, blue: 0.88)

    private var activeShoppingSnapshot: ShoppingRouteSnapshot? {
        shoppingSessionManager.snapshot
    }

    private var activeStore: MobileStoreSummary? {
        beaconManager.activeLayoutStore ?? beaconManager.detectedStore
    }

    /// Offline-Start: die Filialliste ist leer (kein Netz), aber eine Offline-Kopie des Stores ist aktiv.
    /// Dann gibt es in der Filialuebersicht nichts zu waehlen und die Karte wird direkt gezeigt.
    private var hasOfflineStoreLayoutWithoutStoreList: Bool {
        beaconManager.mobileStores.isEmpty && beaconManager.activeLayoutStore != nil
    }

    private var displayUserPosition: CGPoint? {
        beaconManager.userPosition ?? beaconManager.rawUserPosition
    }

    private var showsDebugMapElements: Bool {
        beaconManager.trackingMode == .debugNoBeacons
    }

    private var targetRouteDistanceText: String? {
        guard let meters = activeRouteDistanceMeters else { return nil }
        if meters < 1 {
            return "Noch unter 1 m"
        }
        return "Noch ca. \(Int(meters.rounded())) m"
    }

    var body: some View {
        ZStack {
            if isShowingStoreOverview {
                storeOverviewView
                    .transition(.opacity)
            } else {
                indoorLayoutView
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .onAppear {
            if beaconManager.mobileStores.isEmpty {
                beaconManager.refreshMobileStores()
            }
            preloadUpcomingSessionUpsells()
            if openLastStoreLayoutIfRequested() {
                return
            }
            withAnimation(.snappy(duration: 0.2)) {
                isShowingStoreOverview = !(beaconManager.isActiveLayoutFromDetectedStore || hasOfflineStoreLayoutWithoutStoreList)
            }
        }
        .onChange(of: beaconManager.mobileStores, initial: false) { _, _ in
            fitStorePins()
        }
        .onChange(of: beaconManager.activeLayoutStore?.id, initial: false) { _, newValue in
            guard newValue != nil else { return }
            let shouldOpenLayout = beaconManager.isActiveLayoutFromDetectedStore
                || pendingStoreSelectionID == newValue
                || hasOfflineStoreLayoutWithoutStoreList
            if shouldOpenLayout {
                pendingStoreSelectionID = nil
                clearSearchAndDismissKeyboard()
                withAnimation(.snappy(duration: 0.28)) {
                    isShowingStoreOverview = false
                }
            }
        }
        .onChange(of: beaconManager.activeLayoutStore?.id, initial: false) { _, _ in
            resolvePendingAnchorScan()
        }
        .onChange(of: beaconManager.activeLayoutStoreSource, initial: false) { _, newValue in
            guard newValue == .beacon, beaconManager.activeLayoutStore != nil else { return }
            pendingStoreSelectionID = nil
            clearSearchAndDismissKeyboard()
            withAnimation(.snappy(duration: 0.28)) {
                isShowingStoreOverview = false
            }
        }
        .onChange(of: pendingLastStoreLayoutOpenRequest, initial: false) { _, _ in
            _ = openLastStoreLayoutIfRequested()
        }
        .onChange(of: beaconManager.isLoadingLayout, initial: false) { _, isLoading in
            guard !isLoading else { return }
            if shoppingSessionManager.activeListID != nil {
                shoppingSessionManager.sync(
                    listManager: shoppingListManager,
                    beaconManager: beaconManager
                )
                preloadUpcomingSessionUpsells()
            }
            if let pendingStoreSelectionID,
               beaconManager.activeLayoutStore?.id == pendingStoreSelectionID {
                self.pendingStoreSelectionID = nil
                clearSearchAndDismissKeyboard()
                withAnimation(.snappy(duration: 0.28)) {
                    isShowingStoreOverview = false
                }
            } else if pendingStoreSelectionID != nil {
                pendingStoreSelectionID = nil
            }
        }
        .onChange(of: searchText, initial: false) { _, newValue in
            let query = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if query.count > 2 {
                productSearch.searchProducts(query: query)
            } else {
                productSearch.clearSearch()
            }
        }
        .onChange(of: shoppingSessionManager.activeListID, initial: false) { _, newValue in
            guard newValue != nil else { return }
            clearSearchAndDismissKeyboard()
            preloadUpcomingSessionUpsells()
        }
        .onChange(of: activeShoppingSnapshot?.currentStop?.id, initial: false) { _, _ in
            preloadUpcomingSessionUpsells()
        }
        .onChange(of: activeStore?.id, initial: false) { _, _ in
            preloadUpcomingSessionUpsells()
        }
        .onChange(of: targetProduct, initial: false) { _, newValue in
            guard newValue == nil else { return }
            searchText = ""
        }
        .fullScreenCover(isPresented: $showARRoute) {
            ARRouteContainerView(beaconManager: beaconManager, navigationSession: navigationSession)
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet(
                trackingMode: trackingModeBinding,
                mapScale: $mapScale,
                tapSetsTarget: Binding(
                    get: { beaconManager.tapSetsTarget },
                    set: { beaconManager.tapSetsTarget = $0 }
                ),
                canShowAR: navigationSession.navigationRoute.pointCount >= 2,
                userPosition: displayUserPosition,
                onShowAR: {
                    showSettings = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        showARRoute = true
                    }
                }
            )
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showAnchorScanner) {
            AnchorScannerView(
                statusMessage: anchorScanStatusMessage,
                onPayload: handleScannedAnchorPayload,
                onClose: {
                    pendingAnchorScan = nil
                    showAnchorScanner = false
                }
            )
            .presentationDetents([.large])
            .alert(
                storeSwitchAlertTitle,
                isPresented: Binding(
                    get: { pendingStoreSwitchPayload != nil },
                    set: { if !$0 { pendingStoreSwitchPayload = nil } }
                )
            ) {
                if let target = storeSwitchTargetStore {
                    Button("Wechseln") {
                        // Der Scan wird nach dem Laden des Stores automatisch gesetzt; der Scanner bleibt offen.
                        if let payload = pendingStoreSwitchPayload {
                            pendingAnchorScan = PendingAnchorScan(payload: payload)
                        }
                        pendingStoreSwitchPayload = nil
                        anchorScanStatusMessage = "Filiale wird geladen …"
                        beaconManager.loadStoreLayout(storeId: target.id)
                    }
                    Button("Abbrechen", role: .cancel) {
                        pendingStoreSwitchPayload = nil
                    }
                } else {
                    Button("OK", role: .cancel) {
                        pendingStoreSwitchPayload = nil
                    }
                }
            } message: {
                if storeSwitchTargetStore == nil {
                    Text("Bitte wechsle zuerst in die passende Filiale.")
                }
            }
        }
    }

    private var storeSwitchTargetStore: MobileStoreSummary? {
        guard let code = pendingStoreSwitchPayload?.storeCode else { return nil }
        return beaconManager.mobileStores.first { $0.storeCode.lowercased() == code.lowercased() }
    }

    private var storeSwitchAlertTitle: String {
        if let target = storeSwitchTargetStore {
            return "Dieser Code gehört zu \(target.name). Wechseln?"
        }
        return "Dieser Code gehört zu einer anderen Filiale."
    }

    private func openAnchorScanner() {
        anchorScanStatusMessage = nil
        pendingAnchorScan = nil
        showAnchorScanner = true
    }

    private func handleScannedAnchorPayload(_ text: String) {
        // Waehrend der Wechsel-Abfrage und waehrend der Zielstore laedt, werden weitere Scans ignoriert
        // (der Scanner kann denselben Code erneut melden). Schliessen des Scanners hebt das auf.
        guard pendingStoreSwitchPayload == nil, pendingAnchorScan == nil else { return }

        let outcome = AnchorPayload.resolve(
            text,
            activeStoreCode: beaconManager.activeLayoutStore?.storeCode,
            anchors: beaconManager.shelves.filter(\.isAnchor)
        )

        switch outcome {
        case .setPosition(_, let point):
            anchorScanStatusMessage = nil
            nextTapSetsPosition = false
            beaconManager.setManualUserPosition(CGPoint(x: CGFloat(point.x), y: CGFloat(point.y)))
            showAnchorScanner = false
        case .storeMismatch:
            anchorScanStatusMessage = nil
            pendingStoreSwitchPayload = AnchorPayload.parse(text)
        case .unknownAnchor, .invalid:
            anchorScanStatusMessage = "Unbekannter Code – bitte anderen Code scannen"
        }
    }

    /// Wertet einen wartenden Store-Wechsel-Scan aus, sobald das Layout der Ziel-Filiale aktiv ist.
    private func resolvePendingAnchorScan() {
        guard let pending = pendingAnchorScan else { return }
        // Scanner wurde zwischenzeitlich geschlossen: nichts mehr setzen.
        guard showAnchorScanner else {
            pendingAnchorScan = nil
            return
        }

        guard let outcome = pending.resolve(
            activeStoreCode: beaconManager.activeLayoutStore?.storeCode,
            anchors: beaconManager.shelves.filter(\.isAnchor)
        ) else {
            return
        }
        pendingAnchorScan = nil

        switch outcome {
        case .setPosition(_, let point):
            anchorScanStatusMessage = nil
            nextTapSetsPosition = false
            beaconManager.setManualUserPosition(CGPoint(x: CGFloat(point.x), y: CGFloat(point.y)))
            showAnchorScanner = false
        case .unknownAnchor, .invalid, .storeMismatch:
            anchorScanStatusMessage = "Unbekannter Code – bitte anderen Code scannen"
        }
    }

    @discardableResult
    private func openLastStoreLayoutIfRequested() -> Bool {
        guard pendingLastStoreLayoutOpenRequest != nil else { return false }
        pendingLastStoreLayoutOpenRequest = nil

        guard beaconManager.activeLayoutStore != nil else {
            return false
        }

        pendingStoreSelectionID = nil
        clearSearchAndDismissKeyboard()
        withAnimation(.snappy(duration: 0.28)) {
            isShowingStoreOverview = false
        }
        return true
    }

    private var indoorLayoutView: some View {
        GeometryReader { geo in
            let availableWidth = max(220, geo.size.width - 44)
            let basePixelsPerMeter = Double(availableWidth) / max(1.0, beaconManager.gridWidth)

            ZStack {
                MapScreenBackground(accent: accent)
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    toolbarArea
                        .zIndex(2)

                    MapView(
                        beaconManager: beaconManager,
                        navigationSession: navigationSession,
                        pixelsPerMeter: basePixelsPerMeter,
                        mapScale: $mapScale,
                        nextTapSetsPosition: $nextTapSetsPosition,
                        targetProduct: targetProduct,
                        shoppingStops: activeShoppingSnapshot?.orderedStops ?? [],
                        activeShoppingStopID: activeShoppingSnapshot?.currentStop?.id,
                        showsShoppingSession: activeShoppingSnapshot != nil,
                        topInset: 0,
                        bottomInset: 0,
                        showsDebugMapElements: showsDebugMapElements
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()

                    bottomCard
                        .background(MapScreenBackground(accent: accent))
                        .zIndex(3)
                }
            }
        }
    }

    private var storeOverviewView: some View {
        ZStack(alignment: .top) {
            Map(position: $storeCameraPosition) {
                UserAnnotation()

                ForEach(storePins) { pin in
                    Annotation(pin.store.name, coordinate: pin.coordinate) {
                        Button {
                            selectStore(pin.store)
                        } label: {
                            StorePinMarker(isLoading: pendingStoreSelectionID == pin.store.id)
                        }
                        .buttonStyle(.plain)
                        .disabled(pendingStoreSelectionID != nil)
                    }
                }
            }
            .mapStyle(.standard(elevation: .realistic))
            .ignoresSafeArea()

            LinearGradient(
                colors: [
                    Color(uiColor: .systemBackground).opacity(0.86),
                    Color(uiColor: .systemBackground).opacity(0.22),
                    .clear
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 180)
            .allowsHitTesting(false)
            .ignoresSafeArea(edges: .top)

            VStack(spacing: 0) {
                storeOverviewHeader
                    .padding(.horizontal, 18)
                    .padding(.top, 10)

                Spacer(minLength: 0)

                storeOverviewBottomPanel
            }

            if beaconManager.isLoadingMobileStores && beaconManager.mobileStores.isEmpty {
                ProgressView()
                    .controlSize(.large)
                    .padding(18)
                    .background(MapFloatingSurface(cornerRadius: 16))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    private var storeOverviewHeader: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("SPAR-Filialen")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)

                Text(storeOverviewSubtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Button {
                fitStorePins()
            } label: {
                Image(systemName: "location.viewfinder")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 42, height: 42)
                    .background(Color(uiColor: .systemBackground), in: Circle())
                    .overlay(Circle().stroke(Color.primary.opacity(0.06), lineWidth: 1))
                    .shadow(color: .black.opacity(0.06), radius: 12, y: 6)
            }
            .buttonStyle(.plain)

            Button {
                beaconManager.refreshMobileStores()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 42, height: 42)
                    .background(Color(uiColor: .systemBackground), in: Circle())
                    .overlay(Circle().stroke(Color.primary.opacity(0.06), lineWidth: 1))
                    .shadow(color: .black.opacity(0.06), radius: 12, y: 6)
            }
            .buttonStyle(.plain)
            .disabled(beaconManager.isLoadingMobileStores)

            Button { showSettings = true } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 42, height: 42)
                    .background(Color(uiColor: .systemBackground), in: Circle())
                    .overlay(Circle().stroke(Color.primary.opacity(0.06), lineWidth: 1))
                    .shadow(color: .black.opacity(0.06), radius: 12, y: 6)
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var storeOverviewBottomPanel: some View {
        if !storePins.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(storePins) { pin in
                        StoreOverviewCard(
                            store: pin.store,
                            isLoading: pendingStoreSelectionID == pin.store.id,
                            accent: accent,
                            action: { selectStore(pin.store) }
                        )
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(.ultraThinMaterial)
        } else if let message = beaconManager.mobileStoresErrorMessage {
            HStack(spacing: 10) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.headline)
                    .foregroundStyle(.orange)

                Text(message)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                Spacer(minLength: 0)

                Button {
                    beaconManager.refreshMobileStores()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)
                .foregroundStyle(accent)
            }
            .padding(14)
            .background(MapFloatingSurface(cornerRadius: 18))
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
    }

    @ViewBuilder
    private var toolbarArea: some View {
        VStack(spacing: 10) {
            mapPageHeader

            indoorPositionControls

            searchBarCard

            if productSearch.isSearching {
                HStack(spacing: 10) {
                    ProgressView()
                        .scaleEffect(0.9)

                    Text("Produkte werden gesucht...")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)

                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(MapFloatingSurface())
            }

            if !productSearch.searchResults.isEmpty {
                searchResultsCard
            } else if searchText.trimmingCharacters(in: .whitespacesAndNewlines).count > 2, !productSearch.isSearching {
                ContentUnavailableView(
                    "Keine Produkte gefunden",
                    systemImage: "magnifyingglass",
                    description: Text("Probiere einen anderen Suchbegriff oder suche in der Planung über Kategorien.")
                )
                .padding(.horizontal, 8)
                .padding(.vertical, 14)
                .background(MapFloatingSurface())
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
    }

    private var mapPageHeader: some View {
        HStack(alignment: .center, spacing: 12) {
            Button {
                showStoreOverview()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.primary)
                    .frame(width: 42, height: 42)
                    .background(Color(uiColor: .systemBackground), in: Circle())
                    .overlay(Circle().stroke(Color.primary.opacity(0.06), lineWidth: 1))
                    .shadow(color: .black.opacity(0.06), radius: 12, y: 6)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text(beaconManager.activeLayoutStoreName ?? "Marktkarte")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                Text(beaconManager.activeLayoutDescription)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Button { showSettings = true } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 42, height: 42)
                    .background(Color(uiColor: .systemBackground), in: Circle())
                    .overlay(
                        Circle()
                            .stroke(Color.primary.opacity(0.06), lineWidth: 1)
                    )
                    .shadow(color: .black.opacity(0.06), radius: 12, y: 6)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 2)
    }

    private var indoorPositionControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Button {
                    nextTapSetsPosition.toggle()
                } label: {
                    Label("Ich bin hier", systemImage: "location.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(nextTapSetsPosition ? Color.white : accent)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(
                            nextTapSetsPosition ? accent : accent.opacity(0.11),
                            in: Capsule()
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ich bin hier")

                Button {
                    openAnchorScanner()
                } label: {
                    Label("QR-Code scannen", systemImage: "qrcode.viewfinder")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(accent)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(accent.opacity(0.11), in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("QR-Code scannen")

                Spacer(minLength: 0)
            }

            if !beaconManager.isPositionTrusted {
                untrustedPositionBanner
            }
        }
        .padding(.horizontal, 2)
    }

    private var untrustedPositionBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.orange)

            Text(navigationSession.navigationStatusMessage ?? "Position ungenau")
                .font(.caption.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(2)

            Spacer(minLength: 0)

            Button("QR-Code scannen") {
                openAnchorScanner()
            }
            .font(.caption.weight(.semibold))
            .buttonStyle(.plain)
            .foregroundStyle(accent)

            Button("Position setzen") {
                nextTapSetsPosition = true
            }
            .font(.caption.weight(.semibold))
            .buttonStyle(.plain)
            .foregroundStyle(accent)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(MapFloatingSurface())
    }

    private var searchBarCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)

            TextField("Produkte oder Kategorien suchen", text: $searchText)
                .textFieldStyle(.plain)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

            if !searchText.isEmpty {
                Button {
                    clearSearchAndDismissKeyboard()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.body)
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
            }

            Image(systemName: "viewfinder")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .background(MapFloatingSurface())
    }

    private var searchResultsCard: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(productSearch.searchResults, id: \.self) { product in
                    ProductSearchRow(
                        product: product,
                        isInShoppingList: shoppingListManager.containsProduct(product),
                        navigateLabel: "Auf Karte zeigen",
                        onNavigate: {
                            onNavigateToProduct(product)
                            clearSearchAndDismissKeyboard()
                        },
                        onAddToList: { onAddToList(product) }
                    )
                }
            }
            .padding(14)
        }
        .frame(maxHeight: 320)
        .background(MapFloatingSurface())
    }

    @ViewBuilder
    private var bottomCard: some View {
        if let snapshot = activeShoppingSnapshot {
            ShoppingSessionPanel(
                snapshot: snapshot,
                routeOriginText: routeOriginText,
                locationText: { stop in stopLocationText(for: stop) },
                onOpenList: onOpenLists,
                onMarkCurrentStopDone: {
                    let completedStop = activeShoppingSnapshot?.currentStop
                    shoppingSessionManager.markCurrentStopDone(
                        listManager: shoppingListManager,
                        beaconManager: beaconManager
                    )
                    requestUpsellForCompletedStop(completedStop)
                },
                onSkipCurrentStop: {
                    let skippedStop = activeShoppingSnapshot?.currentStop
                    shoppingSessionManager.skipCurrentStop(
                        listManager: shoppingListManager,
                        beaconManager: beaconManager
                    )
                    requestUpsellForCompletedStop(skippedStop)
                },
                onToggleMode: {
                    shoppingSessionManager.toggleRouteMode(
                        listManager: shoppingListManager,
                        beaconManager: beaconManager
                    )
                },
                onReplan: {
                    shoppingSessionManager.replan(
                        listManager: shoppingListManager,
                        beaconManager: beaconManager
                    )
                }
            )
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 10)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        } else if let target = targetProduct {
            targetNavigationCard(target)
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 10)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        } else {
            Color.clear
                .frame(height: 0)
        }
    }

    private func targetNavigationCard(_ target: Product) -> some View {
        let isAlreadyInList = shoppingListManager.containsProduct(target)
        let shelfDescriptor = ShelfLocationDescriptor.make(layoutCode: target.layoutCode, shelves: beaconManager.shelves)

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "cart.circle.fill")
                    .font(.system(size: 38))
                    .foregroundStyle(.white, routeAccent)
                    .shadow(color: routeAccent.opacity(0.22), radius: 8, y: 4)

                VStack(alignment: .leading, spacing: 4) {
                    Text(target.name)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)

                    if let shelfDescriptor {
                        Text(shelfDescriptor.primary)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)

                        if let detail = shelfDescriptor.detail {
                            Text(detail)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }

                        #if DEBUG
                        Text(shelfDescriptor.debugCode)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        #endif
                    } else {
                        Label(ShelfLocationDescriptor.notInTestAreaText, systemImage: "exclamationmark.triangle")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                            .lineLimit(2)
                    }

                    Text(String(format: "%.2f EUR", target.price))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(accent)
                }

                Spacer(minLength: 0)

                Button {
                    withAnimation {
                        targetProduct = nil
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                        .frame(width: 32, height: 32)
                        .background(Color.primary.opacity(0.05), in: Circle())
                }
                .buttonStyle(.plain)
            }

            if let routeOriginText {
                Text(routeOriginText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 10) {
                Button {
                    startRouteToTarget(target)
                } label: {
                    Label("Route starten", systemImage: "location.north.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .disabled(shelfDescriptor == nil)
                .buttonStyle(.plain)
                .foregroundStyle(.white)
                .background(accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: accent.opacity(0.16), radius: 10, y: 5)

                if isAlreadyInList {
                    MapInfoPill(title: "Geplant", systemImage: "checkmark.circle.fill", tint: accent)
                } else {
                    Button {
                        onAddToList(target)
                    } label: {
                        Label("Einplanen", systemImage: "plus")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 14)
                            .frame(height: 42)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(accent)
                    .background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }
        .padding(14)
        .background(MapFloatingSurface(cornerRadius: 22))
    }

    private var trackingModeBinding: Binding<TrackingMode> {
        Binding(
            get: { beaconManager.trackingMode },
            set: { beaconManager.setTrackingMode($0) }
        )
    }

    private var storePins: [StoreMapPin] {
        beaconManager.mobileStores.compactMap { store in
            guard let coordinate = coordinate(for: store) else {
                return nil
            }
            return StoreMapPin(store: store, coordinate: coordinate)
        }
    }

    private var storeOverviewSubtitle: String {
        if beaconManager.isLoadingMobileStores && beaconManager.mobileStores.isEmpty {
            return "Filialen werden geladen"
        }
        if storePins.count == 1 {
            return "1 Filiale"
        }
        return "\(storePins.count) Filialen"
    }

    private var activeRouteDistanceMeters: Double? {
        if navigationSession.remainingRoute.pointCount > 1 {
            return Double(navigationSession.remainingRouteLength)
        }

        guard let user = displayUserPosition, let target = navigationSession.targetPosition else {
            return nil
        }
        return hypot(target.x - user.x, target.y - user.y)
    }

    private func clearSearchAndDismissKeyboard() {
        searchText = ""
        productSearch.clearSearch()
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil, from: nil, for: nil
        )
    }

    private func selectStore(_ store: MobileStoreSummary) {
        guard pendingStoreSelectionID == nil else {
            return
        }

        upsellStore.authorizePlanPreloading(for: store, reason: "manual_store_tap")
        pendingStoreSelectionID = store.id
        targetProduct = nil
        navigationSession.clearTarget()
        beaconManager.loadStoreLayout(storeId: store.id)
    }

    private func requestUpsellForCompletedStop(_ stop: ShoppingStop?) {
        guard let stop,
              let activeListID = shoppingSessionManager.activeListID,
              let list = shoppingListManager.list(with: activeListID) else {
            return
        }

        upsellStore.showOpportunity(
            opportunityId: UpsellSuggestionStore.stationOpportunityId(for: stop),
            checkedItems: stop.items,
            list: list,
            store: activeStore,
            source: "shopping_session"
        )
        preloadUpcomingSessionUpsells()
    }

    private func preloadUpcomingSessionUpsells() {
        guard let activeListID = shoppingSessionManager.activeListID,
              let list = shoppingListManager.list(with: activeListID) else {
            return
        }
        upsellStore.preloadPlan(
            for: list,
            stops: activeShoppingSnapshot?.orderedStops ?? [],
            unresolvedItems: activeShoppingSnapshot?.unresolvedItems ?? [],
            store: activeStore,
            source: "shopping_session"
        )
    }

    private func showStoreOverview() {
        pendingStoreSelectionID = nil
        nextTapSetsPosition = false
        targetProduct = nil
        clearSearchAndDismissKeyboard()
        withAnimation(.snappy(duration: 0.28)) {
            isShowingStoreOverview = true
        }
        fitStorePins()
    }

    private func fitStorePins() {
        let region = region(for: storePins)
        withAnimation(.easeInOut(duration: 0.25)) {
            storeCameraPosition = .region(region)
        }
    }

    private func region(for pins: [StoreMapPin]) -> MKCoordinateRegion {
        guard !pins.isEmpty else {
            return MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 48.3069, longitude: 14.2858),
                span: MKCoordinateSpan(latitudeDelta: 0.34, longitudeDelta: 0.48)
            )
        }

        let latitudes = pins.map(\.coordinate.latitude)
        let longitudes = pins.map(\.coordinate.longitude)
        let minLatitude = latitudes.min() ?? 48.3069
        let maxLatitude = latitudes.max() ?? 48.3069
        let minLongitude = longitudes.min() ?? 14.2858
        let maxLongitude = longitudes.max() ?? 14.2858
        let center = CLLocationCoordinate2D(
            latitude: (minLatitude + maxLatitude) / 2,
            longitude: (minLongitude + maxLongitude) / 2
        )
        let span = MKCoordinateSpan(
            latitudeDelta: max(0.045, (maxLatitude - minLatitude) * 1.8 + 0.035),
            longitudeDelta: max(0.055, (maxLongitude - minLongitude) * 1.8 + 0.045)
        )
        return MKCoordinateRegion(center: center, span: span)
    }

    private func coordinate(for store: MobileStoreSummary) -> CLLocationCoordinate2D? {
        if let latitude = store.latitude,
           let longitude = store.longitude,
           (-90...90).contains(latitude),
           (-180...180).contains(longitude) {
            return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        }

        return fallbackCoordinate(for: store)
    }

    private func fallbackCoordinate(for store: MobileStoreSummary) -> CLLocationCoordinate2D {
        let normalizedCity = store.city
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "de_AT"))
            .lowercased()

        let base: CLLocationCoordinate2D
        if normalizedCity.contains("leonding") {
            base = CLLocationCoordinate2D(latitude: 48.2794, longitude: 14.2528)
        } else if normalizedCity.contains("hagenberg") {
            base = CLLocationCoordinate2D(latitude: 48.3676, longitude: 14.5168)
        } else if normalizedCity.contains("horsching") {
            base = CLLocationCoordinate2D(latitude: 48.2267, longitude: 14.1779)
        } else if normalizedCity.contains("linz") {
            base = CLLocationCoordinate2D(latitude: 48.3069, longitude: 14.2858)
        } else {
            base = CLLocationCoordinate2D(latitude: 48.3069, longitude: 14.2858)
        }

        let seed = store.storeCode.unicodeScalars.reduce(17) { partialResult, scalar in
            (partialResult &* 31) &+ Int(scalar.value)
        }
        let latitudeOffset = Double((abs(seed) % 7) - 3) * 0.0016
        let longitudeOffset = Double((abs(seed / 7) % 7) - 3) * 0.0022
        return CLLocationCoordinate2D(
            latitude: base.latitude + latitudeOffset,
            longitude: base.longitude + longitudeOffset
        )
    }

    /// Herkunft der aktiven Route in Kundensprache; nil bei vertrauenswuerdiger Position oder ohne Route.
    private var routeOriginText: String? {
        guard navigationSession.navigationRoute.pointCount >= 2 else { return nil }
        switch navigationSession.routeOriginKind {
        case .position:
            return nil
        case .entrance:
            return "Route ab Eingang"
        case .lastStop(let title):
            return "Route ab \(title)"
        }
    }

    /// Standorttext eines Stopps: Regal des ersten Artikels mit layoutCode.
    private func stopLocationText(for stop: ShoppingStop) -> String? {
        guard let layoutCode = stop.items.compactMap(\.layoutCode).first else { return nil }
        return ShelfLocationDescriptor.make(layoutCode: layoutCode, shelves: beaconManager.shelves)?.primary
    }

    private func startRouteToTarget(_ target: Product) {
        beaconManager.setTargetProduct(target)
        targetProduct = target
    }

    private var targetStatusPill: some View {
        Group {
            if let targetRouteDistanceText {
                MapInfoPill(title: targetRouteDistanceText, systemImage: "figure.walk", tint: routeAccent)
            } else {
                MapInfoPill(title: "Ziel ist auf der Karte markiert", systemImage: "location", tint: routeAccent)
            }
        }
    }

}

private struct StoreMapPin: Identifiable {
    let store: MobileStoreSummary
    let coordinate: CLLocationCoordinate2D

    var id: UUID {
        store.id
    }
}

private struct StorePinMarker: View {
    let isLoading: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(Color(red: 0.00, green: 0.43, blue: 0.36).opacity(0.16))
                .frame(width: 46, height: 46)

            if isLoading {
                ProgressView()
                    .controlSize(.small)
                    .padding(10)
                    .background(Color(uiColor: .systemBackground), in: Circle())
            } else {
                ZStack {
                    Circle()
                        .fill(Color(red: 0.00, green: 0.43, blue: 0.36))
                        .frame(width: 36, height: 36)

                    Image(systemName: "storefront.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .shadow(color: .black.opacity(0.18), radius: 8, y: 4)
            }
        }
    }
}

private struct StoreOverviewCard: View {
    let store: MobileStoreSummary
    let isLoading: Bool
    let accent: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(accent.opacity(0.12))
                            .frame(width: 34, height: 34)

                        if isLoading {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Image(systemName: "storefront.fill")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(accent)
                        }
                    }

                    VStack(alignment: .leading, spacing: 3) {
                        Text(store.name)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)

                        Text(store.city)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 0)
                }

                HStack(spacing: 6) {
                    Text(store.storeCode)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(accent)
                        .lineLimit(1)

                    Spacer(minLength: 0)

                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                }
            }
            .frame(width: 220, alignment: .leading)
            .padding(14)
            .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.primary.opacity(0.06), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }
}

private struct MapScreenBackground: View {
    let accent: Color

    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground)

            LinearGradient(
                colors: [
                    Color(uiColor: .systemBackground),
                    accent.opacity(0.06),
                    Color(uiColor: .systemGroupedBackground)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
    }
}

private struct MapFloatingSurface: View {
    var cornerRadius: CGFloat = 22

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color(uiColor: .systemBackground))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.primary.opacity(0.055), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.06), radius: 18, y: 9)
    }
}

private struct MapInfoPill: View {
    let title: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
            Text(title)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(tint.opacity(0.11), in: Capsule())
    }
}

private struct MapPageHeightPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private extension View {
    func readHeight(into binding: Binding<CGFloat>) -> some View {
        background(
            GeometryReader { geometry in
                Color.clear
                    .preference(key: MapPageHeightPreferenceKey.self, value: geometry.size.height)
            }
        )
        .onPreferenceChange(MapPageHeightPreferenceKey.self) { binding.wrappedValue = $0 }
    }
}
