import { listAll, schema, type TableKey } from "@/lib/airtable";

export async function GET() {
  try {
    const t = await schema();
    const keys: TableKey[] = ["properties", "jobs", "tradies", "requests"];
    const counts = await Promise.all(keys.map(async (k) => [t[k].name, (await listAll(k, { "fields[]": t[k].fields[0].name })).length] as const));
    return Response.json({ ok: true, counts: Object.fromEntries(counts) });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
