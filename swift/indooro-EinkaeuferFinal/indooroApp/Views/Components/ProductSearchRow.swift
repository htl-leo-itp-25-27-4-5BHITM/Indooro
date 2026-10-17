import SwiftUI

struct ProductSearchRow: View {
    let product: Product
    let isInShoppingList: Bool
    let navigateLabel: String
    let onNavigate: () -> Void
    let onAddToList: () -> Void

    private let accent = Color(red: 0.00, green: 0.43, blue: 0.36)
    private let routeAccent = Color(red: 0.15, green: 0.57, blue: 0.88)

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
        HStack(spacing: 13) {
            Image(systemName: "cart.circle.fill")
                .font(.system(size: 34))
                .foregroundStyle(.white, routeAccent)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Text(product.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.primary)
                        .lineLimit(2)

                    if isInShoppingList {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(accent)
                    }
                }

                Text(product.layoutCode.isEmpty ? "Keine Regalposition" : "Regal auf der Karte")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Text("\(String(format: "%.2f", product.price)) EUR")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(accent)
            }

            Spacer(minLength: 0)

            VStack(spacing: 8) {
                Button {
                    onNavigate()
                } label: {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.title2)
                        .foregroundStyle(routeAccent)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(navigateLabel)

                Button {
                    onAddToList()
                } label: {
                    Image(systemName: isInShoppingList ? "plus.circle.fill" : "plus")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(accent)
                        .frame(width: 30, height: 30)
                        .background(accent.opacity(0.10), in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isInShoppingList ? "Noch eins" : "Einplanen")
            }
        }
        .padding(14)
        .background(Color(uiColor: .systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.primary.opacity(0.055), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.035), radius: 10, y: 5)
    }
}
