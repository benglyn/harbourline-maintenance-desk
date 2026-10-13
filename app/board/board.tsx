"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { brisbaneDate, brisbaneShort, friendlyModel } from "@/lib/time";
import { UrgencyBadge } from "../ui";

type Triage = {
  urgency: string;
  property_id: string | null;
  needs_call_back: boolean;
  call_back_reason: string | null;
  issue: string;
  existing_job_id: string | null;
  duplicate_of: string | null;
  repeat_fault: boolean;
  repeat_note: string | null;
  property_manager: string | null;
  tradie: string | null;
  next_step: string;
  tenant_reply: string;
  work_order: string | null;
  landlord_approval: string | null;
  things_to_confirm: string[];
  photo_description: string | null;
  model?: string;
};

type Row = {
  id: string;
  request_id: number;
  received_at: string;
  created_at: string;
  channel: string;
  status: string;
  address: string;
  description: string;
  property_address: string | null;
  triage: Triage | null;
};

const ORDER = ["Emergency", "Urgent", "Routine", "Job update", "Not maintenance"];
const FLAGS = ["Call back", "Repeat fault", "Duplicate", "Existing job", "Photo"];
const PORTAL_GRACE_MS = 60_000;

function flagsOf(t: Triage | null) {
  if (!t) return [];
  const f: string[] = [];
  if (t.needs_call_back) f.push("Call back");
  if (t.repeat_fault) f.push("Repeat fault");
  if (t.duplicate_of) f.push("Duplicate");
  if (t.existing_job_id) f.push("Existing job");
  if (t.photo_description) f.push("Photo");
  return f;
}

// Voice descriptions carry "Callback:" and "Access:" parts: show them as their own sections.
function splitDescription(d: string) {
  const callback = d.match(/Callback:\s*([\s\S]*?)(?=\s*Access:|$)/i)?.[1]?.trim() || null;
  const access = d.match(/Access:\s*([\s\S]*?)(?=\s*Callback:|$)/i)?.[1]?.trim() || null;
  const original = d.replace(/\s*Callback:[\s\S]*?(?=\s*Access:|$)/i, "").replace(/\s*Access:[\s\S]*?(?=\s*Callback:|$)/i, "").trim();
  return { original, callback, access };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-0.5">{title}</div>
      <div className="text-sm whitespace-pre-wrap">{children}</div>
    </div>
  );
}

function Card({ r, triaging, model }: { r: Row; triaging: boolean; model: string }) {
  const t = r.triage;
  const d = splitDescription(r.description);
  const where = r.property_address ? `${t?.property_id} · ${r.property_address}` : r.address || "No address";
  return (
    <div className="panel p-3.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {t ? <UrgencyBadge urgency={t.urgency} /> : <span className="text-xs text-gold font-semibold">New</span>}
        {flagsOf(t).map((f) => (
          <span key={f} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${f === "Call back" ? "bg-[#EF444433] text-[#FCA5A5]" : "bg-input text-ink"}`}>
            {f === "Existing job" ? t!.existing_job_id : f === "Duplicate" ? `Duplicate of ${t!.duplicate_of}` : f}
          </span>
        ))}
        <span className="text-muted ml-auto text-xs">
          #{r.request_id} · {r.channel} · {brisbaneShort(r.received_at)}
        </span>
      </div>
      <div className="text-xs text-muted truncate">{where}</div>
      {t ? (
        <>
          <p className="font-semibold leading-snug truncate" title={t.issue}>
            {t.issue}
          </p>
          <p className="text-sm truncate" title={t.next_step}>
            <span className="text-muted">Next:</span> {t.next_step}
          </p>
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted hover:text-ink select-none">Details</summary>
            <div className="mt-2 space-y-2.5 bg-input rounded-lg p-3">
              {t.needs_call_back && t.call_back_reason && <Section title="Why call back">{t.call_back_reason}</Section>}
              {t.repeat_fault && t.repeat_note && <Section title="Repeat fault">{t.repeat_note}</Section>}
              <Section title="Tradie">{t.tradie || "None chosen"}</Section>
              {t.things_to_confirm?.length > 0 && <Section title="Things to confirm">{t.things_to_confirm.map((x) => `- ${x}`).join("\n")}</Section>}
              <Section title="Tenant reply">{t.tenant_reply}</Section>
              {t.work_order && <Section title="Work order">{t.work_order}</Section>}
              {t.landlord_approval && <Section title="Landlord approval">{t.landlord_approval}</Section>}
              {t.photo_description && <Section title="Photo">{t.photo_description}</Section>}
              <Section title="Original request">{d.original}</Section>
              {d.callback && <Section title="Callback">{d.callback}</Section>}
              {d.access && <Section title="Access">{d.access}</Section>}
              {t.property_manager && <Section title="Property manager">{t.property_manager}</Section>}
              <p className="text-xs text-muted pt-1">Triaged by {friendlyModel(t.model)}</p>
            </div>
          </details>
        </>
      ) : (
        <p className="text-sm text-muted">
          {triaging ? `Triaging with ${model}...` : "Waiting for triage"} <span className="text-ink">{d.original.slice(0, 120)}</span>
        </p>
      )}
    </div>
  );
}

export default function Board({ model }: { model: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [triaging, setTriaging] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const [urgency, setUrgency] = useState("");
  const [flag, setFlag] = useState("");
  const [date, setDate] = useState("");
  const [addr, setAddr] = useState("");

  const triage = useCallback(async (id: string, refresh: () => void) => {
    inFlight.current.add(id);
    setTriaging(new Set(inFlight.current));
    try {
      await fetch("/api/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    } finally {
      inFlight.current.delete(id);
      setTriaging(new Set(inFlight.current));
      refresh();
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/requests", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRows(data.requests);
      setError("");
      // Triage rows still marked New (voice calls). Portal rows get 60 s: the portal is triaging them with the photo.
      for (const r of data.requests as Row[]) {
        if (r.status !== "New" || inFlight.current.has(r.id)) continue;
        if (r.channel === "Portal" && Date.now() - new Date(r.created_at).getTime() < PORTAL_GRACE_MS) continue;
        triage(r.id, load);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [triage]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [load]);

  const rank = (r: Row) => (r.triage ? ORDER.indexOf(r.triage.urgency) : -1);
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b) || new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
  const q = addr.trim().toLowerCase();
  const shown = sorted.filter(
    (r) =>
      (!urgency || r.triage?.urgency === urgency) &&
      (!flag || flagsOf(r.triage).includes(flag)) &&
      (!date || brisbaneDate(r.received_at) === date) &&
      (!q || `${r.address} ${r.property_address || ""}`.toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Triage board</h1>
          <p className="text-muted text-sm">Emergencies first, newest first. Refreshes every 5 seconds. Nothing is sent without a property manager.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className="field !py-1.5" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
          <option value="">All urgencies</option>
          {ORDER.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <select className="field !py-1.5" value={flag} onChange={(e) => setFlag(e.target.value)}>
          <option value="">All flags</option>
          {FLAGS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <input type="date" className="field !py-1.5" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Received on" />
        <input className="field !py-1.5" style={{ width: "20ch" }} value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Property address" />
        {(urgency || flag || date || addr) && (
          <button className="btn-ghost !text-sm !py-1.5" onClick={() => { setUrgency(""); setFlag(""); setDate(""); setAddr(""); }}>
            Clear
          </button>
        )}
        <span className="text-muted ml-auto">
          Showing {shown.length} of {rows.length} requests
        </span>
      </div>
      {error && <p className="text-[#EF4444] text-sm">{error}</p>}
      <div className="grid gap-3">
        {shown.map((r) => (
          <Card key={r.id} r={r} triaging={triaging.has(r.id) || (r.channel === "Portal" && r.status === "New")} model={model} />
        ))}
      </div>
    </div>
  );
}
