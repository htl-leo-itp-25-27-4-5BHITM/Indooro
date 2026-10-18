import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePlanCsv, planToElements, PLAN_MAX_BYTES, PLAN_MAX_ROWS, type PlanBeacon } from "./planImport";
import { applyCommand, createEditorState, isDirty, undo, type EditorCommand, type LayoutDocument, type LayoutElement } from "./model";

// Same grid and base elements as scripts/beacon-planner/export_plan_fixtures.py (INPUT_LAYOUT).
const plannerGrid = (): LayoutDocument => ({
  shopName: "Plan-Fixture",
  gridSize: { width: 20, height: 10 },
  elements: [
    { id: 1, type: "entrance", x: 4, y: 0, width: 3, height: 1, label: "Eingang" },
    { id: 2, type: "shelf", x: 9, y: 4, width: 4, height: 2, category: "310/1", meter: 1, label: "Obst" },
  ],
});

const fixtureUrl = (name: string) => new URL(`../../../scripts/beacon-planner/fixtures/${name}`, import.meta.url);
const readFixture = (name: string) => readFileSync(fixtureUrl(name), "utf8");
const withoutIds = (elements: LayoutElement[]) => elements.map(({ id: _id, ...rest }) => { void _id; return rest; });

const beacon = (minor: number, x: number, y: number): PlanBeacon => ({ minor, x, y, mount: "wall", notes: "" });

test("valid plan: BOM, CRLF, blank lines and quoted fields with commas and quotes", () => {
  const text = "﻿minor,x_m,y_m,mount,notes\r\n1,2.50,1.50,wall,\"Eingang, links\"\r\n\r\n2,12.50,3.00,shelf-top,\"Obst \"\"Kühlung\"\"\"\r\n3,19.00,9.50,checkout-top,Kasse\r\n";
  const result = parsePlanCsv(text);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.beacons, [
    { minor: 1, x: 2.5, y: 1.5, mount: "wall", notes: "Eingang, links" },
    { minor: 2, x: 12.5, y: 3, mount: "shelf-top", notes: "Obst \"Kühlung\"" },
    { minor: 3, x: 19, y: 9.5, mount: "checkout-top", notes: "Kasse" },
  ]);
});

test("the checked-in planner CSV parses to the same beacons the planner wrote", () => {
  const result = parsePlanCsv(readFixture("beacons-plan.sample.csv"));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.beacons.map((item) => item.minor), [1, 2, 3]);
  assert.deepEqual(result.beacons.map((item) => [item.x, item.y]), [[2.5, 1.5], [12.5, 3], [19, 9.5]]);
  assert.equal(result.beacons[1].notes, "Obst \"Kuehlung\"");
});

test("a file with only the header and blank rows is an empty import, not an error list", () => {
  assert.deepEqual(parsePlanCsv("minor,x_m,y_m,mount,notes\n\n,,,,\n"), { beacons: [], errors: [] });
});

test("errors are reported in German with the line number and block the whole import", () => {
  const cases: Array<[string, string]> = [
    ["falscher Header", "minor,x,y,mount,notes\n1,1,1,wall,\n"],
    ["Header in anderer Reihenfolge", "x_m,minor,y_m,mount,notes\n1,1,1,wall,\n"],
    ["fehlende Spalte", "minor,x_m,y_m,mount,notes\n1,1,1,wall\n"],
    ["Komma-Dezimalzahl", "minor,x_m,y_m,mount,notes\n1,\"12,50\",3,wall,\n"],
    ["Text als Koordinate", "minor,x_m,y_m,mount,notes\n1,abc,3,wall,\n"],
    ["Infinity als Koordinate", "minor,x_m,y_m,mount,notes\n1,Infinity,3,wall,\n"],
    ["unendlich große Zahl", `minor,x_m,y_m,mount,notes\n1,${"9".repeat(400)},3,wall,\n`],
    ["negative Koordinate", "minor,x_m,y_m,mount,notes\n1,1,1,wall,\n2,-0.5,1,wall,\n"],
    ["minor null", "minor,x_m,y_m,mount,notes\n0,1,1,wall,\n"],
    ["minor mit Nachkommastelle", "minor,x_m,y_m,mount,notes\n1.5,1,1,wall,\n"],
    ["minor über 65535", "minor,x_m,y_m,mount,notes\n65536,1,1,wall,\n"],
    ["doppelte minor", "minor,x_m,y_m,mount,notes\n1,1,1,wall,\n\n2,2,2,wall,\n1,3,3,wall,\n"],
    ["nicht geschlossenes Anführungszeichen", "minor,x_m,y_m,mount,notes\n1,1,1,wall,\"offen\n"],
  ];
  for (const [label, text] of cases) {
    const result = parsePlanCsv(text);
    assert.equal(result.beacons.length, 0, label);
    assert.ok(result.errors.length >= 1, label);
    assert.match(result.errors[0], /Zeile \d+|Kopfzeile|Datei|Anführungszeichen/, label);
  }
  assert.deepEqual(parsePlanCsv("minor,x_m,y_m,mount,notes\n1,1,1,wall,\n1,3,3,wall,\n").errors, ["Zeile 3: minor 1 ist bereits in Zeile 2 vergeben."]);
  assert.deepEqual(parsePlanCsv("minor,x_m,y_m,mount,notes\n1,1,1,wall,\n2,-0.5,1,wall,\n").errors, ["Zeile 3: x_m darf nicht negativ sein."]);
  assert.deepEqual(parsePlanCsv("minor,x_m,y_m,mount,notes\n1,1,1,wall,x,y\n").errors, ["Zeile 2: 5 Spalten erwartet, gefunden 6."]);
  assert.match(parsePlanCsv("x_m,minor,y_m,mount,notes\n").errors[0], /^Zeile 1: Die Kopfzeile muss exakt/);
  assert.deepEqual(parsePlanCsv("").errors, ["Die Datei ist leer."]);
});

test("more than 500 beacons and files above 1 MB are rejected", () => {
  const rows = Array.from({ length: PLAN_MAX_ROWS + 1 }, (_, index) => `${index + 1},1,1,wall,`).join("\n");
  assert.deepEqual(parsePlanCsv(`minor,x_m,y_m,mount,notes\n${rows}\n`).errors, [`Höchstens ${PLAN_MAX_ROWS} Beacons pro Datei (gefunden: ${PLAN_MAX_ROWS + 1}).`]);
  const exactly = Array.from({ length: PLAN_MAX_ROWS }, (_, index) => `${index + 1},1,1,wall,`).join("\n");
  assert.equal(parsePlanCsv(`minor,x_m,y_m,mount,notes\n${exactly}\n`).beacons.length, PLAN_MAX_ROWS);
  const huge = `minor,x_m,y_m,mount,notes\n${"1,1,1,wall,".padEnd(PLAN_MAX_BYTES + 1, " ")}`;
  assert.deepEqual(parsePlanCsv(huge).errors, ["Die Datei ist größer als 1 MB."]);
});

test("planToElements reproduces the planner's layout patch elements (checked-in fixture, IDs ignored)", () => {
  const expected = JSON.parse(readFixture("plan-elements.sample.json")) as LayoutElement[];
  const parsed = parsePlanCsv(readFixture("beacons-plan.sample.csv"));
  const result = planToElements(plannerGrid(), parsed.beacons);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(withoutIds(result.elements), withoutIds(expected));
  // Planner IDs continue after the largest existing ID (2): 3, 4, 5.
  assert.deepEqual(result.elements.map((element) => element.id), [3, 4, 5]);
});

test("planToElements writes the placeholder identity exactly like the planner patch", () => {
  const [element] = planToElements(plannerGrid(), [beacon(7, 12.5, 3)]).elements;
  assert.deepEqual(element, {
    id: 3, type: "beacon", beaconId: "Indooro7", beaconUUID: "00000000-0000-0000-0000-000000000000",
    beaconMajor: 1, beaconMinor: 7, x: 12.5, y: 3, meter: 7, category: "undefined/7",
  });
  assert.equal("planned" in element, false);
});

test("planToElements rounds to centimetres and reports positions outside the grid instead of clipping them", () => {
  const ok = planToElements(plannerGrid(), [beacon(1, 12.346, 9.999)]);
  assert.equal(ok.elements[0].x, 12.35);
  assert.equal(ok.elements[0].y, 10);
  const outside = planToElements(plannerGrid(), [beacon(1, 1, 1), beacon(2, 20.5, 3), beacon(3, 1, 10.01)]);
  assert.deepEqual(outside.elements, []);
  assert.deepEqual(outside.errors, [
    "minor 2: Position x 20.5 / y 3 liegt außerhalb des Rasters 20 × 10.",
    "minor 3: Position x 1 / y 10.01 liegt außerhalb des Rasters 20 × 10.",
  ]);
});

test("beacons whose placeholder ID already exists are skipped and reported", () => {
  const document: LayoutDocument = { ...plannerGrid(), elements: [...plannerGrid().elements, { id: 9, type: "beacon", x: 1, y: 1, beaconId: "Indooro2" }] };
  const result = planToElements(document, [beacon(1, 1, 1), beacon(2, 5, 5)]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.skipped, ["Indooro2"]);
  assert.deepEqual(result.elements.map((element) => element.beaconId), ["Indooro1"]);
  assert.equal(result.elements[0].id, 10);
});

test("planToElements refuses an import that would exceed 5000 elements", () => {
  const document: LayoutDocument = { ...plannerGrid(), elements: Array.from({ length: 4999 }, (_, index) => ({ id: index + 1, type: "poi", x: 0, y: 0 })) };
  const result = planToElements(document, [beacon(1, 1, 1), beacon(2, 2, 2)]);
  assert.deepEqual(result.elements, []);
  assert.match(result.errors[0], /Höchstens 5000 Elemente/);
});

test("createMany adds every beacon in one undoable step and keeps exact coordinates", () => {
  const plan = planToElements(plannerGrid(), parsePlanCsv(readFixture("beacons-plan.sample.csv")).beacons).elements;
  let state = createEditorState(plannerGrid());
  state = applyCommand(state, { type: "createMany", elements: plan }, 1, true);
  assert.equal(state.document.elements.length, 5);
  assert.equal(state.past.length, 1);
  assert.equal(isDirty(state), true);
  assert.deepEqual(state.document.elements.slice(2).map((element) => [element.x, element.y]), [[2.5, 1.5], [12.5, 3], [19, 9.5]]);
  state = undo(state);
  assert.equal(state.document.elements.length, 2);
  assert.equal(state.past.length, 0);
  assert.equal(isDirty(state), false);
});

test("createMany clamps to the grid and rejects the whole batch on a repeated ID or the 5000 limit", () => {
  const state = createEditorState(plannerGrid());
  const clamped = applyCommand(state, { type: "createMany", elements: [{ id: 3, type: "beacon", x: 25, y: -2 }] });
  assert.deepEqual([clamped.document.elements[2].x, clamped.document.elements[2].y], [20, 0]);
  const repeated: EditorCommand = { type: "createMany", elements: [{ id: 3, type: "beacon", x: 1, y: 1 }, { id: 2, type: "beacon", x: 1, y: 1 }] };
  assert.equal(applyCommand(state, repeated), state);
  const twice: EditorCommand = { type: "createMany", elements: [{ id: 3, type: "beacon", x: 1, y: 1 }, { id: 3, type: "beacon", x: 2, y: 2 }] };
  assert.equal(applyCommand(state, twice), state);
  assert.equal(applyCommand(state, { type: "createMany", elements: [] }), state);
  const full: LayoutDocument = { ...plannerGrid(), elements: Array.from({ length: 5000 }, (_, index) => ({ id: index + 1, type: "poi", x: 0, y: 0 })) };
  const fullState = createEditorState(full);
  assert.equal(applyCommand(fullState, { type: "createMany", elements: [{ id: 5001, type: "beacon", x: 1, y: 1 }] }), fullState);
});
