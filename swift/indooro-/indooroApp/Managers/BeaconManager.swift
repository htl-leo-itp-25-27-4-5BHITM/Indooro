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
    let layoutId: String?
    let source: String?
    let fallback: Bool?
}

private struct DecodedLayoutResponse {
    let layout: LayoutData
    let layoutId: String?
    let source: String?
    let fallback: Bool
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
    @Published private(set) var activeMobileStore: MobileStoreSummary?

    // MARK: - Config

    private let apiBase = IndooroAPI.baseURL
    private let allowServerSearch = true
    private let layoutHistoryLimit = 12
    private let selectedLayoutModeDefaultsKey = "selectedLayoutMode"
    private let selectedLayoutIdDefaultsKey = "selectedLayoutId"
    private let fixedTargetCategory: String? = nil
    private let defaultIBeaconUUID = UUID(uuidString: "00000000-0000-0000-0000-000000000000")
    private let preferIBeaconRanging = true
    private var latestSearchRequestID = UUID()

    private let defaultTxPower = -59.0
    private var pathLossExp: Double { Double(navigationConfig.beacon.pathLossExponent) }

    // MARK: - Bluetooth internals

    private var centralManager: CBCentralManager?
    private var isScanningBeacons = false
    private var rssiBuffer: [String: [Int]] = [:]
    private var beaconLastSeenAt: [String: TimeInterval] = [:]
    private var beaconMeasurementQuality: [String: Float] = [:]
    private var beaconAdvertisementTxPower: [String: Float] = [:]
    private var kalmanFilters: [String: KalmanFilter] = [:]
    private var updateTimer: Timer?
    private let startTime = Date()
    private let locationManager = CLLocationManager()
    private var rangingConstraints: [CLBeaconIdentityConstraint] = []
    private var isRangingIBeacons = false
    private var lastIBeaconRangingUpdateAt: TimeInterval?
    private var pendingStoreLookupIdentity: String?
    private var lastResolvedStoreLookupIdentity: String?
    private var lastStoreLookupAttemptAt: TimeInterval = 0
    private let storeLookupCooldownSeconds: TimeInterval = 10

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
    private var manualCalibrationRevision: Int = 0
    private var isUpdatingHeading = false
    private var latestHeadingAccuracyDegrees: CLLocationDirection = -1
    private let reliableHeadingAccuracyThreshold: CLLocationDirection = 25
    private let calibrationPromptHeadingAccuracyThreshold: CLLocationDirection = 20

    private var mapBounds: CGRect {
        CGRect(x: 0, y: 0, width: gridWidth, height: gridHeight)
    }

    // MARK: - Lifecycle

    override init() {
        super.init()
        loadBundleLayoutFallback()
        startMotionUpdates()

        locationManager.delegate = self
        locationManager.pausesLocationUpdatesAutomatically = true
        requestLocationAuthorizationIfNeeded()

        centralManager = CBCentralManager(delegate: self, queue: nil)
        startUpdateTimer()
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
        activeMobileStore = nil
        persistLayoutSelection()
        loadCurrentServerLayout()
    }

    func loadStoreLayout(for store: MobileStoreSummary, source: StoreLayoutSelectionSource) {
        guard let url = mobileStoreLayoutURL(storeId: store.id) else {
            loadBundleLayoutFallback(reason: "Store-Layout-URL ungueltig")
            return
        }

        isLoadingLayout = true
        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }

                switch result {
                case .success(let data):
                    do {
                        let decoded = try self.decodeLayoutResponse(from: data)
                        let layout = decoded.layout
                        self.applyLayout(layout)
                        self.selectedLayoutMode = .currentServer
                        self.selectedLayoutId = nil
                        self.selectedLayoutName = store.name
                        self.activeMobileStore = store
                        self.activeLayoutDescription = self.storeLayoutDescription(
                            for: store,
                            source: source,
                            layout: layout,
                            response: decoded
                        )
                        self.isLoadingLayout = false

                        if source == .beacon {
                            self.persistLayoutSelection()
                        }
                    } catch {
                        print("❌ Store-Layout konnte nicht decodiert werden: \(error.localizedDescription)")
                        self.loadLatestHistoryVersionFallback(reason: "Store-Layout nicht lesbar")
                    }
                case .failure(let error):
                    print("❌ Store-Layout konnte nicht geladen werden: \(error.localizedDescription)")
                    self.loadLatestHistoryVersionFallback(reason: "Store-Layout nicht erreichbar")
                }
            }
        }
    }

    func selectLayoutVersion(_ layoutId: String) {
        selectedLayoutMode = .version
        selectedLayoutId = layoutId
        selectedLayoutName = layoutHistory.first(where: { $0.layoutId == layoutId })?.displayName
            ?? "Version \(layoutId.prefix(8))"
        activeMobileStore = nil
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

        guard var components = URLComponents(string: "\(apiBase)/products/search") else {
            isSearching = false
            return
        }
        var queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "size", value: "50")
        ]
        if let activeMobileStore {
            queryItems.append(URLQueryItem(name: "storeId", value: activeMobileStore.id))
        }
        components.queryItems = queryItems

        guard let url = components.url else {
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

        if preferIBeaconRanging,
           let lastIBeaconRangingUpdateAt,
           (timestamp - lastIBeaconRangingUpdateAt) <= navigationConfig.beacon.staleMeasurementSeconds {
            clearStaleBeaconMeasurements(at: timestamp)
            return
        }

        if preferIBeaconRanging && isRangingIBeacons {
            startBeaconScan()
        }

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

        DispatchQueue.main.async {
            self.userPosition = CGPoint(matched.snappedPosition)
            self.setNavigationRouteIfNeeded(NavigationRoute(points: routeUpdate.routePolyline))
        }
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

        DispatchQueue.main.async {
            self.userPosition = CGPoint(displayPoint)
            if self.rawUserPosition == nil {
                self.rawUserPosition = CGPoint(predictedPose.mapPoint)
            }
        }
    }

    private func handleRangedIBeacons(_ rangedBeacons: [CLBeacon], timestamp: TimeInterval) {
        lastIBeaconRangingUpdateAt = timestamp
        stopBeaconScan()

        var matchedNames: Set<String> = []
        var attemptedStoreLookup = false

        for rangedBeacon in rangedBeacons {
            if !attemptedStoreLookup {
                maybeResolveStore(for: rangedBeacon, timestamp: timestamp)
                attemptedStoreLookup = true
            }

            guard let beaconName = matchingBeaconName(for: rangedBeacon) else {
                continue
            }

            let accuracy = rangedBeacon.accuracy
            let clampedDistance = accuracy.isFinite && accuracy > 0
                ? min(
                    Double(navigationConfig.beacon.maxDistanceMeters),
                    max(Double(navigationConfig.beacon.minDistanceMeters), accuracy)
                )
                : 0
            let quality = iBeaconQuality(for: rangedBeacon)
            beaconMeasurementQuality[beaconName] = quality
            beaconLastSeenAt[beaconName] = timestamp

            updateBeaconUI(
                name: beaconName,
                rssi: rangedBeacon.rssi,
                distance: clampedDistance,
                timestamp: accuracy > 0 ? timestamp : nil,
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
        if let explicitMatch = beacons.first(where: { beacon in
            beacon.beaconUUID == rangedBeacon.uuid
                && beacon.beaconMajor == rangedBeacon.major.uint16Value
                && beacon.beaconMinor == rangedBeacon.minor.uint16Value
        }) {
            return explicitMatch.name
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

    private func iBeaconQuality(for rangedBeacon: CLBeacon) -> Float {
        let rssi = rangedBeacon.rssi
        guard rssi < 0 else {
            return 0.1
        }

        let signalScore = clamp((Float(rssi) + 95) / 40.0, min: 0.05, max: 1)
        let distanceScore = clamp(1 - Float(max(0, rangedBeacon.accuracy)) / 10.0, min: 0.05, max: 1)
        let proximityScore: Float
        switch rangedBeacon.proximity {
        case .immediate:
            proximityScore = 1
        case .near:
            proximityScore = 0.8
        case .far:
            proximityScore = 0.45
        case .unknown:
            proximityScore = 0.15
        @unknown default:
            proximityScore = 0.2
        }

        return clamp(
            0.42 * signalScore + 0.38 * distanceScore + 0.20 * proximityScore,
            min: 0,
            max: 1
        )
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
            activeMobileStore = nil
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
        guard let url = currentLayoutURL() else {
            loadBundleLayoutFallback(reason: "Server-URL ungueltig")
            return
        }

        isLoadingLayout = true
        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }

                switch result {
                case .success(let data):
                    do {
                        let layout = try self.decodeLayout(from: data)
                        self.applyLayout(layout)
                        self.selectedLayoutMode = .currentServer
                        self.selectedLayoutId = nil
                        self.selectedLayoutName = "Aktuelles Server-Layout"
                        self.activeMobileStore = nil
                        self.activeLayoutDescription = self.currentLayoutDescription(for: layout)
                        self.isLoadingLayout = false
                        self.persistLayoutSelection()
                    } catch {
                        print("❌ Aktuelles Server-Layout konnte nicht decodiert werden: \(error.localizedDescription)")
                        self.loadLatestHistoryVersionFallback(reason: "Server-Layout nicht lesbar")
                    }
                case .failure(let error):
                    print("❌ Aktuelles Server-Layout konnte nicht geladen werden: \(error.localizedDescription)")
                    self.loadLatestHistoryVersionFallback(reason: "Server momentan nicht erreichbar")
                }
            }
        }
    }

    private func loadLayoutVersion(withId layoutId: String) {
        guard let url = layoutVersionURL(layoutId: layoutId) else {
            fallbackFromMissingVersion(withMessage: "Versions-URL ungueltig")
            return
        }

        isLoadingLayout = true
        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }

                switch result {
                case .success(let data):
                    do {
                        let layout = try self.decodeLayout(from: data)
                        self.applyLayout(layout)
                        self.selectedLayoutMode = .version
                        self.selectedLayoutId = layoutId
                        self.selectedLayoutName = self.layoutHistory.first(where: { $0.layoutId == layoutId })?.displayName
                            ?? self.fallbackVersionName(for: layout, layoutId: layoutId)
                        self.activeMobileStore = nil
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
        activeMobileStore = nil
        persistLayoutSelection()
        loadCurrentServerLayout()

        if activeLayoutDescription.contains("Bundle-Layout") {
            activeLayoutDescription = bundleLayoutDescription(reason: message)
        }
    }

    private func loadBundleLayoutFallback(reason: String? = nil) {
        guard let layout = loadLayoutFromJSON() else {
            isLoadingLayout = false
            activeLayoutDescription = "Kein Bundle-Layout verfuegbar"
            return
        }

        applyLayout(layout)
        activeLayoutDescription = bundleLayoutDescription(reason: reason)
        isLoadingLayout = false
    }

    private func loadLatestHistoryVersionFallback(reason: String) {
        guard let url = layoutHistoryURL(limit: 1) else {
            loadBundleLayoutFallback(reason: reason)
            return
        }

        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }

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
        syncKalmanFiltersWithBeacons()
        clearBeaconMeasurements()
        rssiBuffer.removeAll()
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
                ?? KalmanFilter(processNoise: 0.05, measurementNoise: 2.0)
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

        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }

                switch result {
                case .success(let data):
                    do {
                        let layout = try self.decodeLayout(from: data)
                        self.applyLayout(layout)
                        self.selectedLayoutMode = .currentServer
                        self.selectedLayoutId = nil
                        self.selectedLayoutName = "Aktuelles Server-Layout"
                        self.activeMobileStore = nil
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

    private func performRequest(url: URL, completion: @escaping (Result<Data, Error>) -> Void) {
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let response = response as? HTTPURLResponse else {
                completion(.failure(LayoutLoadingError.invalidResponse))
                return
            }

            guard (200...299).contains(response.statusCode) else {
                completion(.failure(LayoutLoadingError.httpStatus(response.statusCode)))
                return
            }

            guard let data else {
                completion(.failure(LayoutLoadingError.emptyData))
                return
            }

            completion(.success(data))
        }.resume()
    }

    private func decodeLayout(from data: Data) throws -> LayoutData {
        try decodeLayoutResponse(from: data).layout
    }

    private func decodeLayoutResponse(from data: Data) throws -> DecodedLayoutResponse {
        let decoder = JSONDecoder()

        if let layout = try? decoder.decode(LayoutData.self, from: data) {
            return DecodedLayoutResponse(layout: layout, layoutId: nil, source: nil, fallback: false)
        }

        if let envelope = try? decoder.decode(LayoutEnvelope.self, from: data),
           let layout = envelope.layout ?? envelope.data ?? envelope.current ?? envelope.version {
            return DecodedLayoutResponse(
                layout: layout,
                layoutId: envelope.layoutId,
                source: envelope.source,
                fallback: envelope.fallback ?? (envelope.layoutId == nil)
            )
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

    private func mobileStoreLayoutURL(storeId: String) -> URL? {
        let encodedStoreId = storeId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? storeId
        return URL(string: "\(apiBase)/mobile/stores/\(encodedStoreId)/layout/current")
    }

    private func storeByBeaconURL(uuid: UUID, major: Int, minor: Int) -> URL? {
        guard var components = URLComponents(string: "\(apiBase)/mobile/stores/by-beacon") else {
            return nil
        }
        components.queryItems = [
            URLQueryItem(name: "uuid", value: uuid.uuidString),
            URLQueryItem(name: "major", value: String(major)),
            URLQueryItem(name: "minor", value: String(minor))
        ]
        return components.url
    }

    private func maybeResolveStore(for rangedBeacon: CLBeacon, timestamp: TimeInterval) {
        let major = rangedBeacon.major.intValue
        let minor = rangedBeacon.minor.intValue
        let identityKey = "\(rangedBeacon.uuid.uuidString.lowercased()):\(major):\(minor)"

        if pendingStoreLookupIdentity == identityKey {
            return
        }
        if lastResolvedStoreLookupIdentity == identityKey && activeMobileStore != nil {
            return
        }
        if timestamp - lastStoreLookupAttemptAt < storeLookupCooldownSeconds {
            return
        }
        guard let url = storeByBeaconURL(uuid: rangedBeacon.uuid, major: major, minor: minor) else {
            return
        }

        pendingStoreLookupIdentity = identityKey
        lastStoreLookupAttemptAt = timestamp

        performRequest(url: url) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }

                if self.pendingStoreLookupIdentity == identityKey {
                    self.pendingStoreLookupIdentity = nil
                }

                switch result {
                case .success(let data):
                    do {
                        let response = try JSONDecoder().decode(StoreByBeaconResponse.self, from: data)
                        self.lastResolvedStoreLookupIdentity = identityKey
                        if self.activeMobileStore?.id != response.store.id {
                            self.loadStoreLayout(for: response.store, source: .beacon)
                        }
                    } catch {
                        print("❌ Beacon-Store konnte nicht decodiert werden: \(error.localizedDescription)")
                    }
                case .failure(let error):
                    print("❌ Beacon-Store konnte nicht geladen werden: \(error.localizedDescription)")
                }
            }
        }
    }

    private func currentLayoutDescription(for layout: LayoutData) -> String {
        var parts = [layout.shopName, "Live aus LeoCloud"]
        if let timestamp = LayoutTimestampFormatter.display(layout.savedAt ?? layout.exportDate) {
            parts.append(timestamp)
        }
        return parts.joined(separator: " • ")
    }

    private func storeLayoutDescription(
        for store: MobileStoreSummary,
        source: StoreLayoutSelectionSource,
        layout: LayoutData,
        response: DecodedLayoutResponse
    ) -> String {
        let sourceLabel = source == .beacon ? "Beacon Store" : "Manuell gewaehlt"
        let layoutLabel = response.fallback ? "Fallback-Layout" : sourceLabel
        var parts = [store.name, layoutLabel]
        if response.fallback, let responseSource = response.source, !responseSource.isEmpty {
            parts.append(responseSource)
        }
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
        if let beaconUUID = element.beaconUUID, let parsed = UUID(uuidString: beaconUUID) {
            return parsed
        }

        return defaultIBeaconUUID
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

        let keys = Set(
            beacons.compactMap { beacon -> ConstraintKey? in
                guard let uuid = beacon.beaconUUID else {
                    return nil
                }
                return ConstraintKey(uuid: uuid, major: beacon.beaconMajor)
            }
        )

        return keys
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
            return
        }

        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            configureBeaconScanningForCurrentMode()
            startHeadingUpdatesIfNeeded()
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .restricted, .denied:
            navigationStatusMessage = "Bitte Standortfreigabe erlauben, damit iBeacon-Ranging funktioniert."
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
            stopIBeaconRanging()
            return
        }

        startIBeaconRanging()
    }

    private func startIBeaconRanging() {
        guard !isRangingIBeacons else {
            return
        }

        for constraint in rangingConstraints {
            locationManager.startRangingBeacons(satisfying: constraint)
        }
        isRangingIBeacons = true
    }

    private func stopIBeaconRanging() {
        guard isRangingIBeacons else {
            return
        }

        for constraint in rangingConstraints {
            locationManager.stopRangingBeacons(satisfying: constraint)
        }
        isRangingIBeacons = false
        lastIBeaconRangingUpdateAt = nil
    }

    private func configureBeaconScanningForCurrentMode() {
        configureIBeaconRangingForCurrentMode()
        startHeadingUpdatesIfNeeded()

        guard let centralManager else {
            return
        }
        guard centralManager.state == .poweredOn else {
            stopBeaconScan()
            return
        }

        switch trackingMode {
        case .beacon:
            if preferIBeaconRanging && isRangingIBeacons {
                stopBeaconScan()
            } else {
                startBeaconScan()
            }
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
    }

    private func stopBeaconScan() {
        guard isScanningBeacons else {
            return
        }
        centralManager?.stopScan()
        isScanningBeacons = false
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

        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? "Unknown"
        if name.contains("Indooro") {
            let value = RSSI.intValue
            if value == 127 || value == 0 {
                return
            }
            beaconLastSeenAt[name] = Date().timeIntervalSince1970
            if let txPower = advertisementData[CBAdvertisementDataTxPowerLevelKey] as? NSNumber {
                beaconAdvertisementTxPower[name] = txPower.floatValue
            }
            if rssiBuffer[name] == nil {
                rssiBuffer[name] = []
            }
            rssiBuffer[name]?.append(value)
            if let sampleCount = rssiBuffer[name]?.count, sampleCount > 12 {
                rssiBuffer[name]?.removeFirst(sampleCount - 12)
            }
        }
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        configureBeaconScanningForCurrentMode()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
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
    }
}
