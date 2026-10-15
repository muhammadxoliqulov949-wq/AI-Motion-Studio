import { useEffect, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { FONTS, type FontEntry } from "./fonts";

const cache = new Map<string, Promise<void>>();
const ready = new Set<string>();

export const findFont = (family: string | undefined): FontEntry | undefined =>
  family ? FONTS.find((f) => f.family === family) : undefined;

/** Loads a catalog font once (latin + latin-ext + cyrillic when available). */
export const loadFontFamily = (family: string): Promise<void> => {
  const entry = findFont(family);
  if (!entry) return Promise.resolve();
  let p = cache.get(family);
  if (!p) {
    p = entry
      .load()
      .then((mod) =>
        mod
          .loadFont("normal", {
            weights: entry.weights,
            subsets: entry.subsets.filter((s) => s !== "cyrillic-ext"),
            ignoreTooManyRequestsWarning: true,
          })
          .waitUntilDone(),
      )
      .then(() => {
        ready.add(family);
      })
      .catch((err) => {
        console.warn(`Font ${family} failed to load`, err);
      });
    cache.set(family, p);
  }
  return p;
};

export const isFontReady = (family: string) => ready.has(family);

/** Inside a Remotion composition: blocks rendering until the font is available. */
export const useCompositionFont = (family: string | undefined) => {
  const [, force] = useState(0);
  // delayRender during the first render so server/web renders wait for the font.
  const [initial] = useState(() =>
    family && findFont(family) && !ready.has(family) ? delayRender(`font ${family}`, { timeoutInMilliseconds: 20000 }) : null,
  );
  const initialRef = useRef(initial);
  useEffect(() => {
    let handle = initialRef.current;
    initialRef.current = null;
    let alive = true;
    if (family && findFont(family) && !ready.has(family)) {
      if (handle === null) handle = delayRender(`font ${family}`, { timeoutInMilliseconds: 20000 });
      const h = handle;
      loadFontFamily(family).finally(() => {
        continueRender(h);
        if (alive) force((n) => n + 1);
      });
    } else if (handle !== null) {
      continueRender(handle);
    }
    return () => {
      alive = false;
    };
  }, [family]);
};

/** Font-family CSS value with sensible fallbacks. */
export const fontStack = (family: string | undefined, fallback: string) => {
  const entry = findFont(family);
  if (!entry) return fallback;
  const generic = entry.category === "serif" ? "serif" : entry.category === "mono" ? "monospace" : entry.category === "handwriting" ? "cursive" : "sans-serif";
  return `"${entry.family}", ${generic}`;
};
