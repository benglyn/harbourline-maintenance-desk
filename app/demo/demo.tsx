"use client";

import { useState } from "react";
import demo from "@/demo.json";

type Step = { time: string; page: string; href?: string; do: string; say?: string; points?: string[]; task: string; section?: string };
type Video = { id: string; tab: string; title: string; length: string; audience: string; before: string[]; steps: Step[]; fallback: string };

const videos = demo.videos as Video[];
const cell = "py-2.5 px-3 border-b border-line align-top";

export default function Demo({ reportsUrl }: { reportsUrl: string }) {
  const [id, setId] = useState(videos[0].id);
  const v = videos.find((x) => x.id === id)!;
  const hasSections = v.steps.some((s) => s.section);

  // Each section spans its rows.
  const spans = v.steps.map((s, i) => {
    if (!hasSections || (i > 0 && v.steps[i - 1].section === s.section)) return 0;
    let n = 1;
    while (i + n < v.steps.length && v.steps[i + n].section === s.section) n++;
    return n;
  });

  const area = (s: Step) =>
    s.href ? (
      <a href={s.href === "REPORTS" ? reportsUrl : s.href} target="_blank" rel="noreferrer" className="font-semibold underline decoration-line underline-offset-4 hover:text-cyan">
        {s.page}
      </a>
    ) : (
      <span className="font-semibold">{s.page}</span>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Demo</h1>
      <div className="flex flex-wrap gap-2">
        {videos.map((x) => (
          <button key={x.id} onClick={() => setId(x.id)} className={x.id === id ? "btn-primary" : "btn-ghost !text-sm !px-4 !py-2"}>
            {x.tab}
          </button>
        ))}
      </div>

      <section className="panel p-4 space-y-1">
        <div className="eyebrow">{v.length}</div>
        <h2 className="font-bold text-lg">{v.title}</h2>
        <p className="text-sm text-muted">
          <span className="text-ink font-semibold">Who it is for:</span> {v.audience}
        </p>
      </section>

      <section className="panel p-4 space-y-2">
        <h2 className="font-bold">Before you record</h2>
        <ul className="list-disc pl-5 text-sm space-y-1">
          {v.before.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>

      <section className="panel overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="text-left text-gold text-xs uppercase tracking-wider">
              <th className={`${cell} w-16`}>Time</th>
              {hasSections && <th className={`${cell} w-32`}>Section</th>}
              <th className={`${cell} w-40`}>Area</th>
              <th className={cell}>{hasSections ? "Subtask" : "Task"}</th>
            </tr>
          </thead>
          <tbody>
            {v.steps.map((s, i) => (
              <tr key={i}>
                <td className={`${cell} font-mono text-cyan font-semibold`}>{s.time}</td>
                {hasSections && spans[i] > 0 && (
                  <td rowSpan={spans[i]} className={`${cell} font-semibold bg-[#224575]/40 border-r`}>
                    {s.section}
                  </td>
                )}
                <td className={cell}>{area(s)}</td>
                <td className={`${cell} space-y-1.5`}>
                  <div className="font-semibold">{s.task}</div>
                  <p className="text-muted">{s.do}</p>
                  {s.say && <blockquote className="border-l-4 border-cyan bg-input rounded-r-lg px-3 py-2 italic">&ldquo;{s.say}&rdquo;</blockquote>}
                  {s.points && (
                    <ul className="list-disc pl-5 space-y-0.5">
                      {s.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-[#EF4444] bg-[#EF44441A] p-4">
        <div className="font-bold text-[#FCA5A5] mb-1">Fallback</div>
        <p className="text-sm">{v.fallback}</p>
      </section>
    </div>
  );
}
