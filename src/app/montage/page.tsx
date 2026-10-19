"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

// The studio uses browser-only APIs (IndexedDB, WebCodecs, object URLs), so skip SSR.
const StudioApp = dynamic(() => import("@/gen/components/StudioApp"), {
  ssr: false,
  loading: () => (
    <div className="h-dvh grid place-items-center bg-[#09090b]">
      <Loader2 className="size-6 text-fuchsia-300 animate-spin" />
    </div>
  ),
});

export default function MontagePage() {
  return <StudioApp />;
}
