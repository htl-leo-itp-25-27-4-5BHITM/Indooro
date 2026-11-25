import SwiftUI

struct PilotIntroduction: View {
    let onContinue: () -> Void
    var body: some View {
        // Scrollable so large Dynamic Type sizes and small iPhones never clip the text or the button.
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Willkommen bei Indooro").font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                Label("Suche unter „Planung“ nach einem Produkt und öffne die Karte.", systemImage: "magnifyingglass")
                Label("Die Markierung und die Ortsangabe zeigen dir das gesuchte Regal.", systemImage: "map")
                Label("Ortung ist freiwillig. Du kannst auch ohne Standort- oder Bluetooth-Zugriff einkaufen.", systemImage: "location.slash")
                Button("Los geht's", action: onContinue)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .frame(maxWidth: .infinity)
            }
            .font(.body)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(28)
        }
        .scrollBounceBehavior(.basedOnSize)
        .interactiveDismissDisabled()
    }
}
