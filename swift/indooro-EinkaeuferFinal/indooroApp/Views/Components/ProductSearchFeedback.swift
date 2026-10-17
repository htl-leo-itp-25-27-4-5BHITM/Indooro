import SwiftUI

struct ProductSearchFeedback: View {
    @ObservedObject var store: ProductSearchStore
    var body: some View {
        if let error = store.errorMessage {
            VStack(alignment: .leading, spacing: 8) {
                Label("Suche fehlgeschlagen", systemImage: "exclamationmark.triangle")
                    .font(.headline)
                Text(error).font(.subheadline)
                Button("Erneut versuchen") { store.retry() }
                    .buttonStyle(.bordered)
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
        } else if store.hasCompletedSearch && store.searchResults.isEmpty, let query = store.lastQuery {
            Text("Keine Treffer für „\(query)“")
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.regularMaterial)
        }
    }
}
