"use client";

/** The studio's gallery: generated images and videos kept in this browser (IndexedDB, own database). */

export interface GenItem {
  id: string;
  kind: "image" | "video";
  createdAt: number;
  prompt: string;
  model: string;
  aspect: string;
  blob: Blob;
  /** Free-form details shown in the gallery (camera move, length …). */
  meta?: Record<string, string | number | boolean>;
}

const DB = "ams-gen";
const STORE = "items";

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
};

export const saveGen = async (item: GenItem) => {
  try {
    await run("readwrite", (s) => s.put(item));
    return true;
  } catch (err) {
    console.warn("Gallery save failed", err);
    return false;
  }
};

export const listGen = async (): Promise<GenItem[]> => {
  try {
    const all = await run("readonly", (s) => s.getAll() as IDBRequest<GenItem[]>);
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
};

export const deleteGen = async (id: string) => {
  try {
    await run("readwrite", (s) => s.delete(id));
  } catch {
    /* already gone */
  }
};
