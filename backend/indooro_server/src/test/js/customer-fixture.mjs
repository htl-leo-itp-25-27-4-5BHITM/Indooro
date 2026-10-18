// Shared small store layout for the customer-* node tests (1 cell = 1 m).
// Entrance bottom-left, shelf s1 (800/1) on row 4, shelf s2 (310/2) on column 12,
// a wall on row 8 that forces routes to pass through x >= 8, anchor E1 top-middle.
export const fixtureLayout = {
  shopName: "Testmarkt",
  gridSize: { width: 20, height: 20 },
  elements: [
    { id: "ent", type: "entrance", x: 0, y: 19, width: 2, height: 1 },
    { id: "s1", type: "shelf", x: 2, y: 4, width: 6, height: 1, category: "800/1", label: "Gang 4 · links · Backzutaten" },
    { id: "s2", type: "shelf", x: 12, y: 10, width: 1, height: 6, category: "310/2" },
    { id: "w1", type: "wall", x: 0, y: 8, width: 8, height: 1 },
    { id: "e1", type: "anchor", x: 10, y: 2, width: 1, height: 1, anchorId: "E1" }
  ]
};
