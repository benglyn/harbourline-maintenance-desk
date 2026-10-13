"use client";

import { useEffect, useRef, useState } from "react";
import { CopyButton, UrgencyBadge } from "../ui";

type Photo = { media_type: "image/jpeg"; data: string };

// Shrink the photo in the browser. It goes only to Claude and is never stored.
async function shrink(file: File): Promise<Photo> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { media_type: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.8).split(",")[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Result = { request_id: number; triage: { urgency: string; issue: string; next_step: string; tenant_reply: string; photo_description: string | null } };

export default function PortalForm({ model, sample }: { model: string; sample: { address: string; description: string } }) {
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSeconds(0);
    setResult(null);
    setError("");
    try {
      const photo = file ? await shrink(file) : undefined;
      const res = await fetch("/api/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, description, photo }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setResult(data);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setAddress("");
    setDescription("");
    setFile(null);
    setResult(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Request a repair</h1>
        <p className="text-muted">Tell us what needs fixing. A property manager reads every request.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
        <div className="space-y-4">
          <form onSubmit={submit} className="panel p-5 space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Property address</span>
              <input className="field w-full" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="For example 2/77 Ocean View Dr, Carindale" required />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">What's the problem?</span>
              <textarea className="field w-full min-h-32" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's happening, where, and since when" required />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">
                Photo <span className="text-muted font-normal">(optional, never stored)</span>
              </span>
              <input ref={fileInput} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-input file:px-3 file:py-1.5 file:text-ink" />
            </label>
            <div className="flex items-center gap-4">
              <button className="btn-primary" disabled={busy}>
                Send request
              </button>
              {busy && <span className="text-muted">Triaging with {model}... {seconds} s</span>}
            </div>
            {error && <p className="text-[#EF4444]">{error}</p>}
          </form>

          {result && (
            <div className="panel p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <UrgencyBadge urgency={result.triage.urgency} />
                <span className="text-muted text-sm">Request {result.request_id}, triaged in {seconds} s</span>
              </div>
              <p className="font-semibold">{result.triage.issue}</p>
              {result.triage.photo_description && <p className="text-sm text-muted">Photo: {result.triage.photo_description}</p>}
              <div>
                <div className="eyebrow mb-1">Drafted reply (a property manager approves before it's sent)</div>
                <p className="whitespace-pre-wrap bg-input rounded-lg p-3 text-sm">{result.triage.tenant_reply}</p>
              </div>
              <button className="btn-ghost !text-sm !px-3 !py-1" onClick={reset}>
                New request
              </button>
            </div>
          )}
        </div>

        <aside className="panel p-4 space-y-3">
          <div className="eyebrow">Sample request</div>
          {[
            ["Address", sample.address],
            ["Description", sample.description],
          ].map(([label, text]) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{label}</span>
                <CopyButton text={text} />
              </div>
              <p className="bg-input rounded-lg p-2.5 text-sm">{text}</p>
            </div>
          ))}
          <p className="text-sm text-muted">Attach a photo of water under a sink.</p>
        </aside>
      </div>
    </div>
  );
}
