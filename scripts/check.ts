// Answer-key check: npm run check
// Removes previous seed rows (matched by description, never live rows), loads the 8 seed
// requests with dates shifted so the newest is 2 hours before now, triages them one at a
// time in file order, and asserts the answer key in code.
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { createRecords, deleteRecords, listAll } from "../lib/airtable";
import { triageRequest, type Triage } from "../lib/triage";
import { parseBrisbane } from "../lib/time";

const DIR = path.join(process.cwd(), "seed", "inbox");

function channelOf(file: string) {
  if (file.includes("web-form")) return "Web form";
  if (file.includes("jane-call")) return "Voice";
  if (file.includes("tradie-report")) return "Tradie report";
  if (file.includes("email")) return "Email";
  if (file.includes("text")) return "Text";
  return "Email";
}

function addressOf(text: string) {
  const patterns = [
    /\|\s*Property address\s*\|\s*([^|]+)\|/i,
    /\*\*Caller:\*\*\s*tenant at\s*(.+)/i,
    /\*\*From:\*\*\s*tenant at\s*(.+)/i,
    /\*\*Subject:\*\*\s*Job J-\d+,\s*([^:]+):/i,
    /\b(unit \d+)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return "";
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
const seeds = files.map((file) => {
  const raw = readFileSync(path.join(DIR, file), "utf8").replace(/\r\n/g, "\n");
  const received = parseBrisbane(raw.match(/\*\*Received:\*\*\s*(.+)/)![1]);
  // The stored description drops the channel and received lines: the row has its own fields for those.
  const description = raw
    .split("\n")
    .filter((l) => !/^\*\*(Channel|Received):\*\*/.test(l))
    .join("\n")
    .trim();
  return { file, key: file.slice(0, 2), channel: channelOf(file), address: addressOf(raw), description, received };
});

async function main() {
  // 1. Remove previous seed rows by description.
  const descriptions = new Set(seeds.map((s) => s.description));
  const existing = await listAll("requests");
  const old = existing.filter((r) => descriptions.has(String(r.f.description || "").replace(/\r\n/g, "\n").trim()));
  if (old.length) await deleteRecords("requests", old.map((r) => r.id));
  console.log(`Removed ${old.length} previous seed rows.`);

  // 2. Shift dates so the newest is 2 hours before now.
  const newest = Math.max(...seeds.map((s) => s.received.getTime()));
  const shift = Date.now() - 2 * 3600_000 - newest;

  // 3. Load and triage one at a time in file order.
  const results: Record<string, { t: Triage; requestId: string }> = {};
  for (const s of seeds) {
    const [rec] = await createRecords("requests", [
      {
        received_at: new Date(s.received.getTime() + shift).toISOString(),
        channel: s.channel,
        status: "New",
        address: s.address,
        description: s.description,
      },
    ]);
    const started = Date.now();
    const t = await triageRequest(rec.id);
    results[s.key] = { t, requestId: String(rec.f.request_id) };
    console.log(`${s.file}: ${t.urgency}, ${t.property_id ?? "call back"}, ${((Date.now() - started) / 1000).toFixed(1)} s. ${t.issue}`);
  }

  // 4. Assert the answer key.
  const r = (k: string) => results[k].t;
  const has = (s: string | null | undefined, re: RegExp) => !!s && re.test(s);
  const checks: [string, boolean, string][] = [
    ["02 gas: Emergency", r("02").urgency === "Emergency", r("02").urgency],
    ["02 gas: next step says the after-hours transfer was not answered", has(r("02").next_step, /after-hours transfer was not answered/i), r("02").next_step],
    ["02 gas: no gasfitter, no tradie", r("02").tradie === null, String(r("02").tradie)],
    ["06 unit 8: Emergency", r("06").urgency === "Emergency", r("06").urgency],
    ["06 unit 8: needs call back", r("06").needs_call_back === true && r("06").property_id === null, String(r("06").call_back_reason)],
    ["05 power: Urgent", r("05").urgency === "Urgent", r("05").urgency],
    ["05 power: existing job J-7050", r("05").existing_job_id === "J-7050", String(r("05").existing_job_id)],
    ["05 power: chase Brightline", has(r("05").next_step, /Brightline/i), r("05").next_step],
    ["01 aircon: Routine", r("01").urgency === "Routine", r("01").urgency],
    ["01 aircon: HPM-1130 repeat fault", r("01").property_id === "HPM-1130" && r("01").repeat_fault === true, `${r("01").property_id} ${r("01").repeat_note}`],
    ["03 tap: HPM-1290", r("03").property_id === "HPM-1290", String(r("03").property_id)],
    ["04 tap: duplicate of 03", r("04").property_id === "HPM-1290" && has(r("04").duplicate_of, new RegExp(`\\b${results["03"].requestId}\\b`)), `${r("04").duplicate_of} (03 is ${results["03"].requestId})`],
    ["07 cat: Not maintenance", r("07").urgency === "Not maintenance", r("07").urgency],
    ["07 cat: routed to Grace", has(r("07").property_manager, /Grace/), String(r("07").property_manager)],
    ["07 cat: nothing approved or refused", !r("07").work_order && !r("07").landlord_approval && !r("07").tradie, `${r("07").work_order} ${r("07").landlord_approval}`],
    ["08 tradie: Job update J-7302", r("08").urgency === "Job update" && r("08").existing_job_id === "J-7302", `${r("08").urgency} ${r("08").existing_job_id}`],
    ["08 tradie: 2,380 dollars mentioned", /2,?380/.test(JSON.stringify(r("08"))), ""],
    ["08 tradie: repeat fault", r("08").repeat_fault === true && r("08").property_id === "HPM-1011", String(r("08").repeat_note)],
    ["08 tradie: 5/18 leak under things to confirm", r("08").things_to_confirm.some((x) => /5\/18|unit 5|unit above/i.test(x)), r("08").things_to_confirm.join(" | ")],
    [
      "Count: 02 is the only matched Emergency",
      Object.entries(results).filter(([, x]) => x.t.urgency === "Emergency" && x.t.property_id).map(([k]) => k).join(",") === "02",
      Object.entries(results).filter(([, x]) => x.t.urgency === "Emergency").map(([k]) => k).join(","),
    ],
    ["No em dashes", !JSON.stringify(Object.values(results).map((x) => x.t)).includes("—"), ""],
  ];

  let failed = 0;
  console.log("");
  for (const [name, ok, detail] of checks) {
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
