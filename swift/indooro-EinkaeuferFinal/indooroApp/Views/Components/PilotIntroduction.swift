import SwiftUI

struct PilotIntroduction: View {
    let onContinue: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Willkommen bei Indooro").font(.largeTitle.bold())
            Label("Suche unter „Planung“ nach einem Produkt und öffne die Karte.", systemImage: "magnifyingglass")
            Label("Die Markierung und die Ortsangabe zeigen dir das gesuchte Regal.", systemImage: "map")
            Label("Ortung ist freiwillig. Du kannst auch ohne Standort- oder Bluetooth-Zugriff einkaufen.", systemImage: "location.slash")
            Button("Los geht's", action: onContinue)
                .buttonStyle(.borderedProminent)
                .frame(minHeight: 44)
        }
        .font(.body)
        .padding(28)
        .interactiveDismissDisabled()
    }
}
