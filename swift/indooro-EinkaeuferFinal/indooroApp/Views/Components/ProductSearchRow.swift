import IndooroModels
import SwiftUI

struct ProductSearchRow: View {
    let product: Product
    let isInShoppingList: Bool
    let navigateLabel: String
    let onNavigate: () -> Void
    let onAddToList: () -> Void

    private let accent = Color(red: 0.00, green: 0.43, blue: 0.36)
    private let routeAccent = Color(red: 0.15, green: 0.57, blue: 0.88)
    @ScaledMetric(relativeTo: .title) private var productIconSize: CGFloat = 34

    init(
        product: Product,
        isInShoppingList: Bool,
        navigateLabel: String = "Zur Karte",
        onNavigate: @escaping () -> Void,
        onAddToList: @escaping () -> Void
    ) {
        self.product = product
        self.isInShoppingList = isInShoppingList
        self.navigateLabel = navigateLabel
        self.onNavigate = onNavigate
        self.onAddToList = onAddToList
    }

    var body: some View {
        HStack(spacing: IndooroTokens.Spacing.value13px) {
            Image(systemName: "cart.circle.fill")
                .font(.system(size: productIconSize))
                .foregroundStyle(.white, routeAccent)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value5px) {
                HStack(spacing: IndooroTokens.Spacing.value6px) {
                    Text(product.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.primary)
                        .lineLimit(2)

                    if isInShoppingList {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(accent)
                            .accessibilityLabel("Auf der Einkaufsliste")
                    }
                }

                Text(product.layoutCode.isEmpty ? "Keine Regalposition" : "Regal auf der Karte")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Text(PriceText.format(product.price))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(accent)
            }

            Spacer(minLength: 0)

            VStack(spacing: IndooroTokens.Spacing.value8px) {
                Button {
                    onNavigate()
                } label: {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.title2)
                        .foregroundStyle(Color.a11yRouteBlueText)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(navigateLabel)
                .accessibilityHint("\(product.name) auf der Karte anzeigen")

                Button {
                    onAddToList()
                } label: {
                    Image(systemName: isInShoppingList ? "plus.circle.fill" : "plus")
                        .font(.headline.weight(.semibold))
                        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                        .foregroundStyle(accent)
                        .frame(width: 30, height: 30)
                        .background(accent.opacity(0.10), in: Circle())
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isInShoppingList ? "Noch eins" : "Einplanen")
                .accessibilityHint("\(product.name) zur Einkaufsliste hinzufügen")
            }
        }
        .padding(IndooroTokens.Spacing.value14px)
        .background(Color(uiColor: .systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: IndooroTokens.Radius.value22px, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: IndooroTokens.Radius.value22px, style: .continuous)
                .stroke(Color.primary.opacity(0.055), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.035), radius: 10, y: 5)
    }
}
