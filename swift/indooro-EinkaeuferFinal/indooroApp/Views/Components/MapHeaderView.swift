import IndooroModels
import SwiftUI

struct MapHeaderView: View {
    let userPosition: CGPoint?
    let targetProduct: Product?
    let onClearTarget: () -> Void
    
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
                Text("📡 Suche Position... (Brauche 3 Signale)")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            // ANZEIGE: ZIEL-PRODUKT (Grüne Box)
            if let target = targetProduct {
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
                    
                    Button(action: onClearTarget) {
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
        .background(Color.white)
        .zIndex(1)
    }
}
