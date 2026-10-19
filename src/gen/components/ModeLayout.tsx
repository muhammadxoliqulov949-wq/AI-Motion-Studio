"use client";

import type { ReactNode } from "react";

/**
 * Two-zone workspace shared by the studio modes: controls on the left with the main button pinned to
 * the bottom, the canvas (results / preview) on the right. On phones the canvas comes first and the
 * controls follow below it, with the button sticking to the bottom of the screen.
 */
export function ModeLayout({ canvas, controls, cta }: { canvas: ReactNode; controls: ReactNode; cta: ReactNode }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
      <section className="order-1 lg:order-2 lg:flex-1 min-w-0 relative lg:min-h-0 lg:overflow-y-auto">{canvas}</section>
      <aside className="order-2 lg:order-1 lg:w-[420px] shrink-0 lg:border-r border-white/[0.07] flex flex-col lg:min-h-0">
        <div className="flex-1 lg:overflow-y-auto panel-scroll p-4 space-y-5">{controls}</div>
        <div className="sticky bottom-0 z-10 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#09090b] via-[#09090b]/95 to-transparent border-t border-white/[0.05] lg:border-t-0">{cta}</div>
      </aside>
    </div>
  );
}
