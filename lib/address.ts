// Address matching in code. Never guesses: a match is one property or nothing.

const TYPES: Record<string, string> = {
  street: "st", drive: "dr", court: "ct", crescent: "cres", avenue: "ave", terrace: "tce", road: "rd",
  place: "pl", parade: "pde", lane: "ln", close: "cl", boulevard: "bvd", highway: "hwy", circuit: "cct", esplanade: "esp",
};

export function clean(s: string) {
  return (" " + s.toLowerCase().replace(/[.,;:()]/g, " ").replace(/\s+/g, " ") + " ")
    .replace(/ ([a-z]+) /g, (m, w) => (TYPES[w] ? ` ${TYPES[w]} ` : m))
    .replace(/ ([a-z]+) /g, (m, w) => (TYPES[w] ? ` ${TYPES[w]} ` : m))
    .replace(/\s+/g, " ");
}

type Parsed = { unit?: string; num?: string; rest: string };

export function parseAddress(raw: string): Parsed {
  let s = clean(raw);
  let unit: string | undefined;
  let num: string | undefined;
  const slash = s.match(/ (\d+)\s*\/\s*(\d+)/);
  if (slash) {
    unit = slash[1];
    num = slash[2];
    s = s.replace(slash[0], " ");
  } else {
    const u = s.match(/ (?:unit|apartment|apt|flat|u) ?(\d+)/);
    if (u) {
      unit = u[1];
      s = s.replace(u[0], " ");
    }
    const n = s.match(/ (\d+)[a-z]? /);
    if (n) {
      num = n[1];
      s = s.replace(n[0], " ");
    }
  }
  return { unit, num, rest: s };
}

export type PropertyLike = { property_id: string; address: string; suburb: string; [k: string]: any };

export type MatchResult = {
  property: PropertyLike | null;
  candidates: PropertyLike[];
  reason: string | null;
};

export function matchProperty(address: string, properties: PropertyLike[]): MatchResult {
  // HPM-1201 is in the rent roll twice: one property per ID.
  const unique = [...new Map(properties.map((p) => [p.property_id, p])).values()];
  if (!address || !address.trim()) return { property: null, candidates: [], reason: "No address given." };
  const req = parseAddress(address);
  const parsedProps = unique.map((p) => ({ p, a: parseAddress(p.address), street: parseAddress(p.address).rest.trim(), suburb: clean(p.suburb).trim() }));
  const suburbNamed = parsedProps.some((x) => x.suburb && req.rest.includes(` ${x.suburb} `));

  if (!req.num && req.unit) {
    const c = parsedProps.filter((x) => x.a.unit === req.unit).map((x) => x.p);
    return { property: null, candidates: c, reason: `Only a unit number was given ("unit ${req.unit}"). ${c.length} properties have a unit ${req.unit}.` };
  }
  if (!req.num) return { property: null, candidates: [], reason: "The address has no street number." };

  const sameStreet = parsedProps.filter((x) => x.a.num === req.num && x.street && req.rest.includes(` ${x.street} `));
  let exact = sameStreet.filter((x) => x.a.unit === req.unit);
  if (suburbNamed) exact = exact.filter((x) => req.rest.includes(` ${x.suburb} `));
  if (exact.length === 1) return { property: exact[0].p, candidates: [exact[0].p], reason: null };
  if (exact.length > 1)
    return { property: null, candidates: exact.map((x) => x.p), reason: `The address matches ${exact.length} properties.` };

  let near = sameStreet;
  if (suburbNamed) near = near.filter((x) => req.rest.includes(` ${x.suburb} `));
  if (near.length) {
    const list = near.map((x) => `${x.p.address}, ${x.p.suburb}`).join("; ");
    const reason = req.unit
      ? `No unit ${req.unit} at that address on our books. Properties there: ${list}.`
      : `No unit number given, and we only manage units at that address: ${list}.`;
    return { property: null, candidates: near.map((x) => x.p), reason };
  }
  return { property: null, candidates: [], reason: "The address does not match any property we manage." };
}
