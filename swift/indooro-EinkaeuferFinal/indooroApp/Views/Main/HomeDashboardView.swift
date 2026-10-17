import SwiftUI

struct HomeDashboardView: View {
    let selectedList: ShoppingList?
    let activeBanner: ShoppingSessionBanner?
    let onOpenPlanning: () -> Void
    let onOpenRecipes: () -> Void
    let onOpenShopping: () -> Void
    let onOpenMap: () -> Void

    @State private var showsTutorial = false
    @ScaledMetric(relativeTo: .title) private var heroIconSize: CGFloat = 36

    private let accent = Color(red: 0.00, green: 0.43, blue: 0.36)
    private let routeAccent = Color(red: 0.15, green: 0.57, blue: 0.88)
    private let warmAccent = Color(red: 0.87, green: 0.63, blue: 0.26)

    private var cardBackground: Color {
        Color(uiColor: .systemBackground)
    }

    private var borderColor: Color {
        Color.primary.opacity(0.07)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    headerSection

                    if let activeBanner {
                        activeTourCard(activeBanner)
                    }

                    currentListCard
                    if AppEnvironment.allowsExtendedFeatures { recipesEntryCard }
                    mapEntryCard
                }
                .padding(.horizontal, 22)
                .padding(.top, 10)
                .padding(.bottom, 28)
            }
            .background(HomeSoftBackground(accent: accent).ignoresSafeArea())
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
        }
        .sheet(isPresented: $showsTutorial) {
            PilotIntroduction { showsTutorial = false }
            .presentationDetents([.large])
        }
    }

    private var headerSection: some View {
        VStack(spacing: 16) {
            Text("Indooro")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .foregroundStyle(accent)
                .padding(.top, 6)
                .accessibilityAddTraits(.isHeader)

            VStack(spacing: 8) {
                Text("Finde alles.\nSchnell und einfach.")
                    .font(.system(.title2, design: .rounded, weight: .bold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.primary)

                Text("Plane deinen Einkauf und finde im Markt schnell den richtigen Weg.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
            }

            VStack(spacing: 12) {
                Button {
                    onOpenPlanning()
                } label: {
                    Label("Los geht's", systemImage: "arrow.right.circle.fill")
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                }
                .buttonStyle(.plain)
                .contentShape(Capsule())
                .foregroundStyle(.white)
                .background(accent, in: Capsule())
                .shadow(color: accent.opacity(0.22), radius: 18, y: 10)

                Button {
                    onOpenMap()
                } label: {
                    Label("Karte öffnen", systemImage: "map.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(accent)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .buttonStyle(.plain)
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .background(accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func activeTourCard(_ banner: ShoppingSessionBanner) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: heroIconSize))
                    .foregroundStyle(.white, accent)
                    .shadow(color: accent.opacity(0.22), radius: 8, y: 4)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Aktive Einkaufstour")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Text(banner.listName)
                        .font(.headline.weight(.semibold))
                }
                .accessibilityElement(children: .combine)

                Spacer(minLength: 0)
            }

            Text(banner.currentStopTitle)
                .font(.system(.title3, design: .rounded, weight: .bold))
                .lineLimit(4)

            HStack(spacing: 14) {
                statColumn(title: "Stopps", value: "\(banner.remainingStopCount)")
                statColumn(title: "Artikel", value: "\(banner.remainingProductCount)")
                statColumn(title: "Ohne Regal", value: "\(banner.unresolvedProductCount)")
            }
            .accessibilityElement(children: .combine)

            Button {
                onOpenMap()
            } label: {
                Label("Route fortsetzen", systemImage: "location.north.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
            }
            .buttonStyle(.plain)
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .foregroundStyle(.white)
            .background(accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .padding(18)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(borderColor, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.05), radius: 18, y: 10)
    }

    private var currentListCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Image(systemName: "bag.fill")
                    .font(.title3)
                    .foregroundStyle(accent)
                    .frame(width: 44, height: 44)
                    .background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text("Dein Einkauf")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Text(selectedList?.name ?? "Standardliste")
                        .font(.headline.weight(.semibold))
                        .lineLimit(1)
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 14) {
                statColumn(title: "Offen", value: "\(selectedList?.openItemCount ?? 0)")
                statColumn(title: "Erledigt", value: "\(selectedList?.completedItemCount ?? 0)")
            }

            Button {
                onOpenShopping()
            } label: {
                Label("Einkaufen öffnen", systemImage: "checklist.checked")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(accent)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
            }
            .buttonStyle(.plain)
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(borderColor, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 16, y: 8)
    }

    private var recipesEntryCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Image(systemName: "fork.knife")
                    .font(.title3)
                    .foregroundStyle(warmAccent)
                    .frame(width: 44, height: 44)
                    .background(warmAccent.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text("Rezepte")
                        .font(.headline.weight(.semibold))

                    Text("Zutaten übernehmen und direkt durch den Markt routen.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)
            }

            Button {
                onOpenRecipes()
            } label: {
                Label("Rezepte öffnen", systemImage: "cart.badge.plus")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.a11yWarningText)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
            }
            .buttonStyle(.plain)
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .background(warmAccent.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(borderColor, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 16, y: 8)
    }

    private var mapEntryCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Image(systemName: "map.fill")
                    .font(.title3)
                    .foregroundStyle(routeAccent)
                    .frame(width: 44, height: 44)
                    .background(routeAccent.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text("Marktkarte")
                        .font(.headline.weight(.semibold))

                    Text("Route, Produktziel und Standort auf einen Blick.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 10) {
                Button {
                    onOpenMap()
                } label: {
                    Label("Karte", systemImage: "location.fill")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .buttonStyle(.plain)
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .foregroundStyle(.white)
                .background(Color.a11yRouteBlueText, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                Button {
                    showsTutorial = true
                } label: {
                    Image(systemName: "questionmark")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(Color.a11yWarningText)
                        .frame(width: 44, height: 44)
                        .background(warmAccent.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .accessibilityLabel("Einführung anzeigen")
            }
        }
        .padding(18)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(borderColor, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 16, y: 8)
    }

    private func statColumn(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.title3.weight(.bold))

            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct HomeSoftBackground: View {
    let accent: Color

    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground)

            LinearGradient(
                colors: [
                    Color(uiColor: .systemBackground),
                    accent.opacity(0.08),
                    Color(uiColor: .systemGroupedBackground)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
    }
}

private struct HomeTutorialSheet: View {
    let onOpenPlanning: () -> Void
    let onOpenMap: () -> Void

    @Environment(\.dismiss) private var dismiss

    private let accent = Color(red: 0.12, green: 0.50, blue: 0.39)
    private var pageBackground: Color { Color(uiColor: .systemGroupedBackground) }
    private var cardBackground: Color { Color(uiColor: .secondarySystemGroupedBackground) }
    private var borderColor: Color { Color.primary.opacity(0.08) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("So nutzt du Indooro am einfachsten")
                        .font(.system(.title, design: .rounded, weight: .bold))

                    Text("Die beste Reihenfolge ist: Einkauf planen, kurz prüfen und dann mit der Karte durch den Markt gehen.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    TutorialStepCard(
                        symbol: "checklist.checked",
                        title: "1. Einkauf planen",
                        text: "Öffne Planung, suche nach Artikeln oder stöbere über Kategorien und Kennzeichnungen."
                    )

                    TutorialStepCard(
                        symbol: "tag.fill",
                        title: "2. Einkauf prüfen",
                        text: "In Einkaufen siehst du deine aktuelle Liste und startest die Tour."
                    )

                    TutorialStepCard(
                        symbol: "map.fill",
                        title: "3. Im Markt navigieren",
                        text: "Starte die Tour aus deiner Liste oder öffne die Karten-Seite, wenn du zu einem Regal geführt werden willst."
                    )

                    VStack(spacing: 10) {
                        Button {
                            onOpenPlanning()
                        } label: {
                            Label("Planung öffnen", systemImage: "plus.circle")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(accent)

                        Button {
                            onOpenMap()
                        } label: {
                            Label("Direkt zur Karte", systemImage: "map")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(accent)
                    }
                    .padding(.top, 8)
                }
                .padding(20)
            }
            .background(pageBackground.ignoresSafeArea())
            .navigationTitle("Hilfe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fertig") {
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct TutorialStepCard: View {
    let symbol: String
    let title: String
    let text: String

    private let accent = Color(red: 0.12, green: 0.50, blue: 0.39)
    private var cardBackground: Color { Color(uiColor: .secondarySystemGroupedBackground) }
    private var borderColor: Color { Color.primary.opacity(0.08) }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(accent)
                .frame(width: 42, height: 42)
                .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                Text(text)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .padding(18)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(borderColor, lineWidth: 1)
        )
    }
}
