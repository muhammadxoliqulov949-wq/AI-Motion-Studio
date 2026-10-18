/**
 * Keeps uploaded media in IndexedDB so a project survives a page reload
 * (object URLs die with the tab). Everything stays in the user's browser.
 */
import type { MediaAsset } from "./types";

const DB = "ams-media";
const STORE = "files";

interface Row {
  id: string;
  asset: Omit<MediaAsset, "src">;
  blob: Blob;
}

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const tx = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
};

export const saveMedia = async (asset: MediaAsset, blob: Blob) => {
  try {
    const { src: _src, proxySrc: _proxy, ...meta } = asset;
    void _src;
    void _proxy;
    await tx("readwrite", (s) => s.put({ id: asset.id, asset: meta, blob } satisfies Row));
  } catch (err) {
    console.warn("Media could not be stored for reload", err);
  }
};

/** Restores stored uploads with fresh object URLs. */
export const loadMedia = async (): Promise<MediaAsset[]> => {
  try {
    const rows = await tx<Row[]>("readonly", (s) => s.getAll() as IDBRequest<Row[]>);
    return rows.map((r) => ({ ...r.asset, src: URL.createObjectURL(r.blob) }) as MediaAsset);
  } catch {
    return [];
  }
};

export const clearMedia = async () => {
  try {
    await tx("readwrite", (s) => s.clear());
  } catch {
    /* ignore */
  }
};
