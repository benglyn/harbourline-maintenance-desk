// Airtable REST via fetch, no caching. Table and field names are resolved from the
// base schema, so "Property ID" and "property_id" both work.

const API = "https://api.airtable.com/v0";

function cfg() {
  const pat = process.env.AIRTABLE_PAT;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!pat || !base) throw new Error("AIRTABLE_PAT or AIRTABLE_BASE_ID is not set in .env.local");
  return { pat, base };
}

async function at(path: string, init: RequestInit = {}): Promise<any> {
  const { pat } = cfg();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      cache: "no-store",
      headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

export const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export type Rec = { id: string; createdTime: string; f: Record<string, any> };
export type TableKey = "properties" | "jobs" | "tradies" | "requests";

type TableInfo = { id: string; name: string; fields: { name: string; type: string }[]; byNorm: Record<string, string> };
let schemaCache: { at: number; tables: Record<TableKey, TableInfo> } | null = null;

const MATCH: Record<TableKey, RegExp> = {
  properties: /propert/i,
  jobs: /maint|job/i,
  tradies: /tradie/i,
  requests: /request/i,
};

export async function schema(): Promise<Record<TableKey, TableInfo>> {
  if (schemaCache && Date.now() - schemaCache.at < 60_000) return schemaCache.tables;
  const { base } = cfg();
  const data = await at(`/meta/bases/${base}/tables`);
  const tables = {} as Record<TableKey, TableInfo>;
  for (const key of Object.keys(MATCH) as TableKey[]) {
    const t = data.tables.find((t: any) => MATCH[key].test(t.name));
    if (!t) throw new Error(`No ${key} table in the Airtable base`);
    const byNorm: Record<string, string> = {};
    for (const f of t.fields) byNorm[norm(f.name)] = f.name;
    tables[key] = { id: t.id, name: t.name, fields: t.fields, byNorm };
  }
  schemaCache = { at: Date.now(), tables };
  return tables;
}

// Records come back with snake_case keys whatever the Airtable field names are.
function toRec(r: any): Rec {
  const f: Record<string, any> = {};
  for (const [k, v] of Object.entries(r.fields || {})) f[norm(k)] = v;
  return { id: r.id, createdTime: r.createdTime, f };
}

export async function listAll(table: TableKey, params: Record<string, string> = {}): Promise<Rec[]> {
  const t = (await schema())[table];
  const out: Rec[] = [];
  let offset: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: "100", ...params });
    if (offset) q.set("offset", offset);
    const data = await at(`/${cfg().base}/${t.id}?${q}`);
    out.push(...data.records.map(toRec));
    offset = data.offset;
  } while (offset);
  return out;
}

export async function getRecord(table: TableKey, id: string): Promise<Rec> {
  const t = (await schema())[table];
  return toRec(await at(`/${cfg().base}/${t.id}/${id}`));
}

// Map snake_case keys to the real field names; drop keys the table doesn't have.
async function toFields(table: TableKey, data: Record<string, any>) {
  const t = (await schema())[table];
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    const real = t.byNorm[norm(k)];
    if (real && v !== undefined) fields[real] = v;
  }
  return fields;
}

export async function createRecords(table: TableKey, rows: Record<string, any>[]): Promise<Rec[]> {
  const t = (await schema())[table];
  const out: Rec[] = [];
  for (let i = 0; i < rows.length; i += 10) {
    const records = await Promise.all(rows.slice(i, i + 10).map(async (r) => ({ fields: await toFields(table, r) })));
    const data = await at(`/${cfg().base}/${t.id}`, { method: "POST", body: JSON.stringify({ records, typecast: true }) });
    out.push(...data.records.map(toRec));
  }
  return out;
}

export async function updateRecord(table: TableKey, id: string, data: Record<string, any>): Promise<Rec> {
  const t = (await schema())[table];
  const fields = await toFields(table, data);
  return toRec(await at(`/${cfg().base}/${t.id}/${id}`, { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) }));
}

export async function deleteRecords(table: TableKey, ids: string[]) {
  const t = (await schema())[table];
  for (let i = 0; i < ids.length; i += 10) {
    const q = ids.slice(i, i + 10).map((id) => `records[]=${id}`).join("&");
    await at(`/${cfg().base}/${t.id}?${q}`, { method: "DELETE" });
  }
}

export async function hasField(table: TableKey, name: string) {
  return !!(await schema())[table].byNorm[norm(name)];
}
