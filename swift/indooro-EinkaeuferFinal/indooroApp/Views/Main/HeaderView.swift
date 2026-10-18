import IndooroModels
import SwiftUI

struct HeaderView: View {
    let userPosition: CGPoint?
    let targetProduct: Product?
    let trackingMode: TrackingMode
    let selectedLayoutName: String
    let selectedShoppingListName: String?
    let selectedShoppingListOpenCount: Int
    let activeLayoutDescription: String
    let isLoadingLayout: Bool
    let navigationStatusMessage: String?
    let isLowConfidence: Bool
    let shoppingSessionBanner: ShoppingSessionBanner?
    let onCalibrate: () -> Void
    let onClearTarget: () -> Void
    let onShowShoppingList: () -> Void
    let onStopShoppingSession: () -> Void
    let onShowLayoutSelector: () -> Void

    init(
        userPosition: CGPoint?,
        targetProduct: Product?,
        trackingMode: TrackingMode,
        selectedLayoutName: String = "Bundle-Layout",
        selectedShoppingListName: String? = nil,
        selectedShoppingListOpenCount: Int = 0,
        activeLayoutDescription: String = "Bundle-Layout aktiv",
        isLoadingLayout: Bool = false,
        navigationStatusMessage: String?,
        isLowConfidence: Bool,
        shoppingSessionBanner: ShoppingSessionBanner? = nil,
        onCalibrate: @escaping () -> Void,
        onClearTarget: @escaping () -> Void,
        onShowShoppingList: @escaping () -> Void = {},
        onStopShoppingSession: @escaping () -> Void = {},
        onShowLayoutSelector: @escaping () -> Void = {}
    ) {
        self.userPosition = userPosition
        self.targetProduct = targetProduct
        self.trackingMode = trackingMode
        self.selectedLayoutName = selectedLayoutName
        self.selectedShoppingListName = selectedShoppingListName
        self.selectedShoppingListOpenCount = selectedShoppingListOpenCount
        self.activeLayoutDescription = activeLayoutDescription
        self.isLoadingLayout = isLoadingLayout
        self.navigationStatusMessage = navigationStatusMessage
        self.isLowConfidence = isLowConfidence
        self.shoppingSessionBanner = shoppingSessionBanner
        self.onCalibrate = onCalibrate
        self.onClearTarget = onClearTarget
        self.onShowShoppingList = onShowShoppingList
        self.onStopShoppingSession = onStopShoppingSession
        self.onShowLayoutSelector = onShowLayoutSelector
    }
    
    var body: some View {
        VStack(spacing: 5) {
            Text("Indooro Map")
                .font(.largeTitle)
                .bold()
            
            // Status: User Position
            if let pos = userPosition {
                Text("📍 Position: \(String(format: "%.1f", pos.x))m / \(String(format: "%.1f", pos.y))m")
                    .font(.caption)
                    .foregroundColor(.blue)
            } else {
                Text(positionHintText)
                    .font(.caption)
                    .foregroundColor(.gray)
            }

            HStack(spacing: 8) {
                Text(layoutSummaryText)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                Spacer(minLength: 8)

                Button(action: onShowShoppingList) {
                    HStack(spacing: 6) {
                        Image(systemName: "cart")
                        if let selectedShoppingListName {
                            Text("\(selectedShoppingListName) (\(selectedShoppingListOpenCount))")
                        } else {
                            Text("Liste")
                        }
                    }
                    .font(.caption.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                Button(action: onShowLayoutSelector) {
                    HStack(spacing: 6) {
                        if isLoadingLayout {
                            ProgressView()
                                .scaleEffect(0.75)
                        } else {
                            Image(systemName: "square.stack.3d.down.right")
                        }

                        Text("Layout")
                    }
                    .font(.caption.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            .padding(.horizontal)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Layout \(selectedLayoutName). \(activeLayoutDescription)")

            if isLowConfidence || navigationStatusMessage != nil {
                HStack(spacing: 8) {
                    Text(navigationStatusMessage ?? "Signal schwach - Kalibrierung empfohlen")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.leading)

                    Spacer()

                    Button("Ich stehe hier") {
                        onCalibrate()
                    }
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.2))
                    .foregroundColor(.white)
                    .clipShape(Capsule())
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(Color.orange)
                .cornerRadius(10)
                .padding(.horizontal)
            }

            if let shoppingSessionBanner {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Einkauf aktiv: \(shoppingSessionBanner.listName)")
                            .font(.headline)
                            .foregroundColor(.white)
                        Text("Nächster Stopp: \(shoppingSessionBanner.currentStopTitle)")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.92))
                        Text(
                            "\(shoppingSessionBanner.remainingStopCount) Stopps, \(shoppingSessionBanner.remainingProductCount) Artikel offen"
                        )
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.88))

                        if shoppingSessionBanner.unresolvedProductCount > 0 {
                            Text("\(shoppingSessionBanner.unresolvedProductCount) Artikel sind im Layout noch offen.")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.85))
                        }
                    }

                    Spacer()

                    VStack(spacing: 8) {
                        Button("Liste") {
                            onShowShoppingList()
                        }
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.18))
                        .foregroundColor(.white)
                        .clipShape(Capsule())

                        Button("Beenden") {
                            onStopShoppingSession()
                        }
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.14))
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                    }
                }
                .padding()
                .background(Color.blue)
                .cornerRadius(12)
                .padding(.horizontal)
                .padding(.top, 5)
            }
            
            // ANZEIGE: ZIEL-PRODUKT (Grüne Box)
            if shoppingSessionBanner == nil, let target = targetProduct {
                HStack {
                    VStack(alignment: .leading) {
                        Text("Ziel: \(target.name)")
                            .font(.headline)
                            .foregroundColor(.white)
                        Text("Regal-Code: \(target.layoutCode)")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.9))
                    }
                    
                    Spacer()
                    
                    Button(action: {
                        withAnimation { onClearTarget() }
                    }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.white)
                            .font(.title2)
                    }
                }
                .padding()
                .background(Color.green)
                .cornerRadius(10)
                .padding(.horizontal)
                .padding(.top, 5)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .padding(.top)
        .padding(.bottom, 10)
        .background(Color(.systemBackground))
        .zIndex(1) // Sicherstellen, dass Header über der Map liegt
    }

    private var positionHintText: String {
        switch trackingMode {
        case .beacon:
            return "📡 Suche Position... (Brauche 3 Signale)"
        case .debugNoBeacons:
            return "🧪 Debug ohne Beacons: Setze Position per Tap-Modus \"Position\""
        }
    }

    private var layoutSummaryText: String {
        if activeLayoutDescription.contains("Bundle-Layout") {
            return activeLayoutDescription
        }

        if selectedLayoutName == "Aktuelles Server-Layout" {
            return "Server-Layout aktuell"
        }

        return selectedLayoutName.replacingOccurrences(of: "Version vom ", with: "Version ")
    }
}
