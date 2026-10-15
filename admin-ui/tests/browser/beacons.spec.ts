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

test("beacon assignment reaches a store beyond the first 100 results", async ({ page }) => {
  const firstStores = Array.from({ length: 100 }, (_, index) => ({ ...store, id: `store-${index}`, storeCode: `S-${index}`, name: `Store ${index}` }));
  const target = { ...store, id: "store-target", storeCode: "TARGET", name: "Target Store" };
  const free = beacon("beacon-free", "FREE-1", 1);
  let assignedStoreId: string | null = null;
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores?*", (route) => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get("page") ?? 0);
    return route.fulfill({ json: { content: pageNumber === 0 ? firstStores : [target], page: pageNumber, size: 100, totalElements: 101 } });
  });
  await page.route("**/api/beacons**", (route) => {
    if (route.request().method() === "POST") {
      assignedStoreId = route.request().postDataJSON().storeId;
      free.currentStore = target;
      return route.fulfill({ json: { beaconId: free.id, storeId: target.id } });
    }
    return route.fulfill({ json: [free] });
  });

  await page.goto("/admin/next/beacons/");
  await page.getByRole("button", { name: "Zuweisen" }).click();
  const targetSelect = page.getByRole("combobox", { name: "Ziel-Store" });
  await expect(targetSelect.locator('option[value="store-target"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Weitere Stores laden (100 von 101)" }).click();
  await expect(targetSelect.locator('option[value="store-target"]')).toHaveCount(1);
  await targetSelect.selectOption(target.id);
  await page.getByRole("button", { name: "Zuweisung bestätigen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Target Store zugewiesen" })).toBeVisible();
  expect(assignedStoreId).toBe(target.id);
});

test("store deep link keeps free beacons visible and preselects its assignment target", async ({ page }) => {
  const free = beacon("beacon-free", "FREE-1", 1);
  const beaconQueries: string[] = [];
  let assignedStoreId: string | null = null;
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [store], page: 0, size: 100, totalElements: 1 } }));
  await page.route("**/api/beacons**", (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      beaconQueries.push(new URL(request.url()).search);
      return route.fulfill({ json: [free] });
    }
    assignedStoreId = request.postDataJSON().storeId;
    free.currentStore = store;
    return route.fulfill({ json: { beaconId: free.id, storeId: store.id } });
  });

  await page.goto("/admin/next/beacons/?storeId=store-1");
  await expect(page.getByRole("combobox", { name: "Store" })).toHaveValue("");
  await expect(page.getByRole("cell", { name: "FREE-1" })).toBeVisible();
  await expect.poll(() => beaconQueries.length > 0).toBe(true);
  expect(beaconQueries.every((query) => !new URLSearchParams(query).has("storeId"))).toBe(true);
  await page.getByRole("button", { name: "Zuweisen" }).click();
  const target = page.getByRole("combobox", { name: "Ziel-Store" });
  await expect(page.getByText("Aus Store-Detail: Ziel-Store LINZ-01 · Indooro Linz")).toBeVisible();
  await expect(target).toHaveValue(store.id);
  await page.getByRole("button", { name: "Zuweisung bestätigen" }).click();
  expect(assignedStoreId).toBe(store.id);
});

test("store deep link resolves an assignment target beyond the first 100 stores without filtering free beacons", async ({ page }) => {
  const firstStores = Array.from({ length: 100 }, (_, index) => ({ ...store, id: `store-${index}`, storeCode: `S-${index}`, name: `Store ${index}` }));
  const target = { ...store, id: "store-target", storeCode: "TARGET", name: "Target Store" };
  const free = beacon("beacon-free", "FREE-1", 1);
  const loadedStorePages: number[] = [];
  let assignedStoreId: string | null = null;
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores?*", (route) => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get("page") ?? 0);
    loadedStorePages.push(pageNumber);
    return route.fulfill({ json: { content: pageNumber === 0 ? firstStores : [target], page: pageNumber, size: 100, totalElements: 101 } });
  });
  await page.route("**/api/beacons**", (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: [free] });
    assignedStoreId = request.postDataJSON().storeId;
    free.currentStore = target;
    return route.fulfill({ json: { beaconId: free.id, storeId: target.id } });
  });

  await page.goto("/admin/next/beacons/?storeId=store-target");
  const storeFilter = page.getByRole("combobox", { name: "Store" });
  await expect(storeFilter).toHaveValue("");
  await expect(page.getByRole("cell", { name: "FREE-1" })).toBeVisible();
  await expect.poll(() => loadedStorePages.includes(1)).toBe(true);
  await page.getByRole("button", { name: "Zuweisen" }).click();
  const targetSelect = page.getByRole("combobox", { name: "Ziel-Store" });
  await expect(page.getByText("Aus Store-Detail: Ziel-Store TARGET · Target Store")).toBeVisible();
  await expect(targetSelect).toHaveValue(target.id);
  await page.getByRole("button", { name: "Zuweisung bestätigen" }).click();
  expect(assignedStoreId).toBe(target.id);
});

test("unavailable store deep link requires an explicit accessible assignment target", async ({ page }) => {
  const free = beacon("beacon-free", "FREE-1", 1);
  let assignedStoreId: string | null = null;
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "region-manager", role: "region-manager", scope: { regionId: "region-1", regionName: "Oberösterreich" } } }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [store], page: 0, size: 100, totalElements: 1 } }));
  await page.route("**/api/beacons**", (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: [free] });
    assignedStoreId = request.postDataJSON().storeId;
    free.currentStore = store;
    return route.fulfill({ json: { beaconId: free.id, storeId: store.id } });
  });

  await page.goto("/admin/next/beacons/?storeId=foreign-store");
  await page.getByRole("button", { name: "Zuweisen" }).click();
  const target = page.getByRole("combobox", { name: "Ziel-Store" });
  await expect(page.getByRole("status")).toContainText("Der Store aus dem Link ist nicht verfügbar oder liegt außerhalb Ihres Zugriffs");
  await expect(target).toHaveValue("");
  await page.getByRole("button", { name: "Zuweisung bestätigen" }).click();
  await expect(target).toHaveValue("");
  expect(assignedStoreId).toBeNull();
  await target.selectOption(store.id);
  await page.getByRole("button", { name: "Zuweisung bestätigen" }).click();
  expect(assignedStoreId).toBe(store.id);
});

test("beacon inventory shows empty state and retries load failures", async ({ page }) => {
  let inventoryCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [], page: 0, size: 100, totalElements: 0 } }));
  await page.route("**/api/beacons**", (route) => {
    if (route.request().method() !== "GET") throw new Error("Unexpected write during inventory loading");
    inventoryCalls += 1;
    return inventoryCalls === 1
      ? route.fulfill({ status: 503, json: { error: "Inventar vorübergehend nicht verfügbar" } })
      : route.fulfill({ json: [] });
  });
  await page.goto("/admin/next/beacons/");
  await expect(page.getByRole("alert")).toContainText("Serverfehler");
  await page.getByRole("button", { name: "Erneut laden" }).click();
  await expect(page.getByText("Keine Beacons passen zu Suche, Filtern oder Zugriff.")).toBeVisible();
  expect(inventoryCalls).toBe(2);
});

test("failed Beacon reload hides stale rows and mutation controls until retry", async ({ page }) => {
  let inventoryCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [], page: 0, size: 100, totalElements: 0 } }));
  await page.route("**/api/beacons?*", (route) => {
    inventoryCalls += 1;
    return inventoryCalls === 2
      ? route.fulfill({ status: 503, json: { error: "Inventar vorübergehend nicht verfügbar" } })
      : route.fulfill({ json: [beacon("stale-1", "STALE-1", 1)] });
  });
  await page.goto("/admin/next/beacons/");
  await expect(page.getByRole("cell", { name: "STALE-1" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Suche" }).fill("STALE");
  await expect(page.getByRole("alert")).toContainText("Serverfehler");
  await expect(page.getByRole("cell", { name: "STALE-1" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bearbeiten" })).toHaveCount(0);
  await page.getByRole("button", { name: "Erneut laden" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("cell", { name: "STALE-1" })).toBeVisible();
  expect(inventoryCalls).toBe(3);
});

test("Beacon inventory preserves legacy Code, UUID, and Store sorting", async ({ page }) => {
  const records = [
    { ...beacon("sort-1", "B-1", 1), uuid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    { ...beacon("sort-2", "B-2", 2, { ...store, storeCode: "Z-01" }), uuid: "cccccccccccccccccccccccccccccccc" },
    { ...beacon("sort-3", "B-10", 3, { ...store, storeCode: "A-01" }), uuid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  ];
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [store], page: 0, size: 100, totalElements: 1 } }));
  await page.route("**/api/beacons?*", (route) => route.fulfill({ json: records }));
  await page.goto("/admin/next/beacons/");
  await expect(page.getByRole("button", { name: "Bulk anlegen" })).toBeInViewport();
  await expect.poll(() => page.evaluate(() => {
    const panel = document.querySelector(".beacons-page .panel");
    return panel ? panel.getBoundingClientRect().right <= window.innerWidth : false;
  })).toBe(true);
  const codes = () => page.locator(".beacons-page table tbody tr td:first-child strong").allTextContents();
  await expect(page.getByRole("combobox", { name: "Sortierung" })).toHaveValue("beaconCode");
  await expect.poll(codes).toEqual(["B-1", "B-2", "B-10"]);
  await page.getByRole("combobox", { name: "Sortierung" }).selectOption("uuid");
  await expect.poll(codes).toEqual(["B-10", "B-1", "B-2"]);
  await page.getByRole("combobox", { name: "Sortierung" }).selectOption("storeCode");
  await expect.poll(codes).toEqual(["B-10", "B-2", "B-1"]);
});

test("admin can create a beacon with keyboard controls and see the saved row", async ({ page }) => {
  const records: ReturnType<typeof beacon>[] = [];
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [], page: 0, size: 100, totalElements: 0 } }));
  await page.route("**/api/beacons**", (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: records });
    const body = request.postDataJSON();
    const created = { ...beacon("keyboard-beacon", body.beaconCode, body.minor), uuid: body.uuid, major: body.major, identityKey: `${body.uuid}:${body.major}:${body.minor}`, notes: body.notes };
    records.push(created);
    return route.fulfill({ json: created });
  });
  await page.goto("/admin/next/beacons/");
  await page.getByRole("button", { name: "Beacon anlegen" }).focus();
  await page.keyboard.press("Enter");
  const code = page.getByRole("textbox", { name: "Beacon-Code" });
  await code.focus();
  await page.keyboard.type("KB-01");
  const uuidField = page.getByRole("textbox", { name: "UUID" });
  await uuidField.focus();
  await page.keyboard.type(uuid);
  await page.getByRole("button", { name: "Speichern" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("cell", { name: "KB-01" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Beacon wurde angelegt.");
});
