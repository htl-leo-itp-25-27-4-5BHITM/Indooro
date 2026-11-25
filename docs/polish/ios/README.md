# iOS polish sweep (polish-platform-consistency, tasks 5.1-5.4)

## Devices
- `se-*`: iPhone SE (3rd generation) simulator, iOS 18.6 (smallest supported screen).
- `16pro-*`: iPhone 16 Pro simulator, iOS 18.6. An iPhone 17 Pro needs the iOS 26 runtime, which was
  not installed; the point size (402x874) is the same.
- `*-ax`: Dynamic Type `AccessibilityXL`. `*-dark`: system dark appearance.

The screenshots come from a Debug build compiled with `swiftc` (no `xcodebuild` destination was
available locally) against the mock API `scripts/dev/mock_mobile_api.py`.

## Before / after
`before/` shows `main`, except `se-recipe-detail.png`, `se-shopping-ax-truncated.png` and
`se-tour-ax-overlap.png`, which show problems found on intermediate builds of this branch.

| Screen | Before | After |
|---|---|---|
| Start | `before/se-start.png`, `before/se-start-ax.png` | `after/se-start.png`, `after/16pro-start.png` |
| Introduction, large text | `before/se-intro-ax.png` | `after/se-intro-ax.png` |
| Store selection | `before/se-stores.png` | `after/se-stores-ax.png`, `after/16pro-stores.png` |
| Map | `before/se-map.png` | `after/se-map.png`, `after/se-map-ax.png`, `after/16pro-map.png` |
| Tour | `before/se-tour-ax-overlap.png` | `after/se-tour.png`, `after/se-tour-ax.png` |
| Shopping list | `before/se-shopping-ax-truncated.png` | `after/se-shopping.png`, `after/se-shopping-ax.png` |
| Recipe detail | `before/se-recipe-detail.png` | `after/se-recipe-detail.png`, `after/se-recipes.png` |
| Planning and search | - | `after/se-planning.png`, `after/se-planning-ax.png`, `after/se-search.png`, `after/16pro-planning.png` |
| Settings, dark system appearance | - | `after/se-settings-dark.png`, `after/se-start-dark.png` |

## Notes
- The app forces light appearance (`ContentView.preferredColorScheme(.light)`). This is unchanged.
- Not exercised in the simulator: AR navigation (needs a device), camera scanner, permission banner,
  upsell sheet, study mode, list transfer sheets.
