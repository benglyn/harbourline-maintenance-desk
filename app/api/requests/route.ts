import { listAll } from "@/lib/airtable";
import { reference } from "@/lib/triage";

// Every Requests row for the board, with the matched property's address.
export async function GET() {
  try {
    const [rows, ref] = await Promise.all([listAll("requests"), reference()]);
    const addr = new Map(ref.properties.map((p) => [p.property_id, `${p.address}, ${p.suburb}`]));
    const requests = rows.map((r) => {
      let triage = null;
      try {
        triage = r.f.triage_json ? JSON.parse(r.f.triage_json) : null;
      } catch {}
      return {
        id: r.id,
        request_id: r.f.request_id,
        received_at: r.f.received_at || r.createdTime,
        created_at: r.createdTime,
        channel: r.f.channel || "",
        status: r.f.status || "New",
        address: r.f.address || "",
        description: r.f.description || "",
        property_address: r.f.property_id ? addr.get(r.f.property_id) || null : null,
        triage,
      };
    });
    return Response.json({ requests });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
