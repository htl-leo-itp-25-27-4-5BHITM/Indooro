/**
 * IndexedDB persistence (raw API, no dependency). Database "indooro-positioning-lab":
 *   campaigns (keyPath id), runs (keyPath id, index campaignId), results (keyPath id, index campaignId).
 * Deleting a campaign deletes its runs and results in ONE transaction. Deleting a run also deletes the
 * saved evaluations computed on it (they would otherwise reference data that no longer exists).
 */
import type { Campaign, EvaluationResult, MeasurementRun } from "../core/types";

export const DB_NAME = "indooro-positioning-lab";
export const DB_VERSION = 1;

export interface SavedEvaluation {
  id: string;
  campaignId: string;
  label: string;
  result: EvaluationResult;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB ist in dieser Umgebung nicht verfügbar."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("campaigns")) db.createObjectStore("campaigns", { keyPath: "id" });
      if (!db.objectStoreNames.contains("runs")) {
        db.createObjectStore("runs", { keyPath: "id" }).createIndex("campaignId", "campaignId", { unique: false });
      }
      if (!db.objectStoreNames.contains("results")) {
        db.createObjectStore("results", { keyPath: "id" }).createIndex("campaignId", "campaignId", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB konnte nicht geöffnet werden."));
    req.onblocked = () => reject(new Error("IndexedDB ist durch einen anderen Tab blockiert."));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaktion abgebrochen."));
  });
}

async function getAll<T>(storeName: string, indexName?: string, key?: IDBValidKey): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const source = indexName ? store.index(indexName) : store;
  return wrap(key !== undefined ? source.getAll(key) : source.getAll()) as Promise<T[]>;
}

async function put(storeName: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  await done(tx);
}

function byCreated<T extends { createdAt?: string; id: string }>(a: T, b: T): number {
  return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id);
}

export const store = {
  async listCampaigns(): Promise<Campaign[]> {
    const all = await getAll<Campaign>("campaigns");
    return all.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.id.localeCompare(b.id));
  },

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const db = await openDb();
    return (await wrap(db.transaction("campaigns", "readonly").objectStore("campaigns").get(id))) as Campaign | undefined;
  },

  saveCampaign(c: Campaign): Promise<void> {
    return put("campaigns", c);
  },

  /** Deletes the campaign together with all its runs and saved evaluations (single transaction). */
  async deleteCampaign(id: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(["campaigns", "runs", "results"], "readwrite");
    tx.objectStore("campaigns").delete(id);
    for (const name of ["runs", "results"] as const) {
      const s = tx.objectStore(name);
      const keysReq = s.index("campaignId").getAllKeys(id);
      keysReq.onsuccess = () => {
        for (const k of keysReq.result) s.delete(k);
      };
    }
    await done(tx);
  },

  async listRuns(campaignId: string): Promise<MeasurementRun[]> {
    return (await getAll<MeasurementRun>("runs", "campaignId", campaignId)).sort(byCreated);
  },

  async getRun(id: string): Promise<MeasurementRun | undefined> {
    const db = await openDb();
    return (await wrap(db.transaction("runs", "readonly").objectStore("runs").get(id))) as MeasurementRun | undefined;
  },

  saveRun(r: MeasurementRun): Promise<void> {
    return put("runs", r);
  },

  /** Deletes a run and the saved evaluations that were computed on it. */
  async deleteRun(id: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(["runs", "results"], "readwrite");
    tx.objectStore("runs").delete(id);
    const results = tx.objectStore("results");
    const cursorReq = results.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      if ((cursor.value as SavedEvaluation).result?.runId === id) cursor.delete();
      cursor.continue();
    };
    await done(tx);
  },

  async listResults(campaignId: string): Promise<SavedEvaluation[]> {
    const all = await getAll<SavedEvaluation>("results", "campaignId", campaignId);
    return all.sort((a, b) => (a.result?.computedAt ?? "").localeCompare(b.result?.computedAt ?? "") || a.id.localeCompare(b.id));
  },

  saveResult(r: SavedEvaluation): Promise<void> {
    return put("results", r);
  },

  async deleteResult(id: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction("results", "readwrite");
    tx.objectStore("results").delete(id);
    await done(tx);
  },

  /** Removes every record (used by "Alle Daten löschen" and tests). */
  async clearAll(): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(["campaigns", "runs", "results"], "readwrite");
    for (const n of ["campaigns", "runs", "results"] as const) tx.objectStore(n).clear();
    await done(tx);
  },

  /** Closes the connection (the next call re-opens it). */
  async close(): Promise<void> {
    if (!dbPromise) return;
    const db = await dbPromise.catch(() => null);
    db?.close();
    dbPromise = null;
  },
};
