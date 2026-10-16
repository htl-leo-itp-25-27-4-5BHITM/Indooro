import SwiftUI

struct UserLocationMarker: View {
    let headingRadians: Float?
    let isReliable: Bool
    /// false, wenn die Position nicht vertrauenswuerdig ist: Marker wird blasser und zeigt einen gestrichelten Unsicherheitskreis.
    var isTrusted: Bool = true
    /// Aktueller Kartenmaßstab; der Unsicherheitskreis hat 6 m Durchmesser (3 m Radius).
    var pixelsPerMeter: Double? = nil

    private let accent = Color(red: 0.15, green: 0.57, blue: 0.88)

    var body: some View {
        ZStack {
            if !isTrusted {
                Circle()
                    .stroke(style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                    .foregroundStyle(accent)
                    .frame(width: uncertaintyDiameter, height: uncertaintyDiameter)
            }

            Circle()
                .fill(accent.opacity(0.16))
                .frame(width: 44, height: 44)

            Image(systemName: "location.north.circle.fill")
                .font(.system(size: 27, weight: .bold))
                .foregroundStyle(.white, accent)
                .rotationEffect(.radians(isReliable ? Double(-(headingRadians ?? 0)) : 0))
                .shadow(color: accent.opacity(0.22), radius: 5, y: 2)
        }
        .opacity(isTrusted ? 1 : 0.45)
        .compositingGroup()
    }

    private var uncertaintyDiameter: CGFloat {
        guard let pixelsPerMeter else { return 44 }
        return CGFloat(6 * pixelsPerMeter)
    }
}
