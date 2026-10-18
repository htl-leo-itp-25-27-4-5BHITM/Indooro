import IndooroModels
import SwiftUI

struct ShelfView: View {
    let element: LayoutElement
    let pixelsPerMeter: Double

    private var palette: MapZonePalette {
        element.mapZonePalette
    }

    var body: some View {
        let width = CGFloat((element.width ?? 1.0) * pixelsPerMeter)
        let height = CGFloat((element.height ?? 1.0) * pixelsPerMeter)
        let xPos = CGFloat(element.x * pixelsPerMeter + width / 2)
        let yPos = CGFloat(element.y * pixelsPerMeter + height / 2)
        let cornerRadius = min(18, max(10, min(width, height) * 0.18))
        let showsIcon = min(width, height) >= 28 && !element.isEmptyMapZone
        let showsText = (width >= 48 || height >= 32) && !element.isEmptyMapZone

        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: palette.fillColors,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(palette.borderColor, lineWidth: 1)
                )
                .shadow(color: palette.shadowColor, radius: 6, y: 3)

            VStack(spacing: showsText ? 5 : 0) {
                if showsIcon {
                    Image(systemName: palette.symbolName)
                        .font(.system(size: iconSize(for: width, height: height), weight: .semibold))
                        .foregroundStyle(palette.iconColor)
                        .frame(width: iconContainerSize(for: width, height: height), height: iconContainerSize(for: width, height: height))
                        .background(palette.iconBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }

                if showsText, let title = element.displayMapTitle {
                    Text(title)
                        .font(.system(size: textSize(for: width, height: height), weight: .semibold, design: .rounded))
                        .lineLimit(height >= 44 ? 2 : 1)
                        .multilineTextAlignment(.center)
                        .minimumScaleFactor(0.75)
                        .frame(maxWidth: .infinity)
                        .foregroundStyle(palette.textColor)
                }
            }
            .padding(.horizontal, max(4, min(width, height) * 0.09))
            .padding(.vertical, max(4, min(width, height) * 0.08))
        }
        .frame(width: width, height: height)
        .rotationEffect(.degrees(element.rotation ?? 0))
        .position(x: xPos, y: yPos)
    }

    private func iconSize(for width: CGFloat, height: CGFloat) -> CGFloat {
        min(18, max(10, min(width, height) * 0.24))
    }

    private func iconContainerSize(for width: CGFloat, height: CGFloat) -> CGFloat {
        min(30, max(18, min(width, height) * 0.44))
    }

    private func textSize(for width: CGFloat, height: CGFloat) -> CGFloat {
        min(13, max(8, min(width, height) * 0.19))
    }
}

struct MapZonePalette {
    let fillColors: [Color]
    let borderColor: Color
    let textColor: Color
    let iconColor: Color
    let iconBackground: Color
    let shadowColor: Color
    let symbolName: String

    static func resolve(for element: LayoutElement) -> MapZonePalette {
        let descriptor = element.zoneDescriptorText
        let rawColor = Color(hex: element.color ?? "#456F82")
        let fallback = MapZonePalette(
            fillColors: [rawColor.opacity(element.isEmptyMapZone ? 0.12 : 0.42), rawColor.opacity(element.isEmptyMapZone ? 0.08 : 0.25)],
            borderColor: rawColor.opacity(element.isEmptyMapZone ? 0.18 : 0.68),
            textColor: Color(red: 0.18, green: 0.22, blue: 0.26),
            iconColor: rawColor.opacity(0.85),
            iconBackground: Color.white.opacity(0.55),
            shadowColor: rawColor.opacity(element.isEmptyMapZone ? 0.05 : 0.14),
            symbolName: "square.grid.2x2.fill"
        )

        if descriptor.contains("obst") || descriptor.contains("gemu") || descriptor.contains("frisch") {
            return MapZonePalette(
                fillColors: [Color(hex: "#D8F0D7"), Color(hex: "#ECF7E6")],
                borderColor: Color(hex: "#8BBE88"),
                textColor: Color(hex: "#2E5630"),
                iconColor: Color(hex: "#4A8D50"),
                iconBackground: Color.white.opacity(0.65),
                shadowColor: Color(hex: "#8BBE88").opacity(0.20),
                symbolName: "leaf.fill"
            )
        }

        if descriptor.contains("nudel") || descriptor.contains("pasta") || descriptor.contains("teig") || descriptor.contains("reis") {
            return MapZonePalette(
                fillColors: [Color(hex: "#F8E7C8"), Color(hex: "#FCF4E7")],
                borderColor: Color(hex: "#D7AE64"),
                textColor: Color(hex: "#6E4F1F"),
                iconColor: Color(hex: "#B8812F"),
                iconBackground: Color.white.opacity(0.65),
                shadowColor: Color(hex: "#D7AE64").opacity(0.20),
                symbolName: "fork.knife"
            )
        }

        if descriptor.contains("milch") || descriptor.contains("molk") || descriptor.contains("kaese") || descriptor.contains("joghurt") {
            return MapZonePalette(
                fillColors: [Color(hex: "#DBEAF8"), Color(hex: "#EEF5FC")],
                borderColor: Color(hex: "#82A8CF"),
                textColor: Color(hex: "#294C71"),
                iconColor: Color(hex: "#4D7FB3"),
                iconBackground: Color.white.opacity(0.70),
                shadowColor: Color(hex: "#82A8CF").opacity(0.20),
                symbolName: "drop.fill"
            )
        }

        if descriptor.contains("tief") || descriptor.contains("frost") || descriptor.contains("kuehl") || descriptor.contains("kuehl") {
            return MapZonePalette(
                fillColors: [Color(hex: "#DCEEFE"), Color(hex: "#EFF8FF")],
                borderColor: Color(hex: "#74ABD4"),
                textColor: Color(hex: "#285170"),
                iconColor: Color(hex: "#4E88B5"),
                iconBackground: Color.white.opacity(0.72),
                shadowColor: Color(hex: "#74ABD4").opacity(0.20),
                symbolName: "snowflake"
            )
        }

        if descriptor.contains("getraenk") || descriptor.contains("wasser") || descriptor.contains("saft") || descriptor.contains("limo") {
            return MapZonePalette(
                fillColors: [Color(hex: "#D9F1EC"), Color(hex: "#EEF9F6")],
                borderColor: Color(hex: "#6BB6AA"),
                textColor: Color(hex: "#24554D"),
                iconColor: Color(hex: "#3B8E83"),
                iconBackground: Color.white.opacity(0.68),
                shadowColor: Color(hex: "#6BB6AA").opacity(0.20),
                symbolName: "waterbottle"
            )
        }

        if descriptor.contains("back") || descriptor.contains("brot") || descriptor.contains("geb") {
            return MapZonePalette(
                fillColors: [Color(hex: "#F7E2D4"), Color(hex: "#FCF2EA")],
                borderColor: Color(hex: "#D9A37E"),
                textColor: Color(hex: "#73452A"),
                iconColor: Color(hex: "#B66E40"),
                iconBackground: Color.white.opacity(0.68),
                shadowColor: Color(hex: "#D9A37E").opacity(0.20),
                symbolName: "birthday.cake.fill"
            )
        }

        if descriptor.contains("snack") || descriptor.contains("suess") || descriptor.contains("chips") {
            return MapZonePalette(
                fillColors: [Color(hex: "#F4E0EA"), Color(hex: "#FBF0F5")],
                borderColor: Color(hex: "#C98BA5"),
                textColor: Color(hex: "#6A3E55"),
                iconColor: Color(hex: "#A35E7E"),
                iconBackground: Color.white.opacity(0.70),
                shadowColor: Color(hex: "#C98BA5").opacity(0.20),
                symbolName: "popcorn.fill"
            )
        }

        return fallback
    }
}

extension LayoutElement {
    var displayMapTitle: String? {
        if let label {
            let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty, trimmed.localizedCaseInsensitiveCompare("Leer") != .orderedSame {
                return trimmed
            }
        }

        guard let categoryBase else { return nil }
        let formatted = LayoutElement.formattedCategoryTitle(from: categoryBase)
        return formatted == "Regal" ? nil : formatted
    }

    var mapZonePalette: MapZonePalette {
        MapZonePalette.resolve(for: self)
    }

    var isEmptyMapZone: Bool {
        guard let label else { return false }
        return label.trimmingCharacters(in: .whitespacesAndNewlines)
            .localizedCaseInsensitiveCompare("Leer") == .orderedSame
    }

    fileprivate var zoneDescriptorText: String {
        [
            label,
            categoryBase,
            category
        ]
        .compactMap { $0?.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current) }
        .joined(separator: " ")
    }

    private static func formattedCategoryTitle(from rawValue: String) -> String {
        let cleaned = rawValue
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        let lowercase = cleaned.lowercased()
        if lowercase.isEmpty || lowercase == "undefined" {
            return "Regal"
        }

        switch lowercase {
        case "obst gemuese":
            return "Obst und Gemüse"
        case "molkereiprodukte":
            return "Molkereiprodukte"
        case "tiefkuehlprodukte":
            return "Tiefkühlprodukte"
        case "alkoholfreie getraenke":
            return "Alkoholfreie Getränke"
        default:
            return cleaned
                .split(separator: " ")
                .map { $0.prefix(1).uppercased() + $0.dropFirst().lowercased() }
                .joined(separator: " ")
        }
    }
}
