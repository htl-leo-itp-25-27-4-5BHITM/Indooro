import IndooroModels
import SwiftUI

struct BeaconMapItem: View {
    let beacon: IndooroBeacon
    let pixelsPerMeter: Double

    private var statusColor: Color {
        if beacon.distance <= 0 { return .gray.opacity(0.55) }
        if beacon.distance < 2.0 { return .green }
        return .orange
    }

    var body: some View {
        ZStack {
            if beacon.distance > 0 && beacon.distance < 10 {
                Circle()
                    .stroke(statusColor.opacity(0.22), style: StrokeStyle(lineWidth: 1, dash: [4, 6]))
                    .frame(
                        width: CGFloat(beacon.distance * pixelsPerMeter * 2),
                        height: CGFloat(beacon.distance * pixelsPerMeter * 2)
                    )
            }

            Circle()
                .fill(.thinMaterial)
                .frame(width: 24, height: 24)
                .overlay(
                    Circle()
                        .stroke(statusColor.opacity(0.35), lineWidth: 1)
                )

            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(statusColor)
                .shadow(color: statusColor.opacity(0.22), radius: 2, y: 1)

            Text(beacon.name)
                .font(.system(size: 8, weight: .semibold, design: .rounded))
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color(uiColor: .systemBackground).opacity(0.9), in: Capsule())
                .offset(y: 18)
        }
    }
}
