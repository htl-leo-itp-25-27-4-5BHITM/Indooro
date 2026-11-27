import IndooroModels
import SwiftUI

struct HomeDashboardView: View {
    let selectedList: ShoppingList?
    let activeBanner: ShoppingSessionBanner?
    @Environment(AppRouter.self) private var router

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
                VStack(spacing: IndooroTokens.Spacing.value16px) {
                    headerSection

                    if let activeBanner {
                        activeTourCard(activeBanner)
                    }

                    currentListCard
                    if AppEnvironment.allowsExtendedFeatures { recipesEntryCard }
                    mapEntryCard
                }
                .padding(.horizontal, IndooroTokens.Spacing.value22px)
                .padding(.top, IndooroTokens.Spacing.value10px)
                .padding(.bottom, IndooroTokens.Spacing.value28px)
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
        VStack(spacing: IndooroTokens.Spacing.value16px) {
            Text("Indooro")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .foregroundStyle(accent)
                .padding(.top, IndooroTokens.Spacing.value6px)
                .accessibilityAddTraits(.isHeader)

            VStack(spacing: IndooroTokens.Spacing.value8px) {
                Text("Finde alles.\nSchnell und einfach.")
                    .font(.system(.title2, design: .rounded, weight: .bold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.primary)

                Text("Plane deinen Einkauf und finde im Markt schnell den richtigen Weg.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, IndooroTokens.Spacing.value16px)
            }

            VStack(spacing: IndooroTokens.Spacing.value12px) {
                Button {
                    router.open(.planning)
                } label: {
                    Label("Los geht's", systemImage: "arrow.right.circle.fill")
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, IndooroTokens.Spacing.value8px)
                        .frame(minHeight: 50)
                }
                .buttonStyle(.plain)
                .contentShape(Capsule())
                .foregroundStyle(.white)
                .background(accent, in: Capsule())
                .shadow(color: accent.opacity(0.22), radius: 18, y: 10)

                Button {
                    router.open(.map)
                } label: {
                    Label("Karte öffnen", systemImage: "map.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(accent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, IndooroTokens.Spacing.value8px)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .contentShape(RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))
                .background(accent.opacity(0.08), in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func activeTourCard(_ banner: ShoppingSessionBanner) -> some View {
        VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value14px) {
            HStack(alignment: .top, spacing: IndooroTokens.Spacing.value14px) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: heroIconSize))
                    .foregroundStyle(.white, accent)
                    .shadow(color: accent.opacity(0.22), radius: 8, y: 4)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value4px) {
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

            HStack(spacing: IndooroTokens.Spacing.value14px) {
                statColumn(title: "Stopps", value: "\(banner.remainingStopCount)")
                statColumn(title: "Artikel", value: "\(banner.remainingProductCount)")
                statColumn(title: "Ohne Regal", value: "\(banner.unresolvedProductCount)")
            }
            .accessibilityElement(children: .combine)

            Button {
                router.open(.map)
            } label: {
                Label("Route fortsetzen", systemImage: "location.north.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, IndooroTokens.Spacing.value8px)
                    .frame(minHeight: 48)
            }
            .buttonStyle(.plain)
            .contentShape(RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))
            .foregroundStyle(.white)
            .background(accent, in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))
        }
        .padding(IndooroTokens.Spacing.value18px)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value28px, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: IndooroTokens.Radius.value28px, style: .continuous)
                .strokeBorder(borderColor, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.05), radius: 18, y: 10)
    }

    private var currentListCard: some View {
        VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value16px) {
            HStack(spacing: IndooroTokens.Spacing.value12px) {
                Image(systemName: "bag.fill")
                    .font(.title3)
                    .foregroundStyle(accent)
                    .frame(width: 44, height: 44)
                    .background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value16px, style: .continuous))

                VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value3px) {
                    Text("Dein Einkauf")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Text(selectedList?.name ?? "Standardliste")
                        .font(.headline.weight(.semibold))
                        .lineLimit(2)
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: IndooroTokens.Spacing.value14px) {
                statColumn(title: "Offen", value: "\(selectedList?.openItemCount ?? 0)")
                statColumn(title: "Erledigt", value: "\(selectedList?.completedItemCount ?? 0)")
            }

            Button {
                router.open(.shopping)
            } label: {
                Label("Einkaufen öffnen", systemImage: "checklist.checked")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(accent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, IndooroTokens.Spacing.value8px)
                    .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .contentShape(RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))
            .background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))
        }
        .padding(IndooroTokens.Spacing.value18px)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value28px, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: IndooroTokens.Radius.value28px, style: .continuous)
                .strokeBorder(borderColor, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 16, y: 8)
    }

    private var recipesEntryCard: some View {
        VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value16px) {
            HStack(spacing: IndooroTokens.Spacing.value12px) {
                Image(systemName: "fork.knife")
                    .font(.title3)
                    .foregroundStyle(warmAccent)
                    .frame(width: 44, height: 44)
                    .background(warmAccent.opacity(0.12), in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value16px, style: .continuous))

                VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value3px) {
                    Text("Rezepte")
                        .font(.headline.weight(.semibold))

                    Text("Zutaten übernehmen und direkt durch den Markt routen.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)
            }

            Button {
                router.open(.recipes)
            } label: {
                Label("Rezepte öffnen", systemImage: "cart.badge.plus")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.a11yWarningText)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, IndooroTokens.Spacing.value8px)
                    .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .contentShape(RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))
            .background(warmAccent.opacity(0.12), in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))
        }
        .padding(IndooroTokens.Spacing.value18px)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value28px, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: IndooroTokens.Radius.value28px, style: .continuous)
                .strokeBorder(borderColor, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 16, y: 8)
    }

    private var mapEntryCard: some View {
        VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value16px) {
            HStack(spacing: IndooroTokens.Spacing.value12px) {
                Image(systemName: "map.fill")
                    .font(.title3)
                    .foregroundStyle(routeAccent)
                    .frame(width: 44, height: 44)
                    .background(routeAccent.opacity(0.10), in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value16px, style: .continuous))

                VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value3px) {
                    Text("Marktkarte")
                        .font(.headline.weight(.semibold))

                    Text("Route, Produktziel und Standort auf einen Blick.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: IndooroTokens.Spacing.value10px) {
                Button {
                    router.open(.map)
                } label: {
                    Label("Karte", systemImage: "location.fill")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, IndooroTokens.Spacing.value8px)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .contentShape(RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))
                .foregroundStyle(.white)
                .background(Color.a11yRouteBlueText, in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))

                Button {
                    showsTutorial = true
                } label: {
                    Image(systemName: "questionmark")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(Color.a11yWarningText)
                        .frame(width: 44, height: 44)
                        .background(warmAccent.opacity(0.12), in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))
                }
                .buttonStyle(.plain)
                .contentShape(RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))
                .accessibilityLabel("Einführung anzeigen")
            }
        }
        .padding(IndooroTokens.Spacing.value18px)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value28px, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: IndooroTokens.Radius.value28px, style: .continuous)
                .strokeBorder(borderColor, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 16, y: 8)
    }

    private func statColumn(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value3px) {
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
                VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value16px) {
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

                    VStack(spacing: IndooroTokens.Spacing.value10px) {
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
                    .padding(.top, IndooroTokens.Spacing.value8px)
                }
                .padding(IndooroTokens.Spacing.value20px)
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
        HStack(alignment: .top, spacing: IndooroTokens.Spacing.value14px) {
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(accent)
                .frame(width: 42, height: 42)
                .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value14px, style: .continuous))

            VStack(alignment: .leading, spacing: IndooroTokens.Spacing.value6px) {
                Text(title)
                    .font(.headline)
                Text(text)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .padding(IndooroTokens.Spacing.value18px)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: IndooroTokens.Radius.value22px, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: IndooroTokens.Radius.value22px, style: .continuous)
                .strokeBorder(borderColor, lineWidth: 1)
        )
    }
}
