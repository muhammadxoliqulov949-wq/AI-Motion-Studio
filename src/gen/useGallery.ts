"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteGen, type GenItem, listGen, saveGen } from "./store";

export interface GalleryItem extends GenItem {
  /** Object URL of the blob, valid while the studio is open. */
  url: string;
}

/** The gallery with ready-to-use object URLs; items added during the session appear immediately. */
export function useGallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [ready, setReady] = useState(false);
  const urls = useRef(new Map<string, string>());

  const withUrl = useCallback((item: GenItem): GalleryItem => {
    let url = urls.current.get(item.id);
    if (!url) {
      url = URL.createObjectURL(item.blob);
      urls.current.set(item.id, url);
    }
    return { ...item, url };
  }, []);

  useEffect(() => {
    let alive = true;
    const map = urls.current;
    void listGen().then((all) => {
      if (!alive) return;
      setItems(all.map(withUrl));
      setReady(true);
    });
    return () => {
      alive = false;
      map.forEach((u) => URL.revokeObjectURL(u));
      map.clear();
    };
  }, [withUrl]);

  const add = useCallback(
    async (item: GenItem) => {
      const full = withUrl(item);
      setItems((xs) => [full, ...xs]);
      await saveGen(item);
      return full;
    },
    [withUrl],
  );

  const remove = useCallback(async (id: string) => {
    const url = urls.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      urls.current.delete(id);
    }
    setItems((xs) => xs.filter((x) => x.id !== id));
    await deleteGen(id);
  }, []);

  return { items, ready, add, remove };
}
