import { expect, test } from "@playwright/test";

const uuid = "fda50693a4e24fb1afcfc6eb07647825";
const store = { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz", status: "ACTIVE", region: { id: "region-1", name: "Oberösterreich" } };

function beacon(id: string, beaconCode: string, minor: number, currentStore: typeof store | null = null) {
  return { id, beaconCode, uuid, major: 1, minor, identityKey: `${uuid}:1:${minor}`, status: "ACTIVE", notes: null, currentStore, createdAt: "", updatedAt: "" };
}

test("admin validates, creates, edits, bulk reviews, assigns, releases, and archives beacons", async ({ page }) => {
  const records: ReturnType<typeof beacon>[] = [];
  const writes: Array<{ method: string; url: string; body: unknown }> = [];
  let nextId = 1;
  await page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [store], page: 0, size: 100, totalElements: 1 } }));
  await page.route("**/api/beacons**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const parts = url.pathname.split("/");
    const id = parts.at(-1) === "assign" || parts.at(-1) === "release" || parts.at(-1) === "archive" ? parts.at(-2)! : parts.at(-1)!;
    const body = request.postDataJSON();
    if (method === "GET") {
      const status = url.searchParams.get("status") ?? "ACTIVE";
      return route.fulfill({ json: records.filter((item) => item.status === status) });
    }
    writes.push({ method, url: url.pathname, body });
    if (method === "POST" && url.pathname === "/api/beacons/bulk") {
      const result = body.items.map((item: { beaconCode: string; minor: number }) => {
        const created = { ...beacon(`beacon-${nextId++}`, item.beaconCode, item.minor), notes: body.notes };
        records.push(created);
        return created;
      });
      return route.fulfill({ json: { created: result.length, items: result } });
    }
    if (method === "POST" && url.pathname === "/api/beacons") {
      const created = { ...beacon(`beacon-${nextId++}`, body.beaconCode, body.minor), uuid: body.uuid, major: body.major, identityKey: `${body.uuid}:${body.major}:${body.minor}`, notes: body.notes };
      records.push(created);
      return route.fulfill({ json: created });
    }
    const record = records.find((item) => item.id === id)!;
    if (method === "PUT") {
      Object.assign(record, body, { identityKey: `${body.uuid}:${body.major}:${body.minor}` });
      return route.fulfill({ json: record });
    }
    if (url.pathname.endsWith("/assign")) {
      record.currentStore = store;
      return route.fulfill({ json: { beaconId: id, storeId: store.id, isActive: true } });
    }
    if (url.pathname.endsWith("/release")) {
      record.currentStore = null;
      return route.fulfill({ json: { beaconId: id, released: true } });
    }
    if (url.pathname.endsWith("/archive")) {
      record.currentStore = null;
      record.status = "ARCHIVED";
      return route.fulfill({ json: record });
    }
    throw new Error(`Unexpected beacon request: ${method} ${url.pathname}`);
  });

  await page.goto("/admin/next/beacons/");
  await page.getByRole("button", { name: "Beacon anlegen" }).click();
  await page.getByRole("textbox", { name: "Beacon-Code" }).fill("  B-001  ");
  await page.getByRole("textbox", { name: "UUID" }).fill("bad");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText(/UUID muss 32 hexadezimale Zeichen/)).toBeVisible();
  expect(writes).toHaveLength(0);

  await page.getByRole("textbox", { name: "UUID" }).fill(uuid);
  await page.getByRole("textbox", { name: "Major (optional)" }).fill("1");
  await page.getByRole("textbox", { name: "Minor (optional)" }).fill("2");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("B-001", { exact: true })).toBeVisible();
  expect(writes[0]).toMatchObject({ method: "POST", url: "/api/beacons", body: { beaconCode: "B-001", uuid, major: 1, minor: 2 } });

  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await page.getByRole("textbox", { name: "Notizen" }).fill("Eingang Nord");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Eingang Nord")).toBeVisible();
  expect(writes[1].method).toBe("PUT");

  await page.getByRole("button", { name: "Zuweisen" }).click();
  await page.getByRole("combobox", { name: "Ziel-Store" }).selectOption("store-1");
  await page.getByRole("button", { name: "Zuweisung bestätigen" }).click();
  await expect(page.getByText("Zugewiesen · LINZ-01")).toBeVisible();
  await page.getByRole("button", { name: "Freigeben" }).click();
  await expect(page.getByRole("cell", { name: "Frei" })).toBeVisible();
  await page.getByRole("button", { name: "Archivieren" }).click();
  await page.getByRole("combobox", { name: "Status" }).selectOption("ARCHIVED");
  await expect(page.getByRole("cell", { name: "Archiviert" })).toBeVisible();
  expect(writes.map((entry) => entry.url)).toEqual([
    "/api/beacons", "/api/beacons/beacon-1", "/api/beacons/beacon-1/assign", "/api/beacons/beacon-1/release", "/api/beacons/beacon-1/archive"
  ]);

  await page.getByRole("button", { name: "Bulk anlegen" }).click();
  await page.getByRole("textbox", { name: "Gemeinsame UUID" }).fill(uuid);
  await page.getByRole("textbox", { name: "Gemeinsamer Major" }).fill("1");
  await page.getByRole("textbox", { name: /Zeilen im Format/ }).fill("B-002,2\nB-003,2");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByText(/kommt in dieser Liste mehrfach vor/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Review bestätigen/ })).toBeDisabled();
  await page.getByRole("textbox", { name: /Zeilen im Format/ }).fill("B-002,3\nB-003,4");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("button", { name: /Review bestätigen und 2 anlegen/ })).toBeEnabled();
  await page.getByRole("button", { name: /Review bestätigen und 2 anlegen/ }).click();
  expect(writes.at(-1)).toMatchObject({ method: "POST", url: "/api/beacons/bulk", body: { uuid, major: 1, items: [{ beaconCode: "B-002", minor: 3 }, { beaconCode: "B-003", minor: 4 }] } });
});

test("scoped staff can assign within scope but cannot create or bulk create", async ({ page }) => {
  const assigned = beacon("scoped-1", "SCOPED-1", 2, store);
  let writes = 0;
  await page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "region-manager", role: "region-manager", scope: { regionId: "region-1", regionName: "Oberösterreich" } } }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [store], page: 0, size: 100, totalElements: 1 } }));
  await page.route("**/api/beacons**", (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET") return route.fulfill({ json: [assigned].filter((item) => item.status === (url.searchParams.get("status") ?? "ACTIVE")) });
    writes += 1;
    if (url.pathname.endsWith("/assign")) return route.fulfill({ json: { beaconId: assigned.id } });
    return route.fulfill({ status: 403, json: { error: "Forbidden" } });
  });
  await page.goto("/admin/next/beacons/");
  await expect(page.getByRole("button", { name: "Beacon anlegen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bulk anlegen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bearbeiten" })).toHaveCount(1);
  await page.getByRole("button", { name: "Verschieben" }).click();
  await expect(page.getByRole("option", { name: /WIEN-01/ })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Ziel-Store" }).selectOption("store-1");
  await page.getByRole("button", { name: "Zuweisung bestätigen" }).click();
  await expect(page.getByRole("button", { name: "Freigeben" })).toBeVisible();
  expect(writes).toBe(1);
});
