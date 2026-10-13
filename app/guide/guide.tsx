"use client";

import { useEffect, useState } from "react";
import guide from "@/guide.json";
import { CopyButton } from "../ui";

type TestCard = {
  id: string;
  title: string;
  when: string;
  open?: { label: string; href: string };
  checks?: string[];
  table?: { item: string; expect: string }[];
  samples?: { label: string; text: string }[];
  note?: string;
  questions?: { q: string; expect: string; action?: boolean; slow?: boolean }[];
};

const KEY = "harbourline-guide-ticks";

function useTicks() {
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setTicks(JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch {}
  }, []);
  const toggle = (id: string) => {
    setTicks((t) => {
      const next = { ...t, [id]: !t[id] };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  return { ticks, toggle };
}

function Tick({ id, label, ticks, toggle }: { id: string; label: string; ticks: Record<string, boolean>; toggle: (id: string) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm cursor-pointer">
      <input type="checkbox" className="mt-0.5 accent-[#0DBEE4] w-4 h-4 shrink-0" checked={!!ticks[id]} onChange={() => toggle(id)} />
      <span className={ticks[id] ? "text-muted line-through" : ""}>{label}</span>
    </label>
  );
}

function Grey({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="bg-input rounded-lg p-2.5 flex items-start justify-between gap-3">
      <div className="text-sm">{children ?? text}</div>
      <CopyButton text={text} />
    </div>
  );
}

function Quote({ text }: { text: string }) {
  return <blockquote className="border-l-4 border-cyan bg-input rounded-r-lg px-3 py-2 text-sm italic">&ldquo;{text}&rdquo;</blockquote>;
}

export default function Guide({ reportsUrl }: { reportsUrl: string }) {
  const [tab, setTab] = useState<"test" | "demo">("test");
  const { ticks, toggle } = useTicks();
  const href = (h: string) => (h === "REPORTS" ? reportsUrl : h);
  const external = (h: string) => h === "REPORTS";
  const demo = guide.demo;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Guide</h1>
      <div className="flex gap-2">
        <button onClick={() => setTab("test")} className={tab === "test" ? "btn-primary" : "btn-ghost !text-sm !px-4 !py-2"}>
          Test as you build
        </button>
        <button onClick={() => setTab("demo")} className={tab === "demo" ? "btn-primary" : "btn-ghost !text-sm !px-4 !py-2"}>
          Demo
        </button>
      </div>

      {tab === "test" && (
        <div className="grid gap-4">
          {(guide.test as TestCard[]).map((c) => (
            <section key={c.id} className="panel p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="eyebrow">{c.when}</span>
                <h2 className="font-bold text-lg">{c.title}</h2>
                {c.open && (
                  <a href={href(c.open.href)} target={external(c.open.href) ? "_blank" : undefined} rel="noreferrer" className="btn-primary !py-1 !px-3 text-sm ml-auto">
                    {c.open.label}
                  </a>
                )}
              </div>
              {c.table && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-1.5 pr-3 border-b border-line font-semibold">Request</th>
                        <th className="py-1.5 border-b border-line font-semibold">Expect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.table.map((r) => (
                        <tr key={r.item}>
                          <td className="py-1.5 pr-3 border-b border-line whitespace-nowrap align-top font-semibold">{r.item}</td>
                          <td className="py-1.5 border-b border-line">{r.expect}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {c.samples && (
                <div className="space-y-2">
                  {c.samples.map((s) => (
                    <div key={s.label}>
                      <div className="text-xs text-muted mb-1">{s.label}</div>
                      <Grey text={s.text} />
                    </div>
                  ))}
                </div>
              )}
              {c.questions && (
                <div className="space-y-2">
                  {c.questions.map((q) => (
                    <div key={q.q} className="space-y-1">
                      <Grey text={q.q} />
                      <p className="text-sm text-muted">
                        Expect: {q.expect}
                        {q.slow && " (slow, over a minute)"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {c.note && <p className="text-sm text-gold bg-[#F0C06014] border border-[#F0C06055] rounded-lg p-2.5">{c.note}</p>}
              {c.checks && (
                <div className="space-y-1.5">
                  {c.checks.map((x, i) => (
                    <Tick key={i} id={`${c.id}-${i}`} label={x} ticks={ticks} toggle={toggle} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {tab === "demo" && (
        <div className="grid gap-4">
          <section className="panel p-4 space-y-3">
            <h2 className="font-bold text-lg">{demo.provenance.title}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Brought", demo.provenance.brought],
                ["Built tonight", demo.provenance.built],
              ].map(([label, items]) => (
                <div key={label as string}>
                  <div className="eyebrow mb-1">{label as string}</div>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {(items as string[]).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <Quote text={demo.provenance.say} />
          </section>

          <section className="panel p-4 space-y-2">
            <h2 className="font-bold text-lg">Before you go up</h2>
            {demo.before.map((x, i) => (
              <Tick key={i} id={`before-${i}`} label={x} ticks={ticks} toggle={toggle} />
            ))}
          </section>

          <section className="panel p-4 space-y-3">
            <h2 className="font-bold text-lg">Run sheet</h2>
            <ol className="space-y-4">
              {demo.steps.map((s: { time: string; page: string; href?: string; do: string; say: string; optional?: boolean }, i: number) => (
                <li key={i} className="grid grid-cols-[3.5rem_1fr] gap-3">
                  <div className="font-mono text-cyan font-semibold pt-0.5">{s.time}</div>
                  <div className="space-y-1.5 border-l border-line pl-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {s.href ? (
                        <a href={href(s.href)} target={external(s.href) ? "_blank" : undefined} rel="noreferrer" className="font-semibold underline decoration-line underline-offset-4 hover:text-cyan">
                          {s.page}
                        </a>
                      ) : (
                        <span className="font-semibold">{s.page}</span>
                      )}
                      {s.optional && <span className="eyebrow border border-[#F0C06055] rounded px-1.5">Optional</span>}
                    </div>
                    <p className="text-sm text-muted">{s.do}</p>
                    <Quote text={s.say} />
                  </div>
                </li>
              ))}
            </ol>
            {demo.ifTime && <p className="text-sm text-muted">{demo.ifTime}</p>}
          </section>

          <section className="rounded-xl border border-[#EF4444] bg-[#EF44441A] p-4">
            <div className="font-bold text-[#FCA5A5] mb-1">Fallback</div>
            <p className="text-sm">{demo.fallback}</p>
          </section>

          <section className="panel p-4 space-y-2">
            <h2 className="font-bold text-lg">Freeze checklist</h2>
            {demo.freeze.map((x, i) => (
              <Tick key={i} id={`freeze-${i}`} label={x} ticks={ticks} toggle={toggle} />
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
