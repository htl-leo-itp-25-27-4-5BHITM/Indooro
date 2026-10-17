import SwiftUI
import simd

struct ARRouteContainerView: View {
    @ObservedObject var beaconManager: BeaconManager
    @ObservedObject var navigationSession: NavigationSession
    // TODO: Übergib hier ein echtes Alignment aus QR/Beacon/Manual-Align statt nil.
    let manualAlignment: ARMapAlignment?

    @Environment(\.dismiss) private var dismiss
    @StateObject private var hudModel = ARNavigationHUDModel()

    init(beaconManager: BeaconManager, navigationSession: NavigationSession, manualAlignment: ARMapAlignment? = nil) {
        self.beaconManager = beaconManager
        self.navigationSession = navigationSession
        self.manualAlignment = manualAlignment
    }

    var body: some View {
        ZStack(alignment: .top) {
            ARRouteViewRepresentable(
                route: navigationSession.navigationRoute,
                userPosition: beaconManager.userPosition,
                isLowConfidence: navigationSession.isLowConfidence,
                manualCalibrationEvent: beaconManager.manualCalibrationEvent,
                hudModel: hudModel,
                manualAlignment: manualAlignment
            )
            .ignoresSafeArea()

            VStack(spacing: 10) {
                HStack {
                    Button("Schließen") {
                        dismiss()
                    }
                    .font(.headline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())

                    Spacer()
                }

                if let trackingMessage = hudModel.trackingMessage {
                    Text(trackingMessage)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(hudModel.dimOverlay ? Color.orange.opacity(0.85) : Color.black.opacity(0.55))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }

                if let nextTurn = hudModel.nextTurnDistanceText {
                    Text(nextTurn)
                        .font(.headline)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Color.blue.opacity(0.75))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if let routeDebug = hudModel.routeDebugText {
                    Text(routeDebug)
                        .font(.caption2.monospaced())
                        .foregroundStyle(.white.opacity(0.92))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.black.opacity(0.45))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }

                if beaconManager.userPosition != nil {
                    Button("AR neu ausrichten") {
                        beaconManager.calibrateAtCurrentEstimate()
                    }
                    .font(.headline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        navigationSession.isLowConfidence
                            ? Color.orange.opacity(0.9)
                            : Color.blue.opacity(0.88)
                    )
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                Spacer()
            }
            .padding(.top, 16)
            .padding(.horizontal, 16)
        }
    }
}

struct ARRouteViewRepresentable: UIViewControllerRepresentable {
    let route: NavigationRoute
    let userPosition: CGPoint?
    let isLowConfidence: Bool
    let manualCalibrationEvent: ManualCalibrationEvent?
    @ObservedObject var hudModel: ARNavigationHUDModel
    let manualAlignment: ARMapAlignment?

    func makeUIViewController(context: Context) -> ARNavViewController {
        let controller = ARNavViewController(hudModel: hudModel, manualAlignment: manualAlignment)
        controller.updateRoute(
            route: route,
            userMapPoint: userPosition.map(SIMD2<Float>.init)
        )
        controller.updateExternalLowConfidence(isLowConfidence)
        if let manualCalibrationEvent {
            controller.applyManualCalibrationIfNeeded(
                revision: manualCalibrationEvent.revision,
                mapPoint: SIMD2<Float>(manualCalibrationEvent.mapPoint)
            )
        }
        return controller
    }

    func updateUIViewController(_ uiViewController: ARNavViewController, context: Context) {
        uiViewController.setManualAlignment(manualAlignment)
        uiViewController.updateExternalLowConfidence(isLowConfidence)
        uiViewController.updateRoute(
            route: route,
            userMapPoint: userPosition.map(SIMD2<Float>.init)
        )
        if let manualCalibrationEvent {
            uiViewController.applyManualCalibrationIfNeeded(
                revision: manualCalibrationEvent.revision,
                mapPoint: SIMD2<Float>(manualCalibrationEvent.mapPoint)
            )
        }
    }
}
