"use client";

import { Copy, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { useEditor } from "../store";

/** The edit *is* code: this JSON is what the AI edits and Remotion renders. */
export function CodeView() {
  const { project } = useEditor();
  const [copied, setCopied] = useState(false);
  const json = useMemo(() => JSON.stringify(project, null, 2), [project]);

  const highlighted = useMemo(
    () =>
      json
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/("(?:[^"\\]|\\.)*")(\s*:)?|\b(-?\d+(?:\.\d+)?)\b|\b(true|false|null)\b/g, (m, str, colon, num, lit) => {
          if (str) return colon ? `<span class="text-sky-300">${str}</span>${colon}` : `<span class="text-amber-200">${str}</span>`;
          if (num) return `<span class="text-emerald-300">${num}</span>`;
          if (lit) return `<span class="text-fuchsia-300">${lit}</span>`;
          return m;
        }),
    [json],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 pb-3 border-b border-white/[0.06]">
        <p className="text-[12px] text-white/60 leading-relaxed">
          Montaj — bu kod. AI aynan shu loyiha JSON&apos;ini tahrirlaydi, Remotion esa uni kadrma-kadr videoga aylantiradi.
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] font-mono text-white/40">project.json · {json.split("\n").length} qator</span>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(json);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-white/60 hover:text-white bg-white/5 hover:bg-white/10"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? "Nusxalandi" : "Nusxalash"}
          </button>
        </div>
      </div>
      <pre
        className="flex-1 min-h-0 overflow-auto p-4 text-[11px] leading-[1.6] font-mono text-white/60 panel-scroll"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}
