import { triageRequest, type Photo } from "@/lib/triage";

export const maxDuration = 120;

// Rows being triaged right now, so two board tabs never triage the same row twice.
const inFlight = new Set<string>();

// POST { id, photo? } triages one Requests row and saves the result.
export async function POST(req: Request) {
  const { id, photo } = (await req.json()) as { id: string; photo?: Photo };
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  if (inFlight.has(id)) return Response.json({ busy: true }, { status: 409 });
  inFlight.add(id);
  try {
    return Response.json(await triageRequest(id, photo));
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e) }, { status: 500 });
  } finally {
    inFlight.delete(id);
  }
}
