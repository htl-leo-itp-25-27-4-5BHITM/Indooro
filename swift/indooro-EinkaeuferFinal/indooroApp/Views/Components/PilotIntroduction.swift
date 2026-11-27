import SwiftUI

struct PilotIntroduction: View {
    let onContinue: () -> Void
    var body: some View {
        // Scrollable so large Dynamic Type sizes and small iPhones never clip the text or the button.
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Willkommen bei Indooro").font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                IntroductionRow(text: "Suche unter „Planung“ nach einem Produkt und öffne die Karte.", symbol: "magnifyingglass")
                IntroductionRow(text: "Die Markierung und die Ortsangabe zeigen dir das gesuchte Regal.", symbol: "map")
                IntroductionRow(text: "Ortung ist freiwillig. Du kannst auch ohne Standort- oder Bluetooth-Zugriff einkaufen.", symbol: "location.slash")
                Button("Los geht's", action: onContinue)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .frame(maxWidth: .infinity)
            }
            .font(.body)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(28)
        }
        .scrollBounceBehavior(.basedOnSize)
        .interactiveDismissDisabled()
    }
}

/// Icon and wrapping text in one row; a plain `Label` truncated its title at large Dynamic Type sizes.
private struct IntroductionRow: View {
    let text: LocalizedStringKey
    let symbol: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: symbol)
                .accessibilityHidden(true)
            Text(text)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}
