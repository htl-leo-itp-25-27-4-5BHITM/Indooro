## Decisions

1. **No framework**: ES modules, one `index.html`, `app.js` split into `api.js`, `layout.js`, `route.js`, `shelf-text.js`, `list.js`; testable pure modules with `node --test`.
2. **Shelf text**: same rule as `ShelfLocationDescriptor` (label primary, „<fach>. Boden von unten · Position <reihe>“); shared test vectors copied from the Swift tests.
3. **Route**: grid A* on the layout (1 m cells, shelves blocked incl. rotation) and nearest-neighbor order from the entrance or anchor; no live positioning.
4. **Map**: SVG, pinch-zoom via CSS transform, highlighted target shelf, route polyline.
5. **QR**: `?store=` selects the store; `&a=` sets the start point to the anchor.
