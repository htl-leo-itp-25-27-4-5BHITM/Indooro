import IndooroModels
import SwiftUI

struct MapView: View {
    @ObservedObject var beaconManager: BeaconManager
    @ObservedObject var navigationSession: NavigationSession
    let pixelsPerMeter: Double
    @Binding var mapScale: Double
    /// One-shot-Modus „Ich bin hier“: der naechste Tap setzt die Position und beendet den Modus.
    @Binding var nextTapSetsPosition: Bool
    let targetProduct: Product?
    let shoppingStops: [ShoppingStop]
    let activeShoppingStopID: String?
    let showsShoppingSession: Bool
    let topInset: CGFloat
    let bottomInset: CGFloat
    let showsDebugMapElements: Bool
    /// VoiceOver-Zusammenfassung der Karte (Ziel, Entfernung, Route, Positionsqualität).
    let accessibilitySummary: String

    #if DEBUG
    /// Waehrend eines langen Drucks (Wahrheitsmarkierung) wird der folgende Tap ignoriert.
    @State private var truthPressActive = false
    #endif

    private let routeAccent = Color(red: 0.15, green: 0.57, blue: 0.88)
    private let minimumMapScale: CGFloat = 0.65
    private let maximumMapScale: CGFloat = 2.5

    var body: some View {
        GeometryReader { geometry in
            let displayUserPosition = beaconManager.userPosition ?? beaconManager.rawUserPosition
            let visibleHeight = max(0, geometry.size.height - topInset - bottomInset)
            let mapPadding = EdgeInsets(top: 12, leading: 22, bottom: 18, trailing: 22)
            let requestedMapWidth = max(1, CGFloat(beaconManager.gridWidth * pixelsPerMeter))
            let requestedMapHeight = max(1, CGFloat(beaconManager.gridHeight * pixelsPerMeter))
            let maxMapWidth = max(80, geometry.size.width - mapPadding.leading - mapPadding.trailing)
            let maxMapHeight = max(80, visibleHeight - mapPadding.top - mapPadding.bottom)
            let widthScale = maxMapWidth / requestedMapWidth
            let heightScale = maxMapHeight / requestedMapHeight
            let fitScale = min(1.0, min(widthScale, heightScale))
            let fittedPixelsPerMeter = pixelsPerMeter * Double(fitScale)
            let mapWidth = CGFloat(beaconManager.gridWidth * fittedPixelsPerMeter)
            let mapHeight = CGFloat(beaconManager.gridHeight * fittedPixelsPerMeter)
            let routePoints = navigationSession.remainingRoute.cgPoints.map {
                CGPoint(x: $0.x * fittedPixelsPerMeter, y: $0.y * fittedPixelsPerMeter)
            }
            let allowsManualMapTap = showsDebugMapElements || !beaconManager.tapSetsTarget || nextTapSetsPosition

            VStack(spacing: 0) {
                Color.clear
                    .frame(height: topInset)

                ZoomableMapScrollView(
                    contentSize: CGSize(width: mapWidth, height: mapHeight),
                    zoomScale: $mapScale,
                    minimumZoomScale: minimumMapScale,
                    maximumZoomScale: maximumMapScale
                ) {
                    ZStack(alignment: .topLeading) {
                        ZStack(alignment: .topLeading) {
                            StoreMapCanvas(width: mapWidth, height: mapHeight)

                            GridLines(
                                step: fittedPixelsPerMeter,
                                width: mapWidth,
                                height: mapHeight,
                                gridCountX: Int(beaconManager.gridWidth),
                                gridCountY: Int(beaconManager.gridHeight),
                                showsDebugStyle: showsDebugMapElements
                            )

                            if !routePoints.isEmpty {
                                RouteLineView(points: routePoints, accent: routeAccent)
                                    .zIndex(80)
                            }

                            // QR-Anker sind keine Regale und werden nicht als solche gezeichnet.
                            ForEach(beaconManager.shelves.filter { !$0.isAnchor }) { element in
                                ShelfView(element: element, pixelsPerMeter: fittedPixelsPerMeter)
                            }

                            if !showsShoppingSession, let targetPosition = navigationSession.targetPosition {
                                TargetMapMarker()
                                    .position(
                                        x: CGFloat(targetPosition.x * fittedPixelsPerMeter),
                                        y: CGFloat(targetPosition.y * fittedPixelsPerMeter)
                                    )
                                    .zIndex(110)
                            }

                            if !shoppingStops.isEmpty {
                                ForEach(Array(shoppingStops.enumerated()), id: \.element.id) { index, stop in
                                    ShoppingStopMarker(
                                        index: index + 1,
                                        isActive: stop.id == activeShoppingStopID
                                    )
                                    .position(
                                        x: CGFloat(stop.mapPoint.x * fittedPixelsPerMeter),
                                        y: CGFloat(stop.mapPoint.y * fittedPixelsPerMeter)
                                    )
                                    .zIndex(stop.id == activeShoppingStopID ? 120 : 96)
                                }
                            }

                            if showsDebugMapElements {
                                MapAxes(
                                    pixelsPerMeter: fittedPixelsPerMeter,
                                    gridWidth: Int(beaconManager.gridWidth),
                                    gridHeight: Int(beaconManager.gridHeight)
                                )

                                ForEach(beaconManager.beacons) { beacon in
                                    BeaconMapItem(beacon: beacon, pixelsPerMeter: fittedPixelsPerMeter)
                                        .position(
                                            x: CGFloat(beacon.positionX * fittedPixelsPerMeter),
                                            y: CGFloat(beacon.positionY * fittedPixelsPerMeter)
                                        )
                                }

                                ForEach(beaconManager.shelves.filter(\.isAnchor)) { anchor in
                                    Label(anchor.anchorId ?? "?", systemImage: "qrcode")
                                        .font(.caption2.weight(.bold))
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 3)
                                        .background(.thinMaterial, in: Capsule())
                                        .position(
                                            x: CGFloat((anchor.x + (anchor.width ?? 1) / 2) * fittedPixelsPerMeter),
                                            y: CGFloat((anchor.y + (anchor.height ?? 1) / 2) * fittedPixelsPerMeter)
                                        )
                                }
                            }

                            if let position = displayUserPosition {
                                UserLocationMarker(
                                    headingRadians: beaconManager.userHeadingRadians,
                                    isReliable: beaconManager.isUserHeadingReliable,
                                    isTrusted: beaconManager.isPositionTrusted,
                                    pixelsPerMeter: fittedPixelsPerMeter
                                )
                                .position(
                                    x: CGFloat(position.x * fittedPixelsPerMeter),
                                    y: CGFloat(position.y * fittedPixelsPerMeter)
                                )
                                .zIndex(130)
                                .animation(.linear(duration: StabilizedNavigationConfig.default.beacon.updateIntervalSeconds), value: position)
                                .animation(.easeInOut(duration: 0.16), value: beaconManager.userHeadingRadians)
                            }

                            if allowsManualMapTap {
                                Color.white.opacity(0.001)
                                    .frame(width: mapWidth, height: mapHeight)
                                    .contentShape(Rectangle())
                                    .onTapGesture { location in
                                        #if DEBUG
                                        if truthPressActive { return }
                                        #endif
                                        let xMeter = Double(location.x) / fittedPixelsPerMeter
                                        let yMeter = Double(location.y) / fittedPixelsPerMeter
                                        let point = CGPoint(x: xMeter, y: yMeter)
                                        if nextTapSetsPosition {
                                            beaconManager.setManualUserPosition(point)
                                            nextTapSetsPosition = false
                                        } else if beaconManager.tapSetsTarget {
                                            navigationSession.setSingleTarget(point)
                                        } else {
                                            beaconManager.setManualUserPosition(point)
                                        }
                                    }
                                    #if DEBUG
                                    .simultaneousGesture(
                                        LongPressGesture(minimumDuration: 0.6)
                                            .sequenced(before: DragGesture(minimumDistance: 0))
                                            .onChanged { value in
                                                guard !truthPressActive,
                                                      case .second(true, let drag?) = value else { return }
                                                truthPressActive = true
                                                NavigationRecorder.shared.recordTruth(
                                                    x: Float(drag.location.x / fittedPixelsPerMeter),
                                                    y: Float(drag.location.y / fittedPixelsPerMeter)
                                                )
                                            }
                                            .onEnded { _ in
                                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                                                    truthPressActive = false
                                                }
                                            }
                                    )
                                    #endif
                            }
                        }
                        .accessibilityHidden(true)

                        // VoiceOver: eine Zusammenfassung statt aller Kartenelemente (Regale, Marker, Achsen).
                        Color.clear
                            .frame(width: mapWidth, height: mapHeight)
                            .allowsHitTesting(false)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(accessibilitySummary)
                            .accessibilityIdentifier("mapSummary")
                    }
                    .frame(width: mapWidth, height: mapHeight)
                    .overlay(alignment: .topTrailing) {
                        if allowsManualMapTap {
                            MapCanvasStatusBadge(
                                title: nextTapSetsPosition
                                    ? "Tippe auf deinen Standort"
                                    : (beaconManager.tapSetsTarget ? "Tippen setzt Ziel" : "Tippen setzt Position"),
                                systemImage: "hand.tap",
                                tint: Color.a11yWarningText
                            )
                            .padding(12)
                        }
                    }
                }
                .padding(mapPadding)
                .frame(maxWidth: .infinity, maxHeight: visibleHeight, alignment: .center)
                .accessibilityIdentifier("storeMap")

                Color.clear
                    .frame(height: bottomInset)
            }
        }
    }
}

private struct ZoomableMapScrollView<Content: View>: UIViewRepresentable {
    let contentSize: CGSize
    @Binding var zoomScale: Double
    let minimumZoomScale: CGFloat
    let maximumZoomScale: CGFloat
    let content: Content

    init(
        contentSize: CGSize,
        zoomScale: Binding<Double>,
        minimumZoomScale: CGFloat,
        maximumZoomScale: CGFloat,
        @ViewBuilder content: () -> Content
    ) {
        self.contentSize = contentSize
        _zoomScale = zoomScale
        self.minimumZoomScale = minimumZoomScale
        self.maximumZoomScale = maximumZoomScale
        self.content = content()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(zoomScale: $zoomScale)
    }

    func makeUIView(context: Context) -> UIScrollView {
        let scrollView = UIScrollView()
        scrollView.delegate = context.coordinator
        scrollView.backgroundColor = .clear
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.showsVerticalScrollIndicator = false
        scrollView.contentInsetAdjustmentBehavior = .never
        scrollView.bouncesZoom = true
        scrollView.alwaysBounceHorizontal = false
        scrollView.alwaysBounceVertical = false
        scrollView.delaysContentTouches = false
        scrollView.minimumZoomScale = minimumZoomScale
        scrollView.maximumZoomScale = maximumZoomScale

        let hostingController = UIHostingController(rootView: content)
        hostingController.view.backgroundColor = .clear
        hostingController.view.frame = CGRect(origin: .zero, size: contentSize)
        scrollView.addSubview(hostingController.view)
        scrollView.contentSize = contentSize

        context.coordinator.hostingController = hostingController
        context.coordinator.contentSize = contentSize
        scrollView.setZoomScale(clampedZoomScale, animated: false)
        context.coordinator.centerContent(in: scrollView)

        return scrollView
    }

    func updateUIView(_ scrollView: UIScrollView, context: Context) {
        context.coordinator.zoomScale = $zoomScale

        scrollView.minimumZoomScale = minimumZoomScale
        scrollView.maximumZoomScale = maximumZoomScale

        if !scrollView.isZooming && !scrollView.isDragging && !scrollView.isDecelerating {
            context.coordinator.hostingController?.rootView = content

            if context.coordinator.contentSize != contentSize {
                context.coordinator.hostingController?.view.frame = CGRect(origin: .zero, size: contentSize)
                scrollView.contentSize = contentSize
                context.coordinator.contentSize = contentSize
            }
        }

        let targetZoomScale = clampedZoomScale
        if abs(scrollView.zoomScale - targetZoomScale) > 0.001, !scrollView.isZooming {
            scrollView.setZoomScale(targetZoomScale, animated: false)
        }

        context.coordinator.centerContent(in: scrollView)
    }

    private var clampedZoomScale: CGFloat {
        min(maximumZoomScale, max(minimumZoomScale, CGFloat(zoomScale)))
    }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        var zoomScale: Binding<Double>
        var hostingController: UIHostingController<Content>?
        var contentSize: CGSize = .zero

        init(zoomScale: Binding<Double>) {
            self.zoomScale = zoomScale
        }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? {
            hostingController?.view
        }

        func scrollViewDidZoom(_ scrollView: UIScrollView) {
            centerContent(in: scrollView)
        }

        func scrollViewDidEndZooming(_ scrollView: UIScrollView, with view: UIView?, atScale scale: CGFloat) {
            zoomScale.wrappedValue = Double(scale)
            centerContent(in: scrollView)
        }

        func centerContent(in scrollView: UIScrollView) {
            guard let hostedView = hostingController?.view else { return }

            let horizontalInset = max(0, (scrollView.bounds.width - hostedView.frame.width) / 2)
            let verticalInset = max(0, (scrollView.bounds.height - hostedView.frame.height) / 2)
            scrollView.contentInset = UIEdgeInsets(
                top: verticalInset,
                left: horizontalInset,
                bottom: verticalInset,
                right: horizontalInset
            )
        }
    }
}

private struct StoreMapCanvas: View {
    let width: CGFloat
    let height: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: 34, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [
                        Color(uiColor: .systemBackground),
                        Color(uiColor: .systemGroupedBackground).opacity(0.70),
                        Color(uiColor: .systemBackground)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: width, height: height)
            .overlay(
                RoundedRectangle(cornerRadius: 34, style: .continuous)
                    .stroke(Color.primary.opacity(0.045), lineWidth: 1)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 34, style: .continuous)
                    .stroke(Color(uiColor: .systemBackground).opacity(0.72), lineWidth: 1)
                    .padding(4)
            )
            .shadow(color: .black.opacity(0.07), radius: 20, y: 10)
    }
}

private struct RouteLineView: View {
    let points: [CGPoint]
    let accent: Color

    var body: some View {
        let path = smoothPath(points)

        ZStack {
            path
                .stroke(accent.opacity(0.18), style: StrokeStyle(lineWidth: 15, lineCap: .round, lineJoin: .round))

            path
                .stroke(
                    LinearGradient(
                        colors: [accent, accent.opacity(0.72)],
                        startPoint: .leading,
                        endPoint: .trailing
                    ),
                    style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round)
                )

            path
                .stroke(Color.white.opacity(0.58), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: [1, 15]))

            if let first = points.first {
                Circle()
                    .fill(.white)
                    .frame(width: 20, height: 20)
                    .overlay(Circle().stroke(accent.opacity(0.30), lineWidth: 6))
                    .position(first)
            }

            if let last = points.last {
                Circle()
                    .fill(accent)
                    .frame(width: 14, height: 14)
                    .overlay(Circle().stroke(.white, lineWidth: 3))
                    .shadow(color: accent.opacity(0.25), radius: 8, y: 4)
                    .position(last)
            }
        }
    }

    private func smoothPath(_ points: [CGPoint]) -> Path {
        var path = Path()
        guard let first = points.first else { return path }

        path.move(to: first)

        guard points.count > 1 else { return path }
        guard points.count > 2 else {
            path.addLine(to: points[1])
            return path
        }

        for index in 1..<points.count {
            let previousPoint = points[index - 1]
            let currentPoint = points[index]
            let midpoint = CGPoint(
                x: (previousPoint.x + currentPoint.x) / 2,
                y: (previousPoint.y + currentPoint.y) / 2
            )

            if index == 1 {
                path.addLine(to: midpoint)
            } else {
                path.addQuadCurve(to: midpoint, control: previousPoint)
            }
        }

        if let last = points.last {
            path.addLine(to: last)
        }

        return path
    }
}

private struct MapCanvasStatusBadge: View {
    let title: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
            Text(title)
                .font(.caption.weight(.semibold))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(uiColor: .systemBackground).opacity(0.92), in: Capsule())
        .overlay(
            Capsule()
                .stroke(tint.opacity(0.16), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.05), radius: 10, y: 5)
    }
}
