"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// The editor relies on browser-only APIs (object URLs, Web Audio), so skip SSR.
const EditorShell = dynamic(() => import("@/editor/components/EditorShell"), {
  ssr: false,
  loading: () => (
    <div className="h-screen grid place-items-center bg-[#09090b]">
      <Loader2 className="size-6 text-violet-300 animate-spin" />
    </div>
  ),
});

export default function EditorPage() {
  return <EditorShell />;
}
