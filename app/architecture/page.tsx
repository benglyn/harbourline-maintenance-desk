"use client";

import { useState } from "react";

const TABS = [
  { key: "system", label: "System architecture", src: "/architecture/architecture.png", alt: "How the Harbourline parts connect" },
  { key: "skills", label: "Skills map", src: "/architecture/skills-map.png", alt: "AI Adoption Series skills mapped to Harbourline" },
];

export default function Architecture() {
  const [tab, setTab] = useState(TABS[0].key);
  const t = TABS.find((x) => x.key === tab)!;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Architecture</h1>
      <div className="flex gap-2">
        {TABS.map((x) => (
          <button key={x.key} onClick={() => setTab(x.key)} className={x.key === tab ? "btn-primary" : "btn-ghost !text-sm !px-4 !py-2"}>
            {x.label}
          </button>
        ))}
      </div>
      <a href={t.src} target="_blank" rel="noreferrer" className="block bg-white rounded-xl p-3" title="Open full size">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={t.src} alt={t.alt} className="w-full h-auto" />
      </a>
      <p className="text-muted text-sm">Click the diagram to open it full size.</p>
    </div>
  );
}
