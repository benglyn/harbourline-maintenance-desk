import { createRecords } from "@/lib/airtable";
import { triageRequest, type Photo } from "@/lib/triage";

export const maxDuration = 120;

// POST { address, description, photo? }: saves a Portal request, then triages it straight away.
// The photo goes only to Claude; only its one-line description is saved.
export async function POST(req: Request) {
  try {
    const { address, description, photo } = (await req.json()) as { address: string; description: string; photo?: Photo };
    if (!address?.trim() || !description?.trim()) return Response.json({ error: "Address and description are required." }, { status: 400 });
    const [rec] = await createRecords("requests", [
      { received_at: new Date().toISOString(), channel: "Portal", status: "New", address: address.trim(), description: description.trim() },
    ]);
    const triage = await triageRequest(rec.id, photo);
    return Response.json({ id: rec.id, request_id: rec.f.request_id, triage });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
