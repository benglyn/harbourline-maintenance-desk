"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/portal", label: "Portal" },
  { href: "/talk", label: "Talk to Jane" },
  { href: "/board", label: "Triage board" },
  { href: "/architecture", label: "Architecture" },
  { href: "/guide", label: "Guide" },
  { href: "/demo", label: "Demo" },
];

export default function Nav({ reportsUrl }: { reportsUrl: string }) {
  const path = usePathname();
  const item = "px-2.5 py-1.5 rounded-md text-sm hover:bg-input";
  return (
    <header className="bg-header border-b border-line">
      <nav className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-1 gap-y-2">
        <Link href="/portal" className="font-bold text-lg mr-4 tracking-tight">
          Harbourline
        </Link>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`${item} ${path.startsWith(l.href) ? "text-gold font-semibold" : "text-muted"}`}>
            {l.label}
          </Link>
        ))}
        <a href={reportsUrl} target="_blank" rel="noreferrer" className={`${item} text-muted`}>
          Reports
        </a>
        <a href="/recording-test-script.pdf" target="_blank" rel="noreferrer" className={`${item} text-muted`}>
          Test script
        </a>
      </nav>
    </header>
  );
}
