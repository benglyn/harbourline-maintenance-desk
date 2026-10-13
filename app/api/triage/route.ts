import { triageRequest, type Photo } from "@/lib/triage";

export const maxDuration = 120;

// POST { id, photo? } triages one Requests row and saves the result.
export async function POST(req: Request) {
  try {
    const { id, photo } = (await req.json()) as { id: string; photo?: Photo };
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    return Response.json(await triageRequest(id, photo));
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
