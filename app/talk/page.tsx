"use client";

import Vapi from "@vapi-ai/web";
import { useEffect, useRef, useState } from "react";

type Line = { role: "user" | "assistant"; text: string };
type Status = "idle" | "connecting" | "live" | "summarising" | "done";

const SAMPLES = [
  {
    title: "Hot water",
    text: "Hi, the hot water's stopped at 18 Ferndale St, Wilston. It went cold this morning and there's no leaking or smell. You can call me back on 0400 000 001. For access, the key's in the lockbox by the front door, and there are no pets.",
  },
  {
    title: "Power points",
    text: "Hi, two power points in the kitchen at 69 Lakeside Court, Toowong stopped working a week ago and it's stayed the same. No sparks or burning smell. You can call me back on 0400 000 002. I work from home so any time is fine, there are no pets and no lockbox.",
  },
];

export default function Talk() {
  const vapi = useRef<Vapi | null>(null);
  const lines = useRef<Line[]>([]);
  const [transcript, setTranscript] = useState<Line[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || "");
    vapi.current = v;
    v.on("call-start", () => {
      setStatus("live");
    });
    v.on("message", (m: { type?: string; transcriptType?: string; role?: "user" | "assistant"; transcript?: string }) => {
      if (m.type === "transcript" && m.transcriptType === "final" && m.transcript) {
        lines.current = [...lines.current, { role: m.role === "assistant" ? "assistant" : "user", text: m.transcript }];
        setTranscript(lines.current);
      }
    });
    v.on("call-end", async () => {
      setStatus("summarising");
      try {
        const res = await fetch("/api/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: lines.current }) });
        const data = await res.json();
        setSummary(data.summary || data.error || "");
      } catch (e) {
        setSummary(`Could not summarise the call: ${e}`);
      }
      setStatus("done");
    });
    v.on("error", (e: unknown) => {
      setError(typeof e === "string" ? e : JSON.stringify(e).slice(0, 300));
    });
    return () => {
      v.stop();
    };
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [transcript]);

  async function start() {
    lines.current = [];
    setTranscript([]);
    setSummary("");
    setError("");
    setStatus("connecting");
    try {
      await vapi.current?.start(process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || "");
    } catch (e) {
      setError(String(e));
      setStatus("idle");
    }
  }

  const live = status === "connecting" || status === "live";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Talk to Jane</h1>
        <p className="text-muted">Jane answers Harbourline's maintenance line. Call her from your browser: allow the microphone when asked.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {live ? (
              <button className="btn-primary !bg-none !bg-[#EF4444]" onClick={() => vapi.current?.stop()}>
                Hang up
              </button>
            ) : (
              <button className="btn-primary" onClick={start} disabled={status === "summarising"}>
                Call Jane
              </button>
            )}
            <span className="text-muted text-sm">
              {status === "connecting" && "Connecting..."}
              {status === "live" && "On the call. Speak when Jane finishes her greeting."}
              {status === "summarising" && "Call ended. Summarising with Claude..."}
              {status === "done" && "Call ended. Jane's call is logged to Airtable and will appear on the board."}
            </span>
          </div>
          {error && <p className="text-[#EF4444] text-sm">{error}</p>}

          <div className="panel p-4 min-h-64 max-h-[28rem] overflow-y-auto space-y-2.5">
            <div className="eyebrow">Live transcript</div>
            {transcript.length === 0 && <p className="text-muted text-sm">The conversation appears here as you talk.</p>}
            {transcript.map((l, i) => (
              <div key={i} className="text-sm">
                <span className={`font-semibold ${l.role === "assistant" ? "text-cyan" : "text-ink"}`}>{l.role === "assistant" ? "Jane" : "Caller"}:</span>{" "}
                <span className="text-ink">{l.text}</span>
              </div>
            ))}
            <div ref={bottom} />
          </div>

          {(summary || status === "summarising") && (
            <div className="panel p-4 space-y-1">
              <div className="eyebrow">Call summary (Claude, display only)</div>
              <p className="text-sm">{summary || "Summarising..."}</p>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="eyebrow">Try saying</div>
          {SAMPLES.map((s) => (
            <div key={s.title} className="panel p-4 space-y-1.5">
              <div className="font-semibold">{s.title}</div>
              <p className="text-sm text-muted">&ldquo;{s.text}&rdquo;</p>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
