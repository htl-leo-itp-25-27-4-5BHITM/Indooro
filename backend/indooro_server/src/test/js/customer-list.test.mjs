import assert from "node:assert/strict";
import test from "node:test";
import {
  addItem,
  deserialize,
  planList,
  removeItem,
  serialize,
  toggleDone
} from "../../main/resources/META-INF/resources/customer/list.js";
import { fixtureLayout } from "./customer-fixture.mjs";

const milch = { id: 1, name: "Milch", layoutCode: "800/1/3/2", price: 1.2 };
const mehl = { id: 2, name: "Mehl", layoutCode: "310/2/1/1" };
const unbekannt = { id: 3, name: "Unbekannt", layoutCode: "999/9/1/1" };

test("addItem appends a new item as not done and returns a new array", () => {
  const before = [];
  const after = addItem(before, milch);
  assert.notEqual(after, before);
  assert.deepEqual(after, [{ ...milch, done: false }]);
  assert.deepEqual(before, []);
});

test("addItem ignores duplicate product ids and keeps the same content", () => {
  const list = addItem([], milch);
  const again = addItem(list, { ...milch, name: "Anderer Name" });
  assert.notEqual(again, list);
  assert.deepEqual(again, list);
});

test("removeItem drops the matching id only", () => {
  const list = addItem(addItem([], milch), mehl);
  assert.deepEqual(removeItem(list, 1).map((item) => item.id), [2]);
  assert.equal(list.length, 2, "original untouched");
});

test("toggleDone flips the done flag and keeps booleans", () => {
  const list = addItem([], milch);
  const done = toggleDone(list, 1);
  assert.equal(done[0].done, true);
  assert.equal(list[0].done, false, "original untouched");
  assert.equal(toggleDone(done, 1)[0].done, false);
  assert.deepEqual(toggleDone(list, 99), list);
});

test("planList routes open items nearest-first from the entrance", () => {
  const list = [milch, mehl].reduce(addItem, []);
  const plan = planList(list, fixtureLayout);
  assert.deepEqual(plan.entries.map((entry) => entry.item.id), [2, 1]);
  assert.equal(plan.entries[0].text.primary, "Regal 2");
  assert.equal(plan.entries[0].text.detail, "1. Boden von unten · Position 1");
  assert.equal(plan.entries[1].text.primary, "Gang 4 · links · Backzutaten");
  assert.equal(plan.entries[0].done, false);
  assert.equal(plan.legs.length, 2);
  assert.deepEqual(plan.legs[0][0], { x: 1, y: 19 }, "starts at the entrance cell");
  assert.deepEqual(plan.notFound, []);
});

test("planList uses an explicit start point", () => {
  const list = [milch, mehl].reduce(addItem, []);
  const plan = planList(list, fixtureLayout, { x: 19, y: 0 });
  assert.deepEqual(plan.legs[0][0], { x: 19, y: 0 });
});

test("planList puts done items after open ones and keeps their original order", () => {
  const list = [milch, mehl].reduce(addItem, []);
  const doneMehl = toggleDone(list, 2);
  const plan = planList(doneMehl, fixtureLayout);
  assert.deepEqual(plan.entries.map((entry) => entry.item.id), [1, 2]);
  assert.equal(plan.entries[1].done, true);
  assert.equal(plan.legs.length, 1);
});

test("planList lists items without a shelf as notFound at the end", () => {
  const list = [milch, unbekannt, mehl].reduce(addItem, []);
  const plan = planList(list, fixtureLayout);
  assert.deepEqual(plan.entries.map((entry) => entry.item.id), [2, 1, 3]);
  const last = plan.entries.at(-1);
  assert.equal(last.shelf, null);
  assert.equal(last.text, null);
  assert.equal(last.cell, null);
  assert.deepEqual(plan.notFound.map((item) => item.id), [3]);
});

test("planList of an empty list is empty", () => {
  assert.deepEqual(planList([], fixtureLayout), { entries: [], legs: [], notFound: [] });
});

test("serialize and deserialize round-trip the list", () => {
  const list = toggleDone([milch, mehl].reduce(addItem, []), 1);
  assert.deepEqual(deserialize(serialize(list)), list);
});

test("deserialize returns an empty list for garbage", () => {
  assert.deepEqual(deserialize("{kaputt"), []);
  assert.deepEqual(deserialize("42"), []);
  assert.deepEqual(deserialize("null"), []);
  assert.deepEqual(deserialize('{"id":1}'), []);
  assert.deepEqual(deserialize(undefined), []);
});

test("deserialize keeps only valid, unique entries", () => {
  const raw = JSON.stringify([
    { id: 1, name: "Milch", layoutCode: "800/1/3/2" },
    { name: "ohne id", layoutCode: "310/2/1/1" },
    null,
    "text",
    { id: 2, name: 3, layoutCode: "310/2/1/1" },
    { id: 1, name: "Doppelt", layoutCode: "800/1/3/2" },
    { id: "a", name: "Brot", layoutCode: "310/2/1/1", done: true }
  ]);
  assert.deepEqual(deserialize(raw), [
    { id: 1, name: "Milch", layoutCode: "800/1/3/2", done: false },
    { id: "a", name: "Brot", layoutCode: "310/2/1/1", done: true }
  ]);
});
