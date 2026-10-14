import Foundation
import CoreBluetooth
import Combine
import CoreGraphics
import CoreLocation
import CoreMotion
import simd

struct ManualCalibrationEvent: Equatable {
    let revision: Int
    let mapPoint: CGPoint
    let timestamp: TimeInterval
}

struct NavigationRoute: Equatable {
    let points: [SIMD2<Float>]
    let signature: String

    static let empty = NavigationRoute(points: [])

    var pointCount: Int { points.count }
    var cgPoints: [CGPoint] { points.map(CGPoint.init) }

    init(points: [SIMD2<Float>]) {
        self.points = NavigationRoute.removeConsecutiveDuplicates(points)
        self.signature = NavigationRoute.computeSignature(for: self.points)
    }

    private static func removeConsecutiveDuplicates(_ points: [SIMD2<Float>]) -> [SIMD2<Float>] {
        guard let first = points.first else { return [] }
        var cleaned: [SIMD2<Float>] = [first]
        cleaned.reserveCapacity(points.count)
        for point in points.dropFirst() where cleaned.last != point {
            cleaned.append(point)
        }
        return cleaned
    }

    private static func computeSignature(for points: [SIMD2<Float>]) -> String {
        var hash: UInt64 = 1469598103934665603
        let prime: UInt64 = 1099511628211

        func mix(_ value: Int64) {
            var raw = UInt64(bitPattern: value)
            for _ in 0..<8 {
                hash ^= (raw & 0xFF)
                hash &*= prime
                raw >>= 8
            }
        }

        for point in points {
            let quantizedX = Int64((point.x * 1000).rounded())
            let quantizedY = Int64((point.y * 1000).rounded())
            mix(quantizedX)
            mix(quantizedY)
        }

        return String(hash, radix: 16, uppercase: false)
    }
}

enum TrackingMode: String, CaseIterable, Identifiable {
    case beacon
    case debugNoBeacons

    var id: String { rawValue }

    var title: String {
        switch self {
        case .beacon:
            return "Beacon"
        case .debugNoBeacons:
            return "Debug (ohne Beacons)"
        }
    }
}

enum StoreLayoutActivationSource: Equatable, Sendable {
    case beacon
    case manual
}

private enum LayoutLoadingError: LocalizedError {
    case invalidResponse
    case httpStatus(Int)
    case emptyData
    case decodingFailed

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Die Layout-Antwort ist ungueltig."
        case .httpStatus(let statusCode):
            return "Der Server antwortete mit Status \(statusCode)."
        case .emptyData:
            return "Der Server hat kein Layout zurueckgegeben."
        case .decodingFailed:
            return "Das Layout konnte nicht decodiert werden."
        }
    }
}

private struct LayoutEnvelope: Decodable {
    let layout: LayoutData?
    let data: LayoutData?
    let current: LayoutData?
    let version: LayoutData?
}

private struct LayoutHistoryEnvelope: Decodable {
    let versions: [LayoutVersionSummary]?
    let history: [LayoutVersionSummary]?
    let items: [LayoutVersionSummary]?
    let data: [LayoutVersionSummary]?
}

final class BeaconManager: NSObject, ObservableObject, CBCentralManagerDelegate, CLLocationManagerDelegate {
    // MARK: - Public state

    @Published var beacons: [IndooroBeacon] = []
    @Published var shelves: [LayoutElement] = []
    @Published var gridWidth: Double = 15.0
    @Published var gridHeight: Double = 20.0

    @Published var rawUserPosition: CGPoint?
    @Published var userPosition: CGPoint?
    @Published private(set) var navigationRoute: NavigationRoute = .empty
    @Published var targetPosition: CGPoint?
    @Published var userHeadingRadians: Float?
    @Published var isUserHeadingReliable = false

    @Published var navigationStatusMessage: String?
    @Published var isLowConfidence = false
    @Published var manualCalibrationEvent: ManualCalibrationEvent?

    @Published var searchResults: [Product] = []
    @Published var isSearching = false

    @Published var tapSetsTarget = true
    @Published private(set) var trackingMode: TrackingMode = .beacon
    @Published private(set) var layoutHistory: [LayoutVersionSummary] = []
    @Published private(set) var isLoadingLayoutHistory = true
    @Published private(set) var isLoadingLayout = true
    @Published private(set) var selectedLayoutMode: LayoutSelectionMode = .currentServer
    @Published private(set) var selectedLayoutId: String?
    @Published private(set) var selectedLayoutName = "Aktuelles Server-Layout"
    @Published private(set) var activeLayoutDescription = "Bundle-Layout aktiv"
    @Published private(set) var layoutRevision = 0
    @Published private(set) var detectedStore: MobileStoreSummary?
    @Published private(set) var activeLayoutStore: MobileStoreSummary?
    @Published private(set) var activeLayoutStoreSource: StoreLayoutActivationSource?
    @Published private(set) var mobileStores: [MobileStoreSummary] = []
    @Published private(set) var isLoadingMobileStores = false
    @Published private(set) var mobileStoresErrorMessage: String?
    @Published private(set) var debugLogLines: [String] = []

    // MARK: - Config

    private let apiBase = "https://it220209.cloud.htl-leonding.ac.at/api"
    private let allowServerSearch = true
    private let layoutHistoryLimit = 12
    private let selectedLayoutModeDefaultsKey = "selectedLayoutMode"
    private let selectedLayoutIdDefaultsKey = "selectedLayoutId"
    private let fixedTargetCategory: String? = nil
    private let preferIBeaconRanging = true
    private let minimumStoreLookupRSSI = -95
    private let storeLookupFailureCooldown: TimeInterval = 15
    private let storeLayoutFailureStatusMessage = "Store erkannt, Layout konnte nicht geladen werden."
    private let debugLogLimit = 80
    private let storeDetectionRefreshInterval: TimeInterval = 60
    private var latestSearchRequestID = UUID()

    private let defaultTxPower = -72.0
    private var pathLossExp: Double { Double(navigationConfig.beacon.pathLossExponent) }

    // MARK: - Bluetooth internals

    private var centralManager: CBCentralManager?
    private var isScanningBeacons = false
    private var rssiBuffer: [String: [Int]] = [:]
    private var beaconLastSeenAt: [String: TimeInterval] = [:]
    private var beaconMeasurementQuality: [String: Float] = [:]
    private var beaconAdvertisementTxPower: [String: Float] = [:]
    private var beaconRangedAccuracyMeters: [String: Double] = [:]
    private var kalmanFilters: [String: KalmanFilter] = [:]
    private var updateTimer: Timer?
    private let startTime = Date()
    private let locationManager = CLLocationManager()
    private var rangingConstraints: [CLBeaconIdentityConstraint] = []
    private var activeRangingConstraints: [CLBeaconIdentityConstraint] = []
    private var isRangingIBeacons = false
    private var lastIBeaconRangingUpdateAt: TimeInterval?
    private var pendingStoreLookupIdentityKey: String?
    private var activeStoreBeaconIdentityKey: String?
    private var lastFailedStoreLookupIdentityKey: String?
    private var lastFailedStoreLookupAt: TimeInterval?
    private var layoutLoadGeneration = 0
    private var storeDetectionIBeaconUUIDs: Set<UUID> = []
    private var isLoadingStoreDetectionBeacons = false
    private var lastStoreDetectionBeaconRefreshAt: TimeInterval?
    private var lastDebugLogAtByKey: [String: TimeInterval] = [:]

    private static let debugTimestampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_AT")
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter
    }()

    // MARK: - Stabilized navigation pipeline

    private let navigationConfig = StabilizedNavigationConfig.default
    private var indoorGraph: IndoorGraph?
    private var poseFusionService: PoseFusionService?
    private var mapMatcher: MapMatcher?
    private var routeManager: RouteManager?
    private var navigationStateMachine: NavigationStateMachine?
    private var beaconPositionSolver: BeaconPositionSolver?

    private var lastRawPosePoint: SIMD2<Float>?
    private var lastRawPoseTimestamp: TimeInterval?
    private var lastHeadingRadians: Float?
    private var lastHeadingTimestamp: TimeInterval?
    private var lastSolvedRawPoint: SIMD2<Float>?
    private var lastMotionIntensityG: Float = 0

    private let motionManager = CMMotionManager()
    private var rawDeviceHeadingRadians: Float?
    private var smoothedDisplayHeadingRadians: Float?
    private let headingDisplaySmoothingAlpha: Float = 0.24
    private let headingReliabilityTimeout: TimeInterval = 1.4

    private var lastMatchedPose: MapMatchedPose?
    private var smoothedDisplayPositionPoint: SIMD2<Float>?
    private var lastPublishedDisplayPositionPoint: SIMD2<Float>?
    private var lastPublishedDisplayPositionTimestamp: TimeInterval?
    private var pendingJumpPoint: SIMD2<Float>?
    private var pendingJumpConfirmations = 0
    private var manualCalibrationRevision: Int = 0
    private var isUpdatingHeading = false
    private var latestHeadingAccuracyDegrees: CLLocationDirection = -1
    private let reliableHeadingAccuracyThreshold: CLLocationDirection = 25
    private let calibrationPromptHeadingAccuracyThreshold: CLLocationDirection = 20

    private var mapBounds: CGRect {
        CGRect(x: 0, y: 0, width: gridWidth, height: gridHeight)
    }

    var detectedStoreName: String? {
        detectedStore?.name
    }

    var activeLayoutStoreName: String? {
        activeLayoutStore?.name
    }

    var isActiveLayoutFromDetectedStore: Bool {
        activeLayoutStore != nil && activeLayoutStoreSource == .beacon
    }

    var debugLogText: String {
        debugLogLines.joined(separator: "\n")
    }

    // MARK: - Lifecycle

    override init() {
        super.init()
        appendDebugLog("BeaconManager init")
        loadBundleLayoutFallback()
        startMotionUpdates()

        locationManager.delegate = self
        locationManager.pausesLocationUpdatesAutomatically = true
        requestLocationAuthorizationIfNeeded()

        centralManager = CBCentralManager(delegate: self, queue: nil)
        startUpdateTimer()
        refreshStoreDetectionBeaconsIfNeeded(force: true)
        restorePersistedLayoutSelection()
        refreshLayoutHistory()
    }

    deinit {
        updateTimer?.invalidate()
        motionManager.stopDeviceMotionUpdates()
        locationManager.stopUpdatingHeading()
    }

    // MARK: - Public controls

    func setTargetProduct(_ product: Product?) {
        if !allowServerSearch {
            if product == nil {
                DispatchQueue.main.async {
                    self.targetPosition = nil
                    self.setNavigationRouteIfNeeded(.empty)
                    self.routeManager?.clearRoute()
                }
            }
            return
        }

        guard let product else {
            DispatchQueue.main.async {
                self.targetPosition = nil
                self.setNavigationRouteIfNeeded(.empty)
                self.routeManager?.clearRoute()
            }
            return
        }

        if let shelf = shelves.first(where: { $0.matchesProductLayoutCode(product.layoutCode) }) {
            let tx = shelf.x + (shelf.width ?? 1) / 2
            let ty = shelf.y + (shelf.height ?? 1) / 2
            setTargetPosition(CGPoint(x: tx, y: ty))
        } else {
            print("⚠️ Kein Regal gefunden fuer \(product.name) (Code: \(product.layoutCode))")
            clearRouteTarget()
        }
    }

    func clearSearch() {
        latestSearchRequestID = UUID()
        isSearching = false
        searchResults = []
    }

    func clearDebugLog() {
        debugLogLines.removeAll()
        lastDebugLogAtByKey.removeAll()
        appendDebugLog("Debug-Protokoll geleert")
    }

    func refreshMobileStores() {
        guard !isLoadingMobileStores else {
            return
        }

        guard let url = mobileStoresURL() else {
            mobileStoresErrorMessage = "Store-URL ungueltig"
            return
        }

        isLoadingMobileStores = true
        mobileStoresErrorMessage = nil
        appendDebugLog("Mobile-Stores Request url=\(url.absoluteString)")

        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isLoadingMobileStores = false

                switch result {
                case .success(let data):
                    do {
                        self.mobileStores = try self.decodeMobileStores(from: data)
                        self.mobileStoresErrorMessage = nil
                        self.appendDebugLog("Mobile-Stores geladen count=\(self.mobileStores.count)")
                    } catch {
                        self.mobileStores = []
                        self.mobileStoresErrorMessage = "Filialen konnten nicht decodiert werden."
                        self.appendDebugLog("Mobile-Stores Decode-Fehler: \(error.localizedDescription)")
                    }
                case .failure(let error):
                    self.mobileStoresErrorMessage = error.localizedDescription
                    self.appendDebugLog("Mobile-Stores Fehler: \(error.localizedDescription)")
                }
            }
        }
    }

    func loadStoreLayout(storeId: UUID) {
        guard let store = mobileStores.first(where: { $0.id == storeId })
            ?? [detectedStore, activeLayoutStore].compactMap({ $0 }).first(where: { $0.id == storeId }) else {
            appendDebugLog("Store-Layout manuell abgebrochen: storeId \(storeId.uuidString) nicht in mobileStores")
            return
        }

        loadStoreLayout(for: store, identityKey: nil, source: .manual)
    }

    func refreshLayoutHistory() {
        guard let url = layoutHistoryURL(limit: layoutHistoryLimit) else {
            isLoadingLayoutHistory = false
            return
        }

        isLoadingLayoutHistory = true
        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }

                switch result {
                case .success(let data):
                    do {
                        let history = try self.decodeLayoutHistory(from: data)
                        self.layoutHistory = self.mergeLayoutHistory(history)
                        self.refreshSelectedLayoutPresentationIfNeeded()
                    } catch {
                        print("❌ Layout-History konnte nicht decodiert werden: \(error.localizedDescription)")
                    }
                case .failure(let error):
                    print("❌ Layout-History konnte nicht geladen werden: \(error.localizedDescription)")
                }

                self.isLoadingLayoutHistory = false
            }
        }
    }

    func selectCurrentServerLayout() {
        selectedLayoutMode = .currentServer
        selectedLayoutId = nil
        selectedLayoutName = "Aktuelles Server-Layout"
        persistLayoutSelection()
        loadCurrentServerLayout()
    }

    func selectLayoutVersion(_ layoutId: String) {
        selectedLayoutMode = .version
        selectedLayoutId = layoutId
        selectedLayoutName = layoutHistory.first(where: { $0.layoutId == layoutId })?.displayName
            ?? "Version \(layoutId.prefix(8))"
        persistLayoutSelection()
        loadLayoutVersion(withId: layoutId)
    }

    func setTrackingMode(_ mode: TrackingMode) {
        guard trackingMode != mode else {
            return
        }

        trackingMode = mode

        switch mode {
        case .beacon:
            configureBeaconScanningForCurrentMode()

        case .debugNoBeacons:
            stopIBeaconRanging()
            stopBeaconScan()
            clearBeaconMeasurements()
            rssiBuffer.removeAll()
            tapSetsTarget = false
            applyStateActions(navigationStateMachine?.handle(.confidenceRecovered) ?? [])
            DispatchQueue.main.async {
                self.isLowConfidence = false
                self.navigationStatusMessage = nil
            }
        }
    }

    func setManualTargetPosition(_ point: CGPoint) {
        setTargetPosition(point)
    }

    func setRouteTargetPosition(_ point: CGPoint) {
        setTargetPosition(point)
    }

    func clearRouteTarget() {
        DispatchQueue.main.async {
            self.targetPosition = nil
            self.setNavigationRouteIfNeeded(.empty)
            self.routeManager?.clearRoute()
        }
    }

    func setManualUserPosition(_ point: CGPoint) {
        let mapPoint = SIMD2<Float>(Float(point.x), Float(point.y))
        performManualCalibration(to: mapPoint)
    }

    func calibrateAtCurrentEstimate() {
        guard let current = userPosition ?? rawUserPosition else {
            return
        }
        setManualUserPosition(current)
    }

    // MARK: - Search

    func searchProducts(query: String) {
        if !allowServerSearch {
            DispatchQueue.main.async {
                self.latestSearchRequestID = UUID()
                self.isSearching = false
                self.searchResults = []
            }
            return
        }

        guard !query.isEmpty else {
            clearSearch()
            return
        }

        let requestID = UUID()
        latestSearchRequestID = requestID
        isSearching = true
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let urlString = "\(apiBase)/products/search?q=\(encoded)&size=50"

        guard let url = URL(string: urlString) else {
            isSearching = false
            return
        }

        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard self.latestSearchRequestID == requestID else { return }
                self.isSearching = false

                if let error {
                    print("❌ Fehler bei Suche: \(error.localizedDescription)")
                    self.searchResults = []
                    return
                }

                guard let data else {
                    self.searchResults = []
                    return
                }

                do {
                    self.searchResults = try JSONDecoder().decode([Product].self, from: data)
                } catch {
                    print("❌ JSON Fehler: \(error)")
                    self.searchResults = []
                }
            }
        }.resume()
    }

    // MARK: - BLE update loop

    private func startUpdateTimer() {
        updateTimer?.invalidate()
        updateTimer = Timer.scheduledTimer(
            withTimeInterval: navigationConfig.beacon.updateIntervalSeconds,
            repeats: true
        ) { [weak self] _ in
            self?.processBufferAndCalculate()
        }
    }

    private func processBufferAndCalculate() {
        guard trackingMode == .beacon else {
            rssiBuffer.removeAll()
            return
        }

        let timestamp = Date().timeIntervalSince1970
        if Date().timeIntervalSince(startTime) < navigationConfig.beacon.warmupSeconds {
            return
        }

        if preferIBeaconRanging && isRangingIBeacons {
            startBeaconScan()
        }
        refreshStoreDetectionBeaconsIfNeeded()

        for beacon in beacons {
            let name = beacon.name
            let values = rssiBuffer[name] ?? []

            if values.isEmpty {
                if isMeasurementStale(for: name, timestamp: timestamp) {
                    kalmanFilters[name]?.reset()
                    beaconMeasurementQuality[name] = 0
                    updateBeaconUI(name: name, rssi: 0, distance: 0, timestamp: nil, quality: 0, txPower: nil)
                }
                continue
            }

            let processed = processRSSIWindow(values, for: name, timestamp: timestamp)
            updateBeaconUI(
                name: name,
                rssi: processed.rssi,
                distance: processed.distanceMeters,
                timestamp: timestamp,
                quality: processed.quality,
                txPower: beaconAdvertisementTxPower[name].map(Double.init)
            )
        }

        rssiBuffer.removeAll()
        clearStaleBeaconMeasurements(at: timestamp)
        calculateLocation(timestamp: timestamp)
    }

    private func calculateLocation(timestamp: TimeInterval) {
        let measurements = activeBeaconMeasurements(at: timestamp)
        let baseConfidence = calculateTrackingConfidence(activeMeasurements: measurements)
        let confidence: Float

        if let estimate = beaconPositionSolver?.solve(
            measurements: measurements,
            previousEstimate: lastSolvedRawPoint
        ) {
            confidence = clamp(
                0.45 * baseConfidence + 0.55 * estimate.confidence,
                min: 0,
                max: 1
            )
            applyStateActions(navigationStateMachine?.handle(.sensorUpdate(confidence: confidence)) ?? [])
            lastSolvedRawPoint = estimate.point
            let movementHeading = estimateHeading(currentPoint: estimate.point, timestamp: timestamp)
            let reliableHeading = movementHeading ?? recentReliableMovementHeading(at: timestamp)
            updateDisplayedUserHeading(
                movementHeading: reliableHeading,
                movementHeadingIsFresh: movementHeading != nil
            )

            DispatchQueue.main.async {
                self.rawUserPosition = CGPoint(estimate.point)
            }

            processSensorSample(
                rawPoint: estimate.point,
                headingRadians: reliableHeading,
                confidence: confidence,
                timestamp: timestamp,
                source: .ble
            )
            return
        } else {
            confidence = baseConfidence
        }

        applyStateActions(navigationStateMachine?.handle(.sensorUpdate(confidence: confidence)) ?? [])
    }

    private func processSensorSample(
        rawPoint: SIMD2<Float>,
        headingRadians: Float?,
        confidence: Float,
        timestamp: TimeInterval,
        source: PoseSource
    ) {
        guard let poseFusionService,
              let mapMatcher,
              let routeManager else {
            return
        }

        let rawSample = RawPoseSample(
            mapPoint: rawPoint,
            headingRadians: headingRadians,
            confidence: confidence,
            timestamp: timestamp,
            source: source
        )

        let fusedPose = poseFusionService.update(rawPose: rawSample, radioFix: nil)
        guard let matched = mapMatcher.match(
            pose: fusedPose,
            floor: 0,
            preferredRouteEdgeIDs: routeManager.preferredEdgeIDs
        ) else {
            return
        }

        lastMatchedPose = matched

        let routeUpdate = routeManager.update(with: matched, timestamp: timestamp)
        if routeUpdate.isOffRouteStable {
            applyStateActions(navigationStateMachine?.handle(.routeDeviationDetected(timestamp: timestamp)) ?? [])
        } else {
            applyStateActions(navigationStateMachine?.handle(.routeRecovered) ?? [])
        }

        if routeUpdate.triggeredReroute {
            applyStateActions(navigationStateMachine?.handle(.rerouteFinished(timestamp: timestamp)) ?? [])
        }

        let displayPoint = filteredDisplayPosition(for: matched.snappedPosition, timestamp: timestamp)

        DispatchQueue.main.async {
            if let displayPoint {
                self.userPosition = CGPoint(displayPoint)
            }
            self.setNavigationRouteIfNeeded(NavigationRoute(points: routeUpdate.routePolyline))
        }
    }

    private func filteredDisplayPosition(for candidatePoint: SIMD2<Float>, timestamp: TimeInterval) -> SIMD2<Float>? {
        guard candidatePoint.x.isFinite, candidatePoint.y.isFinite else {
            return nil
        }

        let config = navigationConfig.displayPosition

        if shouldHoldForJumpConfirmation(candidatePoint: candidatePoint, timestamp: timestamp, config: config) {
            return nil
        }

        let smoothedPoint: SIMD2<Float>
        if let previous = smoothedDisplayPositionPoint {
            smoothedPoint = previous + (candidatePoint - previous) * config.smoothingAlpha
        } else {
            smoothedPoint = candidatePoint
        }
        smoothedDisplayPositionPoint = smoothedPoint

        guard let lastPublishedPoint = lastPublishedDisplayPositionPoint,
              let lastPublishedTimestamp = lastPublishedDisplayPositionTimestamp else {
            lastPublishedDisplayPositionPoint = smoothedPoint
            lastPublishedDisplayPositionTimestamp = timestamp
            return smoothedPoint
        }

        let elapsed = timestamp - lastPublishedTimestamp
        guard elapsed >= config.displayPositionUpdateIntervalSeconds else {
            return nil
        }

        let movedEnough = simd_length(smoothedPoint - lastPublishedPoint) >= config.minDisplayPositionChangeMeters
        let staleEnough = elapsed >= config.maxDisplayPositionStalenessSeconds
        guard movedEnough || staleEnough else {
            return nil
        }

        lastPublishedDisplayPositionPoint = smoothedPoint
        lastPublishedDisplayPositionTimestamp = timestamp
        return smoothedPoint
    }

    private func shouldHoldForJumpConfirmation(
        candidatePoint: SIMD2<Float>,
        timestamp: TimeInterval,
        config: DisplayPositionConfig
    ) -> Bool {
        guard let stablePoint = smoothedDisplayPositionPoint ?? lastPublishedDisplayPositionPoint else {
            pendingJumpPoint = nil
            pendingJumpConfirmations = 0
            return false
        }

        let referenceTimestamp = lastPublishedDisplayPositionTimestamp ?? timestamp
        let elapsed = max(0.05, timestamp - referenceTimestamp)
        let allowedMovement = config.maxReasonableMovementMetersPerSecond * Float(elapsed)
            + config.minDisplayPositionChangeMeters
        let distance = simd_length(candidatePoint - stablePoint)

        guard distance > allowedMovement else {
            pendingJumpPoint = nil
            pendingJumpConfirmations = 0
            return false
        }

        if let pendingJumpPoint,
           simd_length(candidatePoint - pendingJumpPoint) <= max(0.5, config.minDisplayPositionChangeMeters * 1.5) {
            pendingJumpConfirmations += 1
        } else {
            pendingJumpPoint = candidatePoint
            pendingJumpConfirmations = 1
        }

        if pendingJumpConfirmations >= max(1, config.requiredJumpConfirmations) {
            pendingJumpPoint = nil
            pendingJumpConfirmations = 0
            return false
        }

        return true
    }

    private func resetDisplayPositionFilter(to mapPoint: SIMD2<Float>? = nil, timestamp: TimeInterval? = nil) {
        smoothedDisplayPositionPoint = mapPoint
        lastPublishedDisplayPositionPoint = mapPoint
        lastPublishedDisplayPositionTimestamp = timestamp
        pendingJumpPoint = nil
        pendingJumpConfirmations = 0
    }

    // MARK: - Manual calibration

    private func performManualCalibration(to mapPoint: SIMD2<Float>) {
        let timestamp = Date().timeIntervalSince1970
        applyStateActions(
            navigationStateMachine?.handle(.manualSetPosition(mapPoint: mapPoint, timestamp: timestamp)) ?? []
        )
        applyStateActions(navigationStateMachine?.handle(.manualCalibrationApplied) ?? [])
    }

    private func runManualCalibration(_ mapPoint: SIMD2<Float>) {
        let timestamp = Date().timeIntervalSince1970

        poseFusionService?.reset(to: mapPoint, timestamp: timestamp)
        mapMatcher?.resetHistory()
        lastSolvedRawPoint = mapPoint
        lastRawPosePoint = mapPoint
        lastRawPoseTimestamp = timestamp
        lastHeadingRadians = nil
        lastHeadingTimestamp = nil
        smoothedDisplayHeadingRadians = nil

        let snapped = mapMatcher?.snapToNearestEdge(point: mapPoint)
        let effectivePoint = snapped?.snappedPosition ?? mapPoint

        if let snapped {
            lastMatchedPose = snapped
        }

        if routeManager?.handleManualCalibration(at: effectivePoint, timestamp: timestamp) == true {
            if let route = routeManager?.currentRoute?.polyline {
                DispatchQueue.main.async {
                    self.setNavigationRouteIfNeeded(NavigationRoute(points: route))
                }
            }
        }

        manualCalibrationRevision += 1
        let event = ManualCalibrationEvent(
            revision: manualCalibrationRevision,
            mapPoint: CGPoint(effectivePoint),
            timestamp: timestamp
        )
        resetDisplayPositionFilter(to: effectivePoint, timestamp: timestamp)

        DispatchQueue.main.async {
            self.userPosition = CGPoint(effectivePoint)
            self.rawUserPosition = CGPoint(effectivePoint)
            self.userHeadingRadians = nil
            self.isUserHeadingReliable = false
            self.manualCalibrationEvent = event
        }
    }

    // MARK: - State actions

    private func applyStateActions(_ actions: [NavigationAction]) {
        for action in actions {
            switch action {
            case .freezeRoute(let shouldFreeze):
                routeManager?.setRouteFrozen(shouldFreeze)

            case .runManualCalibration(let mapPoint):
                runManualCalibration(mapPoint)

            case .triggerReroute:
                break

            case .publishStatus(let status):
                DispatchQueue.main.async {
                    self.navigationStatusMessage = status
                }
            }
        }

        DispatchQueue.main.async {
            let mode = self.navigationStateMachine?.state.mode
            self.isLowConfidence = mode == .lowConfidence
        }
    }

    // MARK: - Target/route

    private func setTargetPosition(_ point: CGPoint) {
        DispatchQueue.main.async {
            self.targetPosition = point
        }

        guard let routeManager else {
            return
        }

        let startPoint = SIMD2<Float>(
            Float((userPosition ?? rawUserPosition ?? point).x),
            Float((userPosition ?? rawUserPosition ?? point).y)
        )

        let destination = SIMD2<Float>(Float(point.x), Float(point.y))
        if routeManager.setDestination(destination, from: startPoint) {
            DispatchQueue.main.async {
                self.setNavigationRouteIfNeeded(
                    NavigationRoute(points: routeManager.currentRoute?.polyline ?? [])
                )
            }
        } else {
            DispatchQueue.main.async {
                self.setNavigationRouteIfNeeded(.empty)
            }
        }
    }

    private func setNavigationRouteIfNeeded(_ route: NavigationRoute) {
        if navigationRoute != route {
            navigationRoute = route
        }
    }

    // MARK: - Confidence + heading

    private func processRSSIWindow(
        _ values: [Int],
        for beaconName: String,
        timestamp: TimeInterval
    ) -> (rssi: Int, distanceMeters: Double, quality: Double) {
        let sorted = values.sorted()
        let filtered: [Int]
        if sorted.count >= 5 {
            filtered = Array(sorted.dropFirst().dropLast())
        } else {
            filtered = sorted
        }

        let averageRSSI = Double(filtered.reduce(0, +)) / Double(filtered.count)
        let measurementStdDev = standardDeviation(of: filtered, mean: averageRSSI)
        let txPower = Double(beaconAdvertisementTxPower[beaconName] ?? Float(defaultTxPower))
        let rawDistance = calculateDistance(rssi: averageRSSI, txPower: txPower)
        let smoothedDistance = kalmanFilters[beaconName]?.filter(rawDistance) ?? rawDistance
        let sampleScore = clamp(Float(filtered.count) / 6.0, min: 0.2, max: 1)
        let stabilityScore = clamp(1 - Float(measurementStdDev / 9.0), min: 0.08, max: 1)
        let freshnessScore = clamp(
            1 - Float((timestamp - (beaconLastSeenAt[beaconName] ?? timestamp)) / navigationConfig.beacon.staleMeasurementSeconds),
            min: 0,
            max: 1
        )
        let quality = Double(
            clamp(
                0.42 * stabilityScore + 0.33 * sampleScore + 0.25 * freshnessScore,
                min: 0,
                max: 1
            )
        )
        beaconMeasurementQuality[beaconName] = Float(quality)
        return (Int(averageRSSI.rounded()), smoothedDistance, quality)
    }

    private func activeBeaconMeasurements(at timestamp: TimeInterval) -> [BeaconAnchorMeasurement] {
        beacons.compactMap { beacon in
            let ageSeconds = Float(timestamp - (beacon.lastSeenAt ?? 0))
            guard beacon.distance > 0,
                  ageSeconds <= Float(navigationConfig.beacon.staleMeasurementSeconds),
                  beacon.distance < Double(navigationConfig.beacon.maxDistanceMeters) else {
                return nil
            }

            let quality = beaconMeasurementQuality[beacon.name] ?? Float(beacon.measurementQuality)
            guard quality > 0 else {
                return nil
            }

            return BeaconAnchorMeasurement(
                beaconName: beacon.name,
                anchorPoint: SIMD2<Float>(Float(beacon.positionX), Float(beacon.positionY)),
                distanceMeters: Float(beacon.distance),
                quality: quality,
                ageSeconds: ageSeconds
            )
        }
    }

    private func calculateTrackingConfidence(activeMeasurements: [BeaconAnchorMeasurement]) -> Float {
        guard !activeMeasurements.isEmpty else {
            return 0
        }

        let countScore = clamp(Float(activeMeasurements.count - 2) / 3.0, min: 0, max: 1)
        let qualityScore = activeMeasurements.reduce(0 as Float) { $0 + $1.quality } / Float(activeMeasurements.count)
        let freshnessScore = activeMeasurements.reduce(0 as Float) { partialResult, measurement in
            let freshness = clamp(
                1 - (measurement.ageSeconds / Float(navigationConfig.beacon.staleMeasurementSeconds)),
                min: 0,
                max: 1
            )
            return partialResult + freshness
        } / Float(activeMeasurements.count)
        let proximityScore = clamp(
            1 - (activeMeasurements.map(\.distanceMeters).min() ?? navigationConfig.beacon.maxDistanceMeters) / 12.0,
            min: 0,
            max: 1
        )
        return clamp(
            0.30 * countScore + 0.30 * qualityScore + 0.20 * freshnessScore + 0.20 * proximityScore,
            min: 0,
            max: 1
        )
    }

    private func estimateHeading(currentPoint: SIMD2<Float>, timestamp: TimeInterval) -> Float? {
        defer {
            lastRawPosePoint = currentPoint
            lastRawPoseTimestamp = timestamp
        }

        guard let previousPoint = lastRawPosePoint,
              let previousTimestamp = lastRawPoseTimestamp else {
            return nil
        }

        let dt = timestamp - previousTimestamp
        guard dt > 0 else {
            return nil
        }

        let delta = currentPoint - previousPoint
        let movement = simd_length(delta)
        guard movement > 0.12 else {
            return nil
        }

        lastHeadingRadians = atan2(delta.x, delta.y)
        lastHeadingTimestamp = timestamp
        return lastHeadingRadians
    }

    private func startMotionUpdates() {
        guard motionManager.isDeviceMotionAvailable else {
            return
        }

        motionManager.stopDeviceMotionUpdates()

        motionManager.deviceMotionUpdateInterval = 1.0 / 20.0
        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self else { return }
            guard let motion else { return }

            let accelerationX = motion.userAcceleration.x
            let accelerationY = motion.userAcceleration.y
            let accelerationZ = motion.userAcceleration.z
            self.lastMotionIntensityG = Float(
                sqrt(
                    accelerationX * accelerationX
                        + accelerationY * accelerationY
                        + accelerationZ * accelerationZ
                )
            )
            let now = Date().timeIntervalSince1970
            self.updateDisplayedUserHeading(
                movementHeading: self.recentReliableMovementHeading(at: now),
                movementHeadingIsFresh: false
            )
            self.publishPredictedPose(timestamp: now)
        }
    }

    private func startHeadingUpdatesIfNeeded() {
        let authorized = locationManager.authorizationStatus == .authorizedAlways
            || locationManager.authorizationStatus == .authorizedWhenInUse

        guard trackingMode == .beacon, authorized, CLLocationManager.headingAvailable() else {
            stopHeadingUpdates()
            return
        }

        locationManager.headingFilter = 1
        locationManager.headingOrientation = .portrait

        guard !isUpdatingHeading else {
            return
        }

        locationManager.startUpdatingHeading()
        isUpdatingHeading = true
    }

    private func stopHeadingUpdates() {
        guard isUpdatingHeading else {
            return
        }

        locationManager.stopUpdatingHeading()
        isUpdatingHeading = false
    }

    private func mapHeadingRadians(from headingDegrees: CLLocationDirection) -> Float {
        let bearingRadians = Float(headingDegrees) * .pi / 180
        // Unsere Karten-/Routen-Geometrie verwendet Bildschirmkoordinaten:
        // 0 rad zeigt nach unten, +pi zeigt nach oben. Ein Nord-Heading (0 Grad)
        // muss deshalb auf +pi abgebildet werden.
        return normalizeAngle(.pi - bearingRadians)
    }

    private func updateDisplayedUserHeading(movementHeading: Float?, movementHeadingIsFresh: Bool) {
        let headingReliableNow = rawDeviceHeadingRadians != nil
            && latestHeadingAccuracyDegrees >= 0
            && latestHeadingAccuracyDegrees <= reliableHeadingAccuracyThreshold
        if isUserHeadingReliable != headingReliableNow {
            isUserHeadingReliable = headingReliableNow
        }

        let preferredHeading =
            alignedDeviceHeadingInMapCoordinates()
            ?? (movementHeadingIsFresh ? movementHeading : nil)
            ?? movementHeading
            ?? smoothedDisplayHeadingRadians

        guard let preferredHeading else {
            isUserHeadingReliable = false
            return
        }

        if let current = smoothedDisplayHeadingRadians {
            let delta = normalizeAngle(preferredHeading - current)
            smoothedDisplayHeadingRadians = normalizeAngle(current + delta * headingDisplaySmoothingAlpha)
        } else {
            smoothedDisplayHeadingRadians = preferredHeading
        }

        userHeadingRadians = smoothedDisplayHeadingRadians
    }

    private func alignedDeviceHeadingInMapCoordinates() -> Float? {
        rawDeviceHeadingRadians
    }

    private func recentReliableMovementHeading(at timestamp: TimeInterval) -> Float? {
        guard let lastHeadingRadians,
              let lastHeadingTimestamp,
              timestamp - lastHeadingTimestamp <= headingReliabilityTimeout else {
            return nil
        }

        return lastHeadingRadians
    }

    private func publishPredictedPose(timestamp: TimeInterval) {
        guard trackingMode == .beacon,
              let poseFusionService,
              let mapMatcher,
              let routeManager,
              let predictedPose = poseFusionService.predict(
                to: timestamp,
                headingRadians: recentReliableMovementHeading(at: timestamp),
                motionIntensityG: lastMotionIntensityG
              ) else {
            return
        }

        let matched = mapMatcher.match(
            pose: predictedPose,
            floor: 0,
            preferredRouteEdgeIDs: routeManager.preferredEdgeIDs
        )

        let displayPoint = matched?.snappedPosition ?? predictedPose.mapPoint
        if let matched {
            lastMatchedPose = matched
        }
        let filteredDisplayPoint = filteredDisplayPosition(for: displayPoint, timestamp: timestamp)

        DispatchQueue.main.async {
            if let filteredDisplayPoint {
                self.userPosition = CGPoint(filteredDisplayPoint)
            }
            if self.rawUserPosition == nil {
                self.rawUserPosition = CGPoint(predictedPose.mapPoint)
            }
        }
    }

    private func handleRangedIBeacons(_ rangedBeacons: [CLBeacon], timestamp: TimeInterval) {
        lastIBeaconRangingUpdateAt = timestamp
        // Keep the general BLE scan running in parallel so store beacons with
        // a different UUID can still be discovered via manufacturer data.

        var matchedNames: Set<String> = []

        for rangedBeacon in rangedBeacons {
            let detectedBeacon = DetectedStoreBeacon(rangedBeacon: rangedBeacon)
            let lookupRSSI = rangedBeacon.rssi < 0 ? rangedBeacon.rssi : minimumStoreLookupRSSI
            appendDebugLog(
                "iBeacon geranged uuid=\(detectedBeacon.uuidLookupKey) major=\(detectedBeacon.major) minor=\(detectedBeacon.minor) rssi=\(rangedBeacon.rssi)",
                key: "ranged-ibeacon-\(detectedBeacon.uuidLookupKey)",
                minInterval: 2
            )
            handleDetectedStoreBeacon(detectedBeacon, rssi: lookupRSSI)

            guard let beaconName = matchingBeaconName(for: rangedBeacon) else {
                continue
            }

            let accuracy = rangedBeacon.accuracy
            let clampedDistance = stabilizedIBeaconDistance(
                for: beaconName,
                accuracy: accuracy,
                rssi: rangedBeacon.rssi
            )
            let quality = iBeaconQuality(for: rangedBeacon)
            beaconMeasurementQuality[beaconName] = quality
            beaconLastSeenAt[beaconName] = timestamp

            updateBeaconUI(
                name: beaconName,
                rssi: rangedBeacon.rssi,
                distance: clampedDistance,
                timestamp: clampedDistance > 0 ? timestamp : nil,
                quality: Double(quality),
                txPower: nil
            )
            matchedNames.insert(beaconName)
        }

        for beacon in beacons where !matchedNames.contains(beacon.name) {
            if isMeasurementStale(for: beacon.name, timestamp: timestamp) {
                updateBeaconUI(name: beacon.name, rssi: 0, distance: 0, timestamp: nil, quality: 0, txPower: nil)
                beaconMeasurementQuality[beacon.name] = 0
            }
        }

        calculateLocation(timestamp: timestamp)
    }

    private func matchingBeaconName(for rangedBeacon: CLBeacon) -> String? {
        if let explicitMatch = matchingBeaconName(
            uuid: rangedBeacon.uuid,
            major: rangedBeacon.major.uint16Value,
            minor: rangedBeacon.minor.uint16Value
        ) {
            return explicitMatch
        }

        let minor = rangedBeacon.minor.intValue
        let major = rangedBeacon.major.intValue

        if let exactNumberMatch = beacons.first(where: { beacon in
            let trailing = trailingInteger(in: beacon.name)
            return trailing == minor && trailing == major
        }) {
            return exactNumberMatch.name
        }

        if let minorMatch = beacons.first(where: { trailingInteger(in: $0.name) == minor }) {
            return minorMatch.name
        }

        if let majorMatch = beacons.first(where: { trailingInteger(in: $0.name) == major }) {
            return majorMatch.name
        }

        return nil
    }

    private func matchingBeaconName(uuid: UUID, major: UInt16, minor: UInt16) -> String? {
        beacons.first(where: { beacon in
            beacon.beaconUUID == uuid
                && beacon.beaconMajor == major
                && beacon.beaconMinor == minor
        })?.name
    }

    private func iBeaconQuality(for rangedBeacon: CLBeacon) -> Float {
        let rssi = rangedBeacon.rssi
        guard rssi < 0 else {
            return 0.1
        }

        let signalScore = clamp((Float(rssi) + 92) / 34.0, min: 0.03, max: 1)
        let accuracyMeters = rangedBeacon.accuracy.isFinite && rangedBeacon.accuracy > 0
            ? Float(rangedBeacon.accuracy)
            : navigationConfig.beacon.maxDistanceMeters
        let distanceScore = clamp(1 - accuracyMeters / 6.0, min: 0.03, max: 1)
        let proximityScore: Float
        switch rangedBeacon.proximity {
        case .immediate:
            proximityScore = 1
        case .near:
            proximityScore = 0.8
        case .far:
            proximityScore = 0.28
        case .unknown:
            proximityScore = 0.05
        @unknown default:
            proximityScore = 0.08
        }

        return clamp(
            0.42 * signalScore + 0.38 * distanceScore + 0.20 * proximityScore,
            min: 0,
            max: 1
        )
    }

    private func stabilizedIBeaconDistance(for beaconName: String, accuracy: CLLocationAccuracy, rssi: Int) -> Double {
        guard accuracy.isFinite, accuracy > 0, rssi < 0 else {
            return beaconRangedAccuracyMeters[beaconName] ?? 0
        }

        let boundedAccuracy = min(
            Double(navigationConfig.beacon.maxDistanceMeters),
            max(Double(navigationConfig.beacon.minDistanceMeters), accuracy)
        )

        let previousAccuracy = beaconRangedAccuracyMeters[beaconName]
        let jumpLimit = Double(navigationConfig.beacon.maxAcceptedAccuracyJumpMeters)
        let acceptedAccuracy: Double
        if let previousAccuracy, abs(boundedAccuracy - previousAccuracy) > jumpLimit {
            acceptedAccuracy = previousAccuracy + (boundedAccuracy - previousAccuracy) * 0.18
        } else {
            acceptedAccuracy = boundedAccuracy
        }

        let kalmanDistance = kalmanFilters[beaconName]?.filter(acceptedAccuracy) ?? acceptedAccuracy
        let blendAlpha = Double(navigationConfig.beacon.iBeaconAccuracyBlendAlpha)
        let smoothedDistance: Double
        if let previousAccuracy {
            smoothedDistance = previousAccuracy + (kalmanDistance - previousAccuracy) * blendAlpha
        } else {
            smoothedDistance = kalmanDistance
        }

        let clampedDistance = min(
            Double(navigationConfig.beacon.maxDistanceMeters),
            max(Double(navigationConfig.beacon.minDistanceMeters), smoothedDistance)
        )
        beaconRangedAccuracyMeters[beaconName] = clampedDistance
        return clampedDistance
    }

    private func clearStaleBeaconMeasurements(at timestamp: TimeInterval) {
        for beacon in beacons {
            if isMeasurementStale(for: beacon.name, timestamp: timestamp) {
                beaconMeasurementQuality[beacon.name] = 0
                updateBeaconUI(name: beacon.name, rssi: 0, distance: 0, timestamp: nil, quality: 0, txPower: nil)
            }
        }
    }

    private func normalizeAngle(_ angle: Float) -> Float {
        var value = angle
        while value > .pi {
            value -= 2 * .pi
        }
        while value < -.pi {
            value += 2 * .pi
        }
        return value
    }

    private func clamp(_ value: Float, min: Float, max: Float) -> Float {
        Swift.max(min, Swift.min(max, value))
    }

    private func standardDeviation(of values: [Int], mean: Double) -> Double {
        guard values.count > 1 else {
            return 0
        }

        let variance = values.reduce(0.0) { partialResult, value in
            let delta = Double(value) - mean
            return partialResult + (delta * delta)
        } / Double(values.count)
        return sqrt(variance)
    }

    private func isMeasurementStale(for beaconName: String, timestamp: TimeInterval) -> Bool {
        guard let lastSeen = beaconLastSeenAt[beaconName] else {
            return true
        }
        return (timestamp - lastSeen) >= navigationConfig.beacon.staleMeasurementSeconds
    }

    private func trailingInteger(in value: String) -> Int? {
        let digits = value.reversed().prefix { $0.isNumber }.reversed()
        guard !digits.isEmpty else {
            return nil
        }
        return Int(String(digits))
    }

    private func appendDebugLog(
        _ message: String,
        key: String? = nil,
        minInterval: TimeInterval = 0
    ) {
        let now = Date()

        let publish = {
            if let key, minInterval > 0 {
                let timestamp = now.timeIntervalSince1970
                if let last = self.lastDebugLogAtByKey[key], timestamp - last < minInterval {
                    return
                }
                self.lastDebugLogAtByKey[key] = timestamp
            }

            let line = "\(Self.debugTimestampFormatter.string(from: now)) \(message)"
            self.debugLogLines.append(line)
            if self.debugLogLines.count > self.debugLogLimit {
                self.debugLogLines.removeFirst(self.debugLogLines.count - self.debugLogLimit)
            }
            print("🐞 \(line)")
        }

        if Thread.isMainThread {
            publish()
        } else {
            DispatchQueue.main.async(execute: publish)
        }
    }

    private func bodyPreview(_ data: Data?, limit: Int = 300) -> String {
        guard let data, !data.isEmpty else {
            return "<empty>"
        }

        let prefix = data.prefix(limit)
        let text = String(data: prefix, encoding: .utf8) ?? "<non-utf8 \(data.count) bytes>"
        return data.count > limit ? "\(text)..." : text
    }

    private func bluetoothStateDescription(_ state: CBManagerState) -> String {
        switch state {
        case .unknown: return "unknown"
        case .resetting: return "resetting"
        case .unsupported: return "unsupported"
        case .unauthorized: return "unauthorized"
        case .poweredOff: return "poweredOff"
        case .poweredOn: return "poweredOn"
        @unknown default: return "unknown(\(state.rawValue))"
        }
    }

    private func locationAuthorizationDescription(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: return "notDetermined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        case .authorizedAlways: return "authorizedAlways"
        case .authorizedWhenInUse: return "authorizedWhenInUse"
        @unknown default: return "unknown(\(status.rawValue))"
        }
    }

    private func handleDetectedStoreBeacon(_ beacon: DetectedStoreBeacon, rssi: Int) {
        guard rssi >= minimumStoreLookupRSSI else {
            appendDebugLog(
                "Store-Beacon RSSI ignoriert uuid=\(beacon.uuidLookupKey) rssi=\(rssi)",
                key: "store-rssi-low-\(beacon.uuidLookupKey)",
                minInterval: 5
            )
            return
        }

        let storeLookupKey = beacon.uuidLookupKey

        if storeLookupKey == pendingStoreLookupIdentityKey || storeLookupKey == activeStoreBeaconIdentityKey {
            appendDebugLog(
                "Store-Lookup uebersprungen uuid=\(storeLookupKey) pending/active",
                key: "store-lookup-skip-\(storeLookupKey)",
                minInterval: 5
            )
            return
        }

        if storeLookupKey == lastFailedStoreLookupIdentityKey,
           let lastFailedStoreLookupAt,
           Date().timeIntervalSince1970 - lastFailedStoreLookupAt < storeLookupFailureCooldown {
            appendDebugLog(
                "Store-Lookup Cooldown uuid=\(storeLookupKey)",
                key: "store-lookup-cooldown-\(storeLookupKey)",
                minInterval: 5
            )
            return
        }

        pendingStoreLookupIdentityKey = storeLookupKey

        guard let url = storeLookupURL(for: beacon) else {
            pendingStoreLookupIdentityKey = nil
            appendDebugLog("Store-Lookup URL ungueltig uuid=\(storeLookupKey)")
            return
        }

        appendDebugLog("Store-Lookup startet rssi=\(rssi) url=\(url.absoluteString)")

        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            guard let self else { return }

            defer {
                DispatchQueue.main.async {
                    if self.pendingStoreLookupIdentityKey == storeLookupKey {
                        self.pendingStoreLookupIdentityKey = nil
                    }
                }
            }

            if let error {
                print("❌ Store-Detection fehlgeschlagen: \(error.localizedDescription)")
                self.appendDebugLog("Store-Lookup Netzwerkfehler: \(error.localizedDescription)")
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                self.appendDebugLog("Store-Lookup ohne HTTPURLResponse")
                return
            }

            self.appendDebugLog(
                "Store-Lookup HTTP \(httpResponse.statusCode) bytes=\(data?.count ?? 0) body=\(self.bodyPreview(data))"
            )

            if httpResponse.statusCode == 404 {
                DispatchQueue.main.async {
                    self.lastFailedStoreLookupIdentityKey = storeLookupKey
                    self.lastFailedStoreLookupAt = Date().timeIntervalSince1970
                    self.clearDetectedStore()
                    if self.selectedLayoutMode == .currentServer {
                        self.loadDefaultCurrentServerLayout()
                    }
                }
                return
            }

            guard (200...299).contains(httpResponse.statusCode), let data else {
                self.appendDebugLog("Store-Lookup abgebrochen wegen HTTP \(httpResponse.statusCode)")
                return
            }

            do {
                let detection = try JSONDecoder().decode(StoreByBeaconResponse.self, from: data)
                self.appendDebugLog(
                    "Store-Lookup decodiert store=\(detection.store.name) id=\(detection.store.id.uuidString)"
                )
                DispatchQueue.main.async {
                    self.applyDetectedStore(detection, identityKey: storeLookupKey)
                }
            } catch {
                print("❌ Store-Detection konnte nicht decodiert werden: \(error.localizedDescription)")
                self.appendDebugLog("Store-Lookup Decode-Fehler: \(error.localizedDescription)")
            }
        }.resume()
    }

    private func applyDetectedStore(_ detection: StoreByBeaconResponse, identityKey: String) {
        let hasAppliedStoreLayout = activeLayoutStore?.id == detection.store.id
        let shouldLoadStoreLayout = !hasAppliedStoreLayout || selectedLayoutMode != .currentServer

        appendDebugLog(
            "Store erkannt \(detection.store.name), selectedMode=\(selectedLayoutMode.rawValue), loadLayout=\(shouldLoadStoreLayout)"
        )
        detectedStore = detection.store
        activeStoreBeaconIdentityKey = identityKey
        lastFailedStoreLookupIdentityKey = nil
        lastFailedStoreLookupAt = nil

        guard shouldLoadStoreLayout else {
            return
        }

        loadStoreLayout(for: detection.store, identityKey: identityKey, source: .beacon)
    }

    private func clearDetectedStore() {
        detectedStore = nil
        activeStoreBeaconIdentityKey = nil
    }

    // MARK: - Layout/pipeline bootstrap

    private func restorePersistedLayoutSelection() {
        let defaults = UserDefaults.standard
        if let rawMode = defaults.string(forKey: selectedLayoutModeDefaultsKey),
           let persistedMode = LayoutSelectionMode(rawValue: rawMode) {
            selectedLayoutMode = persistedMode
        } else {
            selectedLayoutMode = .currentServer
        }

        selectedLayoutId = defaults.string(forKey: selectedLayoutIdDefaultsKey)

        if selectedLayoutMode == .version,
           let selectedLayoutId,
           !selectedLayoutId.isEmpty {
            selectedLayoutName = layoutHistory.first(where: { $0.layoutId == selectedLayoutId })?.displayName
                ?? "Version \(selectedLayoutId.prefix(8))"
            loadLayoutVersion(withId: selectedLayoutId)
        } else {
            selectedLayoutMode = .currentServer
            selectedLayoutId = nil
            selectedLayoutName = "Aktuelles Server-Layout"
            loadCurrentServerLayout()
        }
    }

    private func persistLayoutSelection() {
        let defaults = UserDefaults.standard
        defaults.set(selectedLayoutMode.rawValue, forKey: selectedLayoutModeDefaultsKey)
        defaults.set(selectedLayoutId, forKey: selectedLayoutIdDefaultsKey)
    }

    private func refreshSelectedLayoutPresentationIfNeeded() {
        guard selectedLayoutMode == .version,
              let selectedLayoutId,
              let version = layoutHistory.first(where: { $0.layoutId == selectedLayoutId }) else {
            return
        }

        selectedLayoutName = version.displayName
    }

    private func loadCurrentServerLayout() {
        if let detectedStore {
            loadStoreLayout(for: detectedStore, identityKey: activeStoreBeaconIdentityKey, source: .beacon)
            return
        }

        loadDefaultCurrentServerLayout()
    }

    private func loadDefaultCurrentServerLayout() {
        guard let url = currentLayoutURL() else {
            loadBundleLayoutFallback(reason: "Server-URL ungueltig")
            return
        }

        appendDebugLog("Default-Layout Request url=\(url.absoluteString)")
        let loadGeneration = beginLayoutLoad()
        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }
                guard self.isCurrentLayoutLoad(loadGeneration) else {
                    self.appendDebugLog("Default-Layout Antwort ignoriert: veraltete Generation")
                    return
                }

                switch result {
                case .success(let data):
                    do {
                        let layout = try self.decodeLayout(from: data)
                        self.applyLayout(layout)
                        self.activeLayoutStore = nil
                        self.activeLayoutStoreSource = nil
                        self.clearStoreLayoutFailureMessageIfNeeded()
                        self.selectedLayoutMode = .currentServer
                        self.selectedLayoutId = nil
                        self.selectedLayoutName = "Aktuelles Server-Layout"
                        self.activeLayoutDescription = self.currentLayoutDescription(for: layout)
                        self.isLoadingLayout = false
                        self.persistLayoutSelection()
                        self.appendDebugLog("Default-Layout angewendet shop=\(layout.shopName)")
                    } catch {
                        print("❌ Aktuelles Server-Layout konnte nicht decodiert werden: \(error.localizedDescription)")
                        self.appendDebugLog("Default-Layout Decode-Fehler: \(error.localizedDescription)")
                        self.loadLatestHistoryVersionFallback(reason: "Server-Layout nicht lesbar")
                    }
                case .failure(let error):
                    print("❌ Aktuelles Server-Layout konnte nicht geladen werden: \(error.localizedDescription)")
                    self.appendDebugLog("Default-Layout Fehler: \(error.localizedDescription)")
                    self.loadLatestHistoryVersionFallback(reason: "Server momentan nicht erreichbar")
                }
            }
        }
    }

    private func loadStoreLayout(
        for store: MobileStoreSummary,
        identityKey: String? = nil,
        source: StoreLayoutActivationSource
    ) {
        guard let url = detectedStoreLayoutURL(storeID: store.id) else {
            loadBundleLayoutFallback(reason: "Store-Layout-URL ungueltig")
            return
        }

        appendDebugLog("Store-Layout Request store=\(store.name) url=\(url.absoluteString)")
        let loadGeneration = beginLayoutLoad()
        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }
                guard self.isCurrentLayoutLoad(loadGeneration) else {
                    self.appendDebugLog("Store-Layout Antwort ignoriert: veraltete Generation")
                    return
                }

                switch result {
                case .success(let data):
                    do {
                        let layout = try self.decodeMobileLayout(from: data)
                        self.applyLayout(layout)
                        self.activeLayoutStore = store
                        self.activeLayoutStoreSource = source
                        self.clearStoreLayoutFailureMessageIfNeeded()
                        self.selectedLayoutMode = .currentServer
                        self.selectedLayoutId = nil
                        self.selectedLayoutName = store.name
                        self.activeLayoutDescription = self.currentStoreLayoutDescription(
                            for: layout,
                            store: store
                        )
                        self.isLoadingLayout = false
                        self.persistLayoutSelection()
                        self.appendDebugLog(
                            "Store-Layout angewendet shop=\(layout.shopName) grid=\(layout.gridSize.width)x\(layout.gridSize.height) elements=\(layout.elements.count) beacons=\(layout.elements.filter { $0.type == "beacon" }.count)"
                        )
                    } catch {
                        print("❌ Store-Layout konnte nicht decodiert werden: \(error.localizedDescription)")
                        self.appendDebugLog("Store-Layout Decode-Fehler: \(error.localizedDescription)")
                        self.markDetectedStoreLayoutFailed(
                            store: store,
                            identityKey: identityKey,
                            reason: "Store-Layout nicht lesbar"
                        )
                    }
                case .failure(let error):
                    print("❌ Store-Layout konnte nicht geladen werden: \(error.localizedDescription)")
                    self.appendDebugLog("Store-Layout Fehler: \(error.localizedDescription)")
                    self.markDetectedStoreLayoutFailed(
                        store: store,
                        identityKey: identityKey,
                        reason: error.localizedDescription
                    )
                }
            }
        }
    }

    private func loadLayoutVersion(withId layoutId: String) {
        guard let url = layoutVersionURL(layoutId: layoutId) else {
            fallbackFromMissingVersion(withMessage: "Versions-URL ungueltig")
            return
        }

        let loadGeneration = beginLayoutLoad()
        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }
                guard self.isCurrentLayoutLoad(loadGeneration) else { return }

                switch result {
                case .success(let data):
                    do {
                        let layout = try self.decodeLayout(from: data)
                        self.applyLayout(layout)
                        self.activeLayoutStore = nil
                        self.activeLayoutStoreSource = nil
                        self.clearStoreLayoutFailureMessageIfNeeded()
                        self.selectedLayoutMode = .version
                        self.selectedLayoutId = layoutId
                        self.selectedLayoutName = self.layoutHistory.first(where: { $0.layoutId == layoutId })?.displayName
                            ?? self.fallbackVersionName(for: layout, layoutId: layoutId)
                        self.activeLayoutDescription = self.versionLayoutDescription(for: layout, layoutId: layoutId)
                        self.isLoadingLayout = false
                        self.persistLayoutSelection()
                    } catch {
                        print("❌ Layout-Version konnte nicht decodiert werden: \(error.localizedDescription)")
                        self.fallbackFromMissingVersion(withMessage: "Version nicht mehr lesbar")
                    }
                case .failure(let error):
                    print("❌ Layout-Version konnte nicht geladen werden: \(error.localizedDescription)")
                    self.fallbackFromMissingVersion(withMessage: "Version nicht mehr verfuegbar")
                }
            }
        }
    }

    private func fallbackFromMissingVersion(withMessage message: String) {
        selectedLayoutMode = .currentServer
        selectedLayoutId = nil
        selectedLayoutName = "Aktuelles Server-Layout"
        persistLayoutSelection()
        loadCurrentServerLayout()

        if activeLayoutDescription.contains("Bundle-Layout") {
            activeLayoutDescription = bundleLayoutDescription(reason: message)
        }
    }

    private func loadBundleLayoutFallback(reason: String? = nil) {
        _ = beginLayoutLoad()
        guard let layout = loadLayoutFromJSON() else {
            isLoadingLayout = false
            activeLayoutDescription = "Kein Bundle-Layout verfuegbar"
            return
        }

        applyLayout(layout)
        activeLayoutStore = nil
        activeLayoutStoreSource = nil
        clearStoreLayoutFailureMessageIfNeeded()
        activeLayoutDescription = bundleLayoutDescription(reason: reason)
        isLoadingLayout = false
    }

    private func loadLatestHistoryVersionFallback(reason: String) {
        guard let url = layoutHistoryURL(limit: 1) else {
            loadBundleLayoutFallback(reason: reason)
            return
        }

        let loadGeneration = beginLayoutLoad()
        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }
                guard self.isCurrentLayoutLoad(loadGeneration) else { return }

                switch result {
                case .success(let data):
                    do {
                        let history = try self.decodeLayoutHistory(from: data)
                        if let latestVersion = history.first {
                            self.layoutHistory = self.mergeLayoutHistory(history)
                            self.loadLatestVersionAsCurrentFallback(version: latestVersion)
                        } else {
                            self.loadBundleLayoutFallback(reason: reason)
                        }
                    } catch {
                        print("❌ Letzte Layout-Version konnte nicht als Fallback decodiert werden: \(error.localizedDescription)")
                        self.loadBundleLayoutFallback(reason: reason)
                    }
                case .failure(let error):
                    print("❌ Letzte Layout-Version konnte nicht als Fallback geladen werden: \(error.localizedDescription)")
                    self.loadBundleLayoutFallback(reason: reason)
                }
            }
        }
    }

    @discardableResult
    private func loadLayoutFromJSON() -> LayoutData? {
        guard let url = Bundle.main.url(forResource: "layout", withExtension: "json") else {
            return nil
        }

        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(LayoutData.self, from: data)
        } catch {
            print("❌ JSON Fehler beim Bundle-Layout: \(error)")
            return nil
        }
    }

    private func applyLayout(_ layout: LayoutData) {
        gridWidth = layout.gridSize.width
        gridHeight = layout.gridSize.height
        shelves = layout.elements.filter { $0.type != "beacon" }
        beacons = buildBeacons(from: layout.elements)
        appendDebugLog(
            "applyLayout shop=\(layout.shopName) grid=\(gridWidth)x\(gridHeight) shelves=\(shelves.count) beacons=\(beacons.count)"
        )
        syncKalmanFiltersWithBeacons()
        clearBeaconMeasurements()
        rssiBuffer.removeAll()
        resetDisplayPositionFilter()
        targetPosition = nil
        rebuildNavigationPipeline()
        setNavigationRouteIfNeeded(.empty)
        routeManager?.clearRoute()
        setFixedTargetIfNeeded()
        layoutRevision += 1
        configureBeaconScanningForCurrentMode()
    }

    private func buildBeacons(from elements: [LayoutElement]) -> [IndooroBeacon] {
        elements
            .filter { $0.type == "beacon" }
            .compactMap { element in
                guard let name = element.beaconId else { return nil }
                let fallbackIdentityNumber = trailingInteger(in: name)
                return IndooroBeacon(
                    id: String(element.id),
                    name: name,
                    beaconUUID: beaconUUID(for: element),
                    beaconMajor: beaconMajor(for: element, fallbackNumber: fallbackIdentityNumber),
                    beaconMinor: beaconMinor(for: element, fallbackNumber: fallbackIdentityNumber),
                    positionX: element.x,
                    positionY: element.y
                )
            }
    }

    private func syncKalmanFiltersWithBeacons() {
        var updatedFilters: [String: KalmanFilter] = [:]

        for beacon in beacons {
            updatedFilters[beacon.name] = kalmanFilters[beacon.name]
                ?? KalmanFilter(processNoise: 0.02, measurementNoise: 4.0)
        }

        kalmanFilters = updatedFilters
    }

    private func mergeLayoutHistory(_ incomingHistory: [LayoutVersionSummary]) -> [LayoutVersionSummary] {
        var merged = incomingHistory
        for version in layoutHistory where !merged.contains(where: { $0.layoutId == version.layoutId }) {
            merged.append(version)
        }
        return merged
    }

    private func loadLatestVersionAsCurrentFallback(version: LayoutVersionSummary) {
        guard let url = layoutVersionURL(layoutId: version.layoutId) else {
            loadBundleLayoutFallback(reason: "Fallback-Version nicht lesbar")
            return
        }

        let loadGeneration = beginLayoutLoad()
        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }
                guard self.isCurrentLayoutLoad(loadGeneration) else { return }

                switch result {
                case .success(let data):
                    do {
                        let layout = try self.decodeLayout(from: data)
                        self.applyLayout(layout)
                        self.activeLayoutStore = nil
                        self.activeLayoutStoreSource = nil
                        self.clearStoreLayoutFailureMessageIfNeeded()
                        self.selectedLayoutMode = .currentServer
                        self.selectedLayoutId = nil
                        self.selectedLayoutName = "Aktuelles Server-Layout"
                        self.activeLayoutDescription = self.currentLayoutFallbackDescription(for: layout)
                        self.isLoadingLayout = false
                        self.persistLayoutSelection()
                    } catch {
                        print("❌ Fallback-Version konnte nicht decodiert werden: \(error.localizedDescription)")
                        self.loadBundleLayoutFallback(reason: "Fallback-Version nicht lesbar")
                    }
                case .failure(let error):
                    print("❌ Fallback-Version konnte nicht geladen werden: \(error.localizedDescription)")
                    self.loadBundleLayoutFallback(reason: "Fallback-Version nicht verfuegbar")
                }
            }
        }
    }

    private func beginLayoutLoad() -> Int {
        layoutLoadGeneration += 1
        isLoadingLayout = true
        return layoutLoadGeneration
    }

    private func isCurrentLayoutLoad(_ generation: Int) -> Bool {
        generation == layoutLoadGeneration
    }

    private func refreshStoreDetectionBeaconsIfNeeded(force: Bool = false) {
        if isLoadingStoreDetectionBeacons {
            return
        }

        let now = Date().timeIntervalSince1970
        if !force,
           let lastStoreDetectionBeaconRefreshAt,
           now - lastStoreDetectionBeaconRefreshAt < storeDetectionRefreshInterval {
            return
        }

        guard let url = storeDetectionBeaconIdentitiesURL() else {
            return
        }

        isLoadingStoreDetectionBeacons = true
        lastStoreDetectionBeaconRefreshAt = now
        appendDebugLog("Store-Beacon-Identities Request url=\(url.absoluteString)")

        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            guard let self else { return }

            if let error {
                DispatchQueue.main.async {
                    self.isLoadingStoreDetectionBeacons = false
                }
                self.appendDebugLog("Store-Beacon-Identities Fehler: \(error.localizedDescription)")
                return
            }

            guard let response = response as? HTTPURLResponse else {
                DispatchQueue.main.async {
                    self.isLoadingStoreDetectionBeacons = false
                }
                self.appendDebugLog("Store-Beacon-Identities ohne HTTPURLResponse")
                return
            }

            guard (200...299).contains(response.statusCode), let data else {
                DispatchQueue.main.async {
                    self.isLoadingStoreDetectionBeacons = false
                }
                self.appendDebugLog(
                    "Store-Beacon-Identities HTTP \(response.statusCode) body=\(self.bodyPreview(data))"
                )
                return
            }

            do {
                let catalog = try JSONDecoder().decode(StoreDetectionBeaconCatalog.self, from: data)
                let uuids = Set(catalog.uuidStrings.compactMap { BeaconUUIDNormalizer.uuid(from: $0) })
                DispatchQueue.main.async {
                    self.isLoadingStoreDetectionBeacons = false
                    guard !uuids.isEmpty else {
                        self.appendDebugLog("Store-Beacon-Identities leer")
                        return
                    }

                    if uuids != self.storeDetectionIBeaconUUIDs {
                        self.storeDetectionIBeaconUUIDs = uuids
                        self.rangingConstraints = self.buildRangingConstraints()
                        self.configureBeaconScanningForCurrentMode()
                    }
                    self.appendDebugLog("Store-Beacon-Identities geladen count=\(uuids.count)")
                }
            } catch {
                DispatchQueue.main.async {
                    self.isLoadingStoreDetectionBeacons = false
                }
                self.appendDebugLog("Store-Beacon-Identities Decode-Fehler: \(error.localizedDescription)")
            }
        }.resume()
    }

    private func markDetectedStoreLayoutFailed(
        store: MobileStoreSummary,
        identityKey: String?,
        reason: String
    ) {
        isLoadingLayout = false
        activeStoreBeaconIdentityKey = nil
        activeLayoutStore = nil
        activeLayoutStoreSource = nil
        activeLayoutDescription = "\(store.name) erkannt • Layout nicht geladen: \(reason)"
        navigationStatusMessage = storeLayoutFailureStatusMessage

        if let identityKey {
            lastFailedStoreLookupIdentityKey = identityKey
            lastFailedStoreLookupAt = Date().timeIntervalSince1970
        }
    }

    private func clearStoreLayoutFailureMessageIfNeeded() {
        if navigationStatusMessage == storeLayoutFailureStatusMessage {
            navigationStatusMessage = nil
        }
    }

    private func performRequest(url: URL, completion: @escaping (Result<Data, Error>) -> Void) {
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let error {
                self.appendDebugLog("HTTP Fehler \(url.path): \(error.localizedDescription)")
                completion(.failure(error))
                return
            }

            guard let response = response as? HTTPURLResponse else {
                self.appendDebugLog("HTTP ungueltige Response \(url.path)")
                completion(.failure(LayoutLoadingError.invalidResponse))
                return
            }

            guard (200...299).contains(response.statusCode) else {
                self.appendDebugLog(
                    "HTTP \(response.statusCode) \(url.path) body=\(self.bodyPreview(data))"
                )
                completion(.failure(LayoutLoadingError.httpStatus(response.statusCode)))
                return
            }

            guard let data else {
                self.appendDebugLog("HTTP \(response.statusCode) \(url.path) ohne Body")
                completion(.failure(LayoutLoadingError.emptyData))
                return
            }

            self.appendDebugLog(
                "HTTP \(response.statusCode) \(url.path) bytes=\(data.count)",
                key: "http-success-\(url.path)",
                minInterval: 1
            )
            completion(.success(data))
        }.resume()
    }

    private func decodeLayout(from data: Data) throws -> LayoutData {
        let decoder = JSONDecoder()

        if let layout = try? decoder.decode(LayoutData.self, from: data) {
            return layout
        }

        if let envelope = try? decoder.decode(LayoutEnvelope.self, from: data),
           let layout = envelope.layout ?? envelope.data ?? envelope.current ?? envelope.version {
            return layout
        }

        throw LayoutLoadingError.decodingFailed
    }

    private func decodeMobileLayout(from data: Data) throws -> LayoutData {
        let decoder = JSONDecoder()

        if let response = try? decoder.decode(MobileLayoutResponse.self, from: data) {
            return response.layout
        }

        return try decodeLayout(from: data)
    }

    private func decodeMobileStores(from data: Data) throws -> [MobileStoreSummary] {
        let decoder = JSONDecoder()

        if let stores = try? decoder.decode([MobileStoreSummary].self, from: data) {
            return stores
        }

        if let envelope = try? decoder.decode(MobileStoresEnvelope.self, from: data) {
            return envelope.stores ?? envelope.items ?? envelope.data ?? []
        }

        throw LayoutLoadingError.decodingFailed
    }

    private func decodeLayoutHistory(from data: Data) throws -> [LayoutVersionSummary] {
        let decoder = JSONDecoder()

        if let history = try? decoder.decode([LayoutVersionSummary].self, from: data) {
            return history
        }

        if let envelope = try? decoder.decode(LayoutHistoryEnvelope.self, from: data) {
            return envelope.versions ?? envelope.history ?? envelope.items ?? envelope.data ?? []
        }

        throw LayoutLoadingError.decodingFailed
    }

    private func currentLayoutURL() -> URL? {
        URL(string: "\(apiBase)/layout/current")
    }

    private func mobileStoresURL() -> URL? {
        URL(string: "\(apiBase)/mobile/stores")
    }

    private func storeDetectionBeaconIdentitiesURL() -> URL? {
        URL(string: "\(apiBase)/mobile/stores/beacon-identities")
    }

    private func detectedStoreLayoutURL(storeID: UUID) -> URL? {
        URL(string: "\(apiBase)/mobile/stores/\(storeID.uuidString.lowercased())/layout/current")
    }

    private func layoutHistoryURL(limit: Int) -> URL? {
        guard var components = URLComponents(string: "\(apiBase)/layout/history") else {
            return nil
        }
        components.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        return components.url
    }

    private func layoutVersionURL(layoutId: String) -> URL? {
        let encodedLayoutId = layoutId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? layoutId
        return URL(string: "\(apiBase)/layout/versions/\(encodedLayoutId)")
    }

    private func currentLayoutDescription(for layout: LayoutData) -> String {
        var parts = [layout.shopName, "Live aus LeoCloud"]
        if let timestamp = LayoutTimestampFormatter.display(layout.savedAt ?? layout.exportDate) {
            parts.append(timestamp)
        }
        return parts.joined(separator: " • ")
    }

    private func currentStoreLayoutDescription(for layout: LayoutData, store: MobileStoreSummary) -> String {
        var parts = [store.name, "Aktive Filiale"]
        if let timestamp = LayoutTimestampFormatter.display(layout.savedAt ?? layout.exportDate) {
            parts.append(timestamp)
        }
        return parts.joined(separator: " • ")
    }

    private func currentLayoutFallbackDescription(for layout: LayoutData) -> String {
        var parts = [layout.shopName, "Fallback auf letzte Version"]
        if let timestamp = LayoutTimestampFormatter.display(layout.savedAt ?? layout.exportDate) {
            parts.append(timestamp)
        }
        return parts.joined(separator: " • ")
    }

    private func versionLayoutDescription(for layout: LayoutData, layoutId: String) -> String {
        var parts = [layout.shopName, "Gespeicherte Version"]
        if let timestamp = LayoutTimestampFormatter.display(layout.savedAt ?? layout.exportDate) {
            parts.append(timestamp)
        } else {
            parts.append("ID \(layoutId.prefix(8))")
        }
        return parts.joined(separator: " • ")
    }

    private func fallbackVersionName(for layout: LayoutData, layoutId: String) -> String {
        if let timestamp = LayoutTimestampFormatter.display(layout.savedAt ?? layout.exportDate) {
            return "Version vom \(timestamp)"
        }
        return "Version \(layoutId.prefix(8))"
    }

    private func bundleLayoutDescription(reason: String?) -> String {
        if let reason, !reason.isEmpty {
            return "Bundle-Layout aktiv • \(reason)"
        }
        return "Bundle-Layout aktiv"
    }

    private func rebuildNavigationPipeline() {
        let graph = IndoorGraphBuilder.fromLayout(
            gridWidth: Int(gridWidth),
            gridHeight: Int(gridHeight),
            elements: shelves
        )

        indoorGraph = graph
        poseFusionService = PoseFusionService(config: navigationConfig.poseFusion)
        mapMatcher = MapMatcher(graph: graph, config: navigationConfig.mapMatcher)
        routeManager = RouteManager(graph: graph, config: navigationConfig.route)
        navigationStateMachine = NavigationStateMachine(config: navigationConfig.confidence)
        beaconPositionSolver = BeaconPositionSolver(bounds: mapBounds, config: navigationConfig.beacon)
        rangingConstraints = buildRangingConstraints()

        if let targetPosition {
            setTargetPosition(targetPosition)
        }
    }

    private func setFixedTargetIfNeeded() {
        guard let fixedTargetCategory else { return }

        if let shelf = shelves.first(where: { $0.category == fixedTargetCategory }) {
            let tx = shelf.x + (shelf.width ?? 1) / 2
            let ty = shelf.y + (shelf.height ?? 1) / 2
            targetPosition = CGPoint(x: tx, y: ty)
            setNavigationRouteIfNeeded(.empty)
        } else if let fallback = shelves.first {
            let tx = fallback.x + (fallback.width ?? 1) / 2
            let ty = fallback.y + (fallback.height ?? 1) / 2
            targetPosition = CGPoint(x: tx, y: ty)
            setNavigationRouteIfNeeded(.empty)
        }
    }

    private func beaconUUID(for element: LayoutElement) -> UUID? {
        BeaconUUIDNormalizer.uuid(from: element.beaconUUID)
    }

    private func beaconMajor(for element: LayoutElement, fallbackNumber: Int?) -> UInt16? {
        if let beaconMajor = element.beaconMajor {
            return UInt16(clamping: beaconMajor)
        }

        guard let fallbackNumber else {
            return nil
        }
        return UInt16(clamping: fallbackNumber)
    }

    private func beaconMinor(for element: LayoutElement, fallbackNumber: Int?) -> UInt16? {
        if let beaconMinor = element.beaconMinor {
            return UInt16(clamping: beaconMinor)
        }

        guard let fallbackNumber else {
            return nil
        }
        return UInt16(clamping: fallbackNumber)
    }

    private func buildRangingConstraints() -> [CLBeaconIdentityConstraint] {
        struct ConstraintKey: Hashable {
            let uuid: UUID
            let major: UInt16?
        }

        let layoutKeys = Set(
            beacons.compactMap { beacon -> ConstraintKey? in
                guard let uuid = beacon.beaconUUID else {
                    return nil
                }
                return ConstraintKey(uuid: uuid, major: beacon.beaconMajor)
            }
        )
        let storeDetectionKeys = Set(
            storeDetectionIBeaconUUIDs.map { uuid in
                ConstraintKey(uuid: uuid, major: nil)
            }
        )
        var keys = layoutKeys.union(storeDetectionKeys)
        let uuidWideConstraints = Set(keys.compactMap { key in
            key.major == nil ? key.uuid : nil
        })
        keys = keys.filter { key in
            key.major == nil || !uuidWideConstraints.contains(key.uuid)
        }

        let constraints = keys
            .sorted {
                if $0.uuid.uuidString == $1.uuid.uuidString {
                    return ($0.major ?? 0) < ($1.major ?? 0)
                }
                return $0.uuid.uuidString < $1.uuid.uuidString
            }
            .map { key in
                if let major = key.major {
                    return CLBeaconIdentityConstraint(uuid: key.uuid, major: major)
                }
                return CLBeaconIdentityConstraint(uuid: key.uuid)
            }
        appendDebugLog(
            "iBeacon-Constraints gebaut layout=\(layoutKeys.count) storeDetection=\(storeDetectionKeys.count) total=\(constraints.count)",
            key: "ranging-constraints",
            minInterval: 2
        )
        return constraints
    }

    // MARK: - RSSI helpers

    private func updateBeaconUI(
        name: String,
        rssi: Int,
        distance: Double,
        timestamp: TimeInterval?,
        quality: Double,
        txPower: Double?
    ) {
        if let index = beacons.firstIndex(where: { $0.name == name }) {
            var updated = beacons[index]
            updated.rssi = rssi
            updated.distance = distance
            updated.lastSeenAt = timestamp
            updated.measurementQuality = quality
            updated.txPower = txPower
            beacons[index] = updated
        }
    }

    private func calculateDistance(rssi: Double, txPower: Double) -> Double {
        let exponent = (txPower - rssi) / (10.0 * pathLossExp)
        let distance = pow(10.0, exponent)
        return min(
            Double(navigationConfig.beacon.maxDistanceMeters),
            max(Double(navigationConfig.beacon.minDistanceMeters), distance)
        )
    }

    private func requestLocationAuthorizationIfNeeded() {
        guard CLLocationManager.locationServicesEnabled() else {
            navigationStatusMessage = "Ortungsdienste sind deaktiviert. iBeacon-Ranging braucht Standortfreigabe."
            appendDebugLog("Location Services deaktiviert")
            return
        }

        appendDebugLog("Location Auth: \(locationAuthorizationDescription(locationManager.authorizationStatus))")
        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            configureBeaconScanningForCurrentMode()
            startHeadingUpdatesIfNeeded()
        case .notDetermined:
            appendDebugLog("Location Auth wird angefragt")
            locationManager.requestWhenInUseAuthorization()
        case .restricted, .denied:
            navigationStatusMessage = "Bitte Standortfreigabe erlauben, damit iBeacon-Ranging funktioniert."
            appendDebugLog("Location Auth fehlt: \(locationAuthorizationDescription(locationManager.authorizationStatus))")
            stopHeadingUpdates()
        @unknown default:
            break
        }
    }

    private func configureIBeaconRangingForCurrentMode() {
        guard preferIBeaconRanging else {
            stopIBeaconRanging()
            return
        }

        let authorized = locationManager.authorizationStatus == .authorizedAlways
            || locationManager.authorizationStatus == .authorizedWhenInUse

        guard trackingMode == .beacon, authorized, !rangingConstraints.isEmpty else {
            appendDebugLog(
                "iBeacon-Ranging nicht gestartet mode=\(trackingMode.rawValue) authorized=\(authorized) constraints=\(rangingConstraints.count)",
                key: "ranging-not-started",
                minInterval: 5
            )
            stopIBeaconRanging()
            return
        }

        startIBeaconRanging()
    }

    private func startIBeaconRanging() {
        if isRangingIBeacons || !activeRangingConstraints.isEmpty {
            for constraint in activeRangingConstraints {
                locationManager.stopRangingBeacons(satisfying: constraint)
            }
        }

        for constraint in rangingConstraints {
            locationManager.startRangingBeacons(satisfying: constraint)
        }
        activeRangingConstraints = rangingConstraints
        isRangingIBeacons = !rangingConstraints.isEmpty
        appendDebugLog("iBeacon-Ranging gestartet constraints=\(rangingConstraints.count)")
    }

    private func stopIBeaconRanging() {
        guard isRangingIBeacons || !activeRangingConstraints.isEmpty else {
            return
        }

        for constraint in activeRangingConstraints {
            locationManager.stopRangingBeacons(satisfying: constraint)
        }
        activeRangingConstraints.removeAll()
        isRangingIBeacons = false
        lastIBeaconRangingUpdateAt = nil
        appendDebugLog("iBeacon-Ranging gestoppt")
    }

    private func configureBeaconScanningForCurrentMode() {
        configureIBeaconRangingForCurrentMode()
        startHeadingUpdatesIfNeeded()

        guard let centralManager else {
            appendDebugLog("BLE Scan nicht konfiguriert: CentralManager nil", key: "central-nil", minInterval: 5)
            return
        }
        guard centralManager.state == .poweredOn else {
            appendDebugLog(
                "BLE Scan nicht gestartet: state=\(bluetoothStateDescription(centralManager.state))",
                key: "central-state-\(centralManager.state.rawValue)",
                minInterval: 5
            )
            stopBeaconScan()
            return
        }

        switch trackingMode {
        case .beacon:
            startBeaconScan()
        case .debugNoBeacons:
            stopBeaconScan()
            stopHeadingUpdates()
        }
    }

    private func startBeaconScan() {
        guard let centralManager else {
            return
        }
        guard !isScanningBeacons else {
            return
        }

        centralManager.scanForPeripherals(
            withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
        )
        isScanningBeacons = true
        appendDebugLog("BLE Scan gestartet")
    }

    private func stopBeaconScan() {
        guard isScanningBeacons else {
            return
        }
        centralManager?.stopScan()
        isScanningBeacons = false
        appendDebugLog("BLE Scan gestoppt")
    }

    private func clearBeaconMeasurements() {
        for index in beacons.indices {
            beacons[index].rssi = 0
            beacons[index].distance = 0
            beacons[index].lastSeenAt = nil
            beacons[index].measurementQuality = 0
        }
        beaconLastSeenAt.removeAll()
        beaconMeasurementQuality.removeAll()
        beaconAdvertisementTxPower.removeAll()
        beaconRangedAccuracyMeters.removeAll()
        lastSolvedRawPoint = nil
        lastIBeaconRangingUpdateAt = nil
        lastHeadingRadians = nil
        lastHeadingTimestamp = nil
        smoothedDisplayHeadingRadians = nil
        userHeadingRadians = nil
        isUserHeadingReliable = false
    }

    // MARK: - CBCentralManagerDelegate

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        guard trackingMode == .beacon else {
            return
        }

        let value = RSSI.intValue
        if value == 127 || value == 0 {
            return
        }

        let timestamp = Date().timeIntervalSince1970
        let txPowerLevel = (advertisementData[CBAdvertisementDataTxPowerLevelKey] as? NSNumber)?.floatValue
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? "Unknown"
        let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data

        appendDebugLog(
            "BLE Advertisement name=\(name) rssi=\(value) manufacturerBytes=\(manufacturerData?.count ?? 0)",
            key: "ble-advertisement-\(name)",
            minInterval: 4
        )

        if let manufacturerData,
           let storeBeacon = DetectedStoreBeacon(manufacturerData: manufacturerData) {
            appendDebugLog(
                "iBeacon Manufacturer erkannt uuid=\(storeBeacon.uuidLookupKey) major=\(storeBeacon.major) minor=\(storeBeacon.minor) rssi=\(value)",
                key: "ibeacon-\(storeBeacon.uuidLookupKey)",
                minInterval: 2
            )
            handleDetectedStoreBeacon(storeBeacon, rssi: RSSI.intValue)

            if let matchedBeaconName = matchingBeaconName(
                uuid: storeBeacon.uuid,
                major: UInt16(clamping: storeBeacon.major),
                minor: UInt16(clamping: storeBeacon.minor)
            ) {
                recordBeaconSample(
                    name: matchedBeaconName,
                    rssi: value,
                    timestamp: timestamp,
                    txPower: txPowerLevel
                )
                return
            }
            appendDebugLog(
                "iBeacon passt zu keinem Beacon im aktiven Layout uuid=\(storeBeacon.uuidLookupKey) major=\(storeBeacon.major) minor=\(storeBeacon.minor)",
                key: "ibeacon-no-layout-match-\(storeBeacon.uuidLookupKey)",
                minInterval: 5
            )
        } else if let manufacturerData {
            appendDebugLog(
                "ManufacturerData nicht als iBeacon erkannt bytes=\(manufacturerData.count) prefix=\(manufacturerData.prefix(8).map { String(format: "%02X", $0) }.joined())",
                key: "manufacturer-not-ibeacon",
                minInterval: 5
            )
        }

        if name.contains("Indooro") {
            appendDebugLog(
                "Indooro Name-Match ohne/zusatzlich zu iBeacon name=\(name) rssi=\(value)",
                key: "indooro-name-\(name)",
                minInterval: 4
            )
            recordBeaconSample(
                name: name,
                rssi: value,
                timestamp: timestamp,
                txPower: txPowerLevel
            )
        }
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        appendDebugLog("Bluetooth State: \(bluetoothStateDescription(central.state))")
        configureBeaconScanningForCurrentMode()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        appendDebugLog("Location Auth changed: \(locationAuthorizationDescription(manager.authorizationStatus))")
        requestLocationAuthorizationIfNeeded()
        startHeadingUpdatesIfNeeded()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard trackingMode == .beacon else {
            return
        }

        guard newHeading.headingAccuracy >= 0 else {
            latestHeadingAccuracyDegrees = -1
            rawDeviceHeadingRadians = nil
            updateDisplayedUserHeading(
                movementHeading: lastHeadingRadians,
                movementHeadingIsFresh: false
            )
            return
        }

        let headingDegrees = newHeading.trueHeading >= 0
            ? newHeading.trueHeading
            : newHeading.magneticHeading

        latestHeadingAccuracyDegrees = newHeading.headingAccuracy
        rawDeviceHeadingRadians = mapHeadingRadians(from: headingDegrees)

        updateDisplayedUserHeading(
            movementHeading: lastHeadingRadians,
            movementHeadingIsFresh: false
        )
        publishPredictedPose(timestamp: Date().timeIntervalSince1970)
    }

    func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
        guard trackingMode == .beacon else {
            return false
        }

        guard let heading = manager.heading else {
            return true
        }

        return heading.headingAccuracy < 0
            || heading.headingAccuracy > calibrationPromptHeadingAccuracyThreshold
    }

    func locationManager(
        _ manager: CLLocationManager,
        didRange beacons: [CLBeacon],
        satisfying constraint: CLBeaconIdentityConstraint
    ) {
        guard trackingMode == .beacon else {
            return
        }

        appendDebugLog(
            "iBeacon-Ranging Callback count=\(beacons.count)",
            key: "ranging-callback",
            minInterval: 3
        )
        handleRangedIBeacons(beacons, timestamp: Date().timeIntervalSince1970)
    }

    func locationManager(
        _ manager: CLLocationManager,
        didFailRangingFor constraint: CLBeaconIdentityConstraint,
        error: Error
    ) {
        if navigationStatusMessage == nil {
            navigationStatusMessage = "iBeacon-Ranging fehlgeschlagen: \(error.localizedDescription)"
        }
        appendDebugLog("iBeacon-Ranging Fehler: \(error.localizedDescription)")
    }

    private func storeLookupURL(for beacon: DetectedStoreBeacon) -> URL? {
        guard var components = URLComponents(string: "\(apiBase)/mobile/stores/by-beacon") else {
            return nil
        }

        components.queryItems = [
            URLQueryItem(name: "uuid", value: beacon.uuidLookupKey),
            URLQueryItem(name: "major", value: String(beacon.major)),
            URLQueryItem(name: "minor", value: String(beacon.minor))
        ]
        return components.url
    }

    private func recordBeaconSample(name: String, rssi: Int, timestamp: TimeInterval, txPower: Float?) {
        beaconLastSeenAt[name] = timestamp
        if let txPower {
            beaconAdvertisementTxPower[name] = txPower
        }
        if rssiBuffer[name] == nil {
            rssiBuffer[name] = []
        }
        rssiBuffer[name]?.append(rssi)
        if let sampleCount = rssiBuffer[name]?.count, sampleCount > 12 {
            rssiBuffer[name]?.removeFirst(sampleCount - 12)
        }
    }
}

private struct DetectedStoreBeacon {
    let uuid: UUID
    let major: Int
    let minor: Int

    init(rangedBeacon: CLBeacon) {
        uuid = rangedBeacon.uuid
        major = rangedBeacon.major.intValue
        minor = rangedBeacon.minor.intValue
    }

    init?(manufacturerData: Data) {
        let bytes = [UInt8](manufacturerData)
        guard bytes.count >= 25,
              bytes[0] == 0x4C,
              bytes[1] == 0x00,
              bytes[2] == 0x02,
              bytes[3] == 0x15 else {
            return nil
        }

        let uuidBytes = Array(bytes[4...19])
        let uuidString = String(
            format: "%02X%02X%02X%02X-%02X%02X-%02X%02X-%02X%02X-%02X%02X%02X%02X%02X%02X",
            uuidBytes[0], uuidBytes[1], uuidBytes[2], uuidBytes[3],
            uuidBytes[4], uuidBytes[5],
            uuidBytes[6], uuidBytes[7],
            uuidBytes[8], uuidBytes[9],
            uuidBytes[10], uuidBytes[11], uuidBytes[12], uuidBytes[13], uuidBytes[14], uuidBytes[15]
        )

        guard let uuid = UUID(uuidString: uuidString) else {
            return nil
        }

        self.uuid = uuid
        self.major = (Int(bytes[20]) << 8) | Int(bytes[21])
        self.minor = (Int(bytes[22]) << 8) | Int(bytes[23])
    }

    var uuidLookupKey: String {
        uuid.uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }
}
