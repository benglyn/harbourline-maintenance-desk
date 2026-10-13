// Triage is a workflow, not a tool loop: code looks up, code applies hard rules,
// one Claude call drafts, code saves.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import path from "path";
import { getRecord, listAll, updateRecord, type Rec } from "./airtable";
import { matchProperty, type PropertyLike } from "./address";
import { brisbaneLong } from "./time";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const client = new Anthropic();

const SYSTEM = [
  readFileSync(path.join(process.cwd(), "triage-procedure.md"), "utf8"),
  readFileSync(path.join(process.cwd(), "qld-repair-rules.md"), "utf8"),
  `# How this app runs the procedure

The app has already done the lookups for you. You get the request, the property match (or why there is none), the property's full record and full job history, its last 30 days of requests, the tradie list and the property's maintenance spend rank. Use only this data. Never invent a property, job, tradie or cost.

- **Property match:** decided by code. If the match is "none", the property is unknown: set property_id to null and needs_call_back to true, put the reason in call_back_reason, and in next_step say to call the tenant back to confirm the address. Still set urgency from what was reported.
- **Times:** every time is already in Brisbane time and says so. Use times exactly as given; never convert them to another time zone.
- **After-hours calls:** if a voice call says a transfer to the after-hours phone was not answered, next_step must include the exact words "the after-hours transfer was not answered" and say to call the tenant now.
- **Existing jobs:** if a job in the history is open (not Completed) for the same problem, set existing_job_id, say how long it has been open (from its reported date to the received time), and the next step is to chase that job's tradie by name.
- **Repeat faults:** repeat_fault is true when the same category of fault has 2 or more jobs at this property in the six months before the request (count the job this request updates too). Put the job IDs and dates in repeat_note.
- **Duplicates:** if one of the recent requests is the same problem at the same property, set duplicate_of to that request's request_id (just the number) and treat it as one job: no new work order.
- **Tradie reports:** urgency "Job update", existing_job_id is the job number in the report, include the cost. Anything the tradie flags that needs someone else (another unit, the body corporate) goes under things_to_confirm.
- **Not maintenance:** urgency "Not maintenance", route to the property manager, tradie, work_order and landlord_approval all null. Do not approve or refuse anything.
- **Tradie:** must be one of the tradie list names exactly, or null with the reason in next_step (for example "No gasfitter on our tradie list").
- **Cost:** estimated_cost is your best estimate in dollars from the job history, or null. Over 500 dollars, landlord_approval holds the approval request and work_order is null.
- **Photo:** say in photo_attached whether a photo came with this request. If one did, describe it in one line in photo_description; otherwise photo_description is null.
- **Tenant reply:** open with "Hi there," (never the tenant reference or a name). Sign it with the property manager's first name and "Harbourline Property Management" (if no property is matched, sign it "Harbourline Property Management"). Use tenant references only, never names.
- issue is one short line. next_step is one short line starting with a verb.
- Do not use em dashes anywhere. Australian spelling.`,
].join("\n\n---\n\n");

const str = { type: ["string", "null"] } as const;
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "urgency", "property_id", "needs_call_back", "call_back_reason", "issue", "existing_job_id", "duplicate_of",
    "repeat_fault", "repeat_note", "property_manager", "tradie", "next_step", "tenant_reply", "work_order",
    "landlord_approval", "estimated_cost", "things_to_confirm", "photo_attached", "photo_description",
  ],
  properties: {
    urgency: { type: "string", enum: ["Emergency", "Urgent", "Routine", "Not maintenance", "Job update"] },
    property_id: str,
    needs_call_back: { type: "boolean" },
    call_back_reason: str,
    issue: { type: "string" },
    existing_job_id: str,
    duplicate_of: str,
    repeat_fault: { type: "boolean" },
    repeat_note: str,
    property_manager: str,
    tradie: str,
    next_step: { type: "string" },
    tenant_reply: { type: "string" },
    work_order: str,
    landlord_approval: str,
    estimated_cost: { type: ["number", "null"] },
    things_to_confirm: { type: "array", items: { type: "string" } },
    photo_attached: { type: "boolean" },
    photo_description: str,
  },
};

export type Triage = {
  urgency: "Emergency" | "Urgent" | "Routine" | "Not maintenance" | "Job update";
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
  estimated_cost: number | null;
  things_to_confirm: string[];
  photo_attached: boolean;
  photo_description: string | null;
  model?: string;
  triaged_at?: string;
  seconds?: number;
};

export type Photo = { media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

// Reference data changes rarely: cache it for two minutes.
let ref: { at: number; properties: PropertyLike[]; jobs: Rec["f"][]; tradies: Rec["f"][] } | null = null;
export async function reference() {
  if (ref && Date.now() - ref.at < 120_000) return ref;
  const [p, j, t] = await Promise.all([listAll("properties"), listAll("jobs"), listAll("tradies")]);
  ref = { at: Date.now(), properties: p.map((r) => r.f as PropertyLike), jobs: j.map((r) => r.f), tradies: t.map((r) => r.f) };
  return ref;
}

const noDash = (v: any): any =>
  typeof v === "string" ? v.replace(/\s*[—–]\s*/g, " - ") : Array.isArray(v) ? v.map(noDash) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, noDash(x)])) : v;

export async function triageRequest(recordId: string, photo?: Photo): Promise<Triage> {
  const started = Date.now();
  const [row, data, allRequests] = await Promise.all([getRecord("requests", recordId), reference(), listAll("requests")]);
  const req = row.f;

  // 1. Code looks up.
  const match = matchProperty(req.address || "", data.properties);
  const prop = match.property;
  const history = prop ? data.jobs.filter((j) => j.property_id === prop.property_id).sort((a, b) => String(a.reported).localeCompare(String(b.reported))) : [];
  const receivedMs = new Date(req.received_at || row.createdTime).getTime();
  const recent = prop
    ? allRequests
        .filter((r) => r.id !== row.id)
        .filter((r) => r.f.property_id === prop.property_id || matchProperty(r.f.address || "", data.properties).property?.property_id === prop.property_id)
        .filter((r) => {
          const t = new Date(r.f.received_at || r.createdTime).getTime();
          return t <= receivedMs && t >= receivedMs - 30 * 86400_000;
        })
        .map((r) => ({
          request_id: String(r.f.request_id),
          channel: r.f.channel,
          received: brisbaneLong(r.f.received_at || r.createdTime),
          address: r.f.address,
          description: r.f.description,
          triaged_issue: r.f.issue ?? null,
        }))
    : [];
  let spend = null;
  if (prop) {
    const totals = new Map<string, number>();
    for (const j of data.jobs) totals.set(j.property_id, (totals.get(j.property_id) || 0) + (Number(j.cost) || 0));
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    spend = { total_completed_cost: totals.get(prop.property_id) || 0, rank: ranked.findIndex(([id]) => id === prop.property_id) + 1, of_properties: ranked.length };
  }

  const input = {
    request: {
      request_id: String(req.request_id),
      channel: req.channel,
      received: brisbaneLong(req.received_at || row.createdTime),
      address_given: req.address || null,
      description: req.description,
      photo_attached: !!photo,
    },
    property_match: prop
      ? { result: "matched", property: prop }
      : { result: "none", reason: match.reason, candidates: match.candidates.map((c) => `${c.property_id}: ${c.address}, ${c.suburb}`) },
    job_history: history,
    maintenance_spend: spend,
    recent_requests_last_30_days: recent,
    tradie_list: data.tradies,
  };

  // 3. One Claude call.
  const content: Anthropic.ContentBlockParam[] = [];
  if (photo) content.push({ type: "image", source: { type: "base64", media_type: photo.media_type, data: photo.data } });
  content.push({ type: "text", text: `Triage this request. Here is the request and everything the app looked up:\n\n${JSON.stringify(input, null, 2)}` });

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content }],
  } as any);
  const text = (res as Anthropic.Message).content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error(`No triage output (stop_reason ${(res as Anthropic.Message).stop_reason})`);
  const t: Triage = noDash(JSON.parse(text.text));

  // 2. Code applies the hard rules.
  if (!prop) {
    t.property_id = null;
    t.needs_call_back = true;
    t.call_back_reason = match.reason;
  } else {
    t.property_id = prop.property_id;
    t.needs_call_back = false;
    t.call_back_reason = null;
    t.property_manager = prop.property_manager;
  }
  const names = data.tradies.map((x) => x.tradie);
  if (t.tradie && !names.includes(t.tradie)) t.tradie = null;
  if (t.estimated_cost && t.estimated_cost > 500 && t.work_order) {
    t.landlord_approval = t.landlord_approval || `Landlord approval needed before booking (estimated ${t.estimated_cost} dollars).\n\n${t.work_order}`;
    t.work_order = null;
  }
  if (!photo) {
    t.photo_attached = false;
    t.photo_description = null;
  }
  t.model = MODEL;
  t.triaged_at = new Date().toISOString();
  t.seconds = Math.round((Date.now() - started) / 1000);

  // 4. Code saves.
  await updateRecord("requests", row.id, {
    status: "Triaged",
    urgency: t.urgency,
    property_id: t.property_id,
    needs_call_back: t.needs_call_back,
    issue: t.issue,
    existing_job_id: t.existing_job_id,
    duplicate_of: t.duplicate_of,
    repeat_fault: t.repeat_fault,
    repeat_note: t.repeat_note,
    property_manager: t.property_manager,
    tradie: t.tradie,
    next_step: t.next_step,
    tenant_reply: t.tenant_reply,
    work_order: t.work_order,
    landlord_approval: t.landlord_approval,
    things_to_confirm: t.things_to_confirm.map((x) => `- ${x}`).join("\n"),
    photo_description: t.photo_description,
    triage_json: JSON.stringify(t, null, 2),
  });
  return t;
}
