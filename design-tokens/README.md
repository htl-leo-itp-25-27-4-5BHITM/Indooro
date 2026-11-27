# Shared web design tokens

`tokens.json` is the shared source for web and the generated SwiftUI constants in `swift/indooro-EinkaeuferFinal/indooroApp/DesignSystem/IndooroTokens.swift`. It follows
[DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/), including typed
sRGB color objects, `{value, unit}` dimensions, font-family arrays, shadow
composites, and whole-token `{path.to.token}` aliases. The stable color format
uses `colorSpace`, `components`, `alpha` and optional six-digit `hex`, rather than
legacy hex-string `$value` examples. Swift consumers should resolve aliases and
read these typed values directly; `dist/tokens.ts` contains web CSS strings.

## Names and outputs

Names are lowercase kebab-case. A dot-separated token path becomes a custom
property: `color.brand.primary` → `--ind-color-brand-primary`. The generator
rejects flattened name collisions, missing references, cycles, mismatched alias
types and unsupported types. Every leaf declares its own `$type`.

- `color.palette`: exact existing colors, named by their source hex value;
  shorter/longer spellings intentionally coexist to make source matching explicit.
- `color.brand`, `color.admin`, `color.showcase`, `color.scene`: semantic aliases.
  The apps retain their distinct palettes. Brand primary follows admin; the mint
  accent follows showcase. These are not a new theme or a palette unification.
- `space`, `radius`, `font-size`: existing px/rem scales, named by value and unit
  (`0-5rem` means `0.5rem`). Units are not converted to preserve root font behavior.
- `font-family`, `shadow`, `z-index`: named stacks, portable static shadows and
  existing stacking levels. Context-dependent shadows remain local.

From the repository root (Node 22 or 24; no dependencies):

```sh
node design-tokens/build.mjs
node design-tokens/build.mjs --check
node --test design-tokens/build.test.mjs
```

The generator works from any current directory. Commit both `dist/tokens.css`
and `dist/tokens.ts`, plus the served backend CSS copy; CI's contract job rejects missing or stale output. The
local `.gitignore` explicitly allows these generated artifacts. CSS preserves
aliases as `var(...)`; TS exports resolved CSS values keyed by token path.
Three.js consumes TS values because its colors cannot resolve CSS variables.

## Adding a token

1. Find an exact existing value in `INVENTORY.md` or inspect the stylesheet.
   Reuse an existing primitive when it matches; do not approximate values.
2. Add a typed DTCG leaf, then a semantic alias if the value has an application
   role. For example, `{"$type":"color","$value":"{color.palette.hex-102a3b}"}`.
3. Run the generator and replace exact literals with the generated property.
   Keep app-level variable names and Tailwind theme names as adapters.
4. Run `--check`, the affected app build and its Playwright suite. Review
   screenshots when changing values; this migration only changes their source.
5. Commit the source and both outputs together. Coordinate source changes with
   Swift consumers; never encode CSS syntax as a DTCG dimension or shadow value.

## Inventory and static customer follow-up

`INVENTORY.md` records the pre-refactor colors, spacing, radii, fonts, shadows and
z-index for all admin CSS, showcase CSS/3D theme, customer CSS and landing inline
CSS. It also records values intentionally left local: percentages, context-based
expressions, font shorthands and RGB overlays not represented by a shared token.
Tailwind's own utility scales and component TSX styles are outside this migration.
The 3D `CEILING` is geometry, not a design dimension, and remains unchanged.

Quarkus already serves files directly from
`backend/indooro_server/src/main/resources/META-INF/resources/`; a generated
`design-tokens/tokens.css` copy there would need no backend build changes.
The generator therefore writes and checks that copy, served at
`/design-tokens/tokens.css`. This is the one minimal addition outside the listed
package scope, explicitly requested for static serving. Customer/landing HTML
and existing CSS are unchanged; loading the file and migrating those pages is a
follow-up. The copy is available without changing either page's rendered pixels.
