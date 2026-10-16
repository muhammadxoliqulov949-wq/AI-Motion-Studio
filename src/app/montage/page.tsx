"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

// Uses browser-only APIs (Web Audio for voice durations, object URLs), so skip SSR.
const MontageStudio = dynamic(() => import("@/montage/MontageStudio"), {
  ssr: false,
  loading: () => (
    <div className="h-dvh grid place-items-center bg-[#09090b]">
      <Loader2 className="size-6 text-yellow-300 animate-spin" />
    </div>
  ),
});

export default function MontagePage() {
  return <MontageStudio />;
}
