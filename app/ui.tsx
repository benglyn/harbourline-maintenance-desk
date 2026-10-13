"use client";

import { useState } from "react";

export const URGENCY_COLOURS: Record<string, string> = {
  Emergency: "#EF4444",
  Urgent: "#F97316",
  Routine: "#0DBEE4",
  "Not maintenance": "#94A3B8",
  "Job update": "#3860EF",
};

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const c = URGENCY_COLOURS[urgency] || "#94A3B8";
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: `${c}26`, color: c, border: `1px solid ${c}` }}>
      {urgency}
    </span>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
