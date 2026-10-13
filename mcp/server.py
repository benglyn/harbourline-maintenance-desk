"""Harbourline MCP server for Claude Desktop (stdio).

Reads and writes the Harbourline Airtable base over REST. Settings come from ../.env.local
(AIRTABLE_PAT, AIRTABLE_BASE_ID). Everything is fictional sample data.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
from mcp.server.mcpserver import MCPServer

logging.getLogger("httpx").setLevel(logging.WARNING)

ROOT = Path(__file__).resolve().parent.parent
AGENCY = "Harbourline Property Management"
BRISBANE = timezone(timedelta(hours=10), "AEST")  # Queensland has no daylight saving
DRAFTING_NOTE = (
    "Sign drafts as sign_drafts_as (the property manager and Harbourline Property Management), "
    "never the user's own name or business. Australian spelling, no em dashes, no legal positions: "
    "tenancy-law points go under 'check with the RTA'."
)

CHANNELS = ["Portal", "Voice", "Email", "Text", "Web form", "Tradie report"]
CATEGORIES = ["Air conditioning", "Appliance", "Electrical", "Garden", "General", "Hot water", "Locks and keys", "Pest control", "Plumbing"]
URGENCIES = ["Emergency", "Urgent", "Routine"]
STATUSES = ["Awaiting landlord approval", "Awaiting quote", "Booked", "Completed"]
APPROVAL_LIMIT = 500


def load_env() -> dict[str, str]:
    env = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if re.match(r"^[A-Z_]+=", line):
            key, _, value = line.partition("=")
            env[key] = value.strip()
    return env


ENV = load_env()
API = f"https://api.airtable.com/v0/{ENV['AIRTABLE_BASE_ID']}"
HEADERS = {"Authorization": f"Bearer {ENV['AIRTABLE_PAT']}"}


# ---------- Airtable ----------

def at_list(table: str, formula: str | None = None) -> list[dict]:
    rows, offset = [], None
    with httpx.Client(headers=HEADERS, timeout=30) as client:
        while True:
            params = {"pageSize": 100}
            if formula:
                params["filterByFormula"] = formula
            if offset:
                params["offset"] = offset
            r = client.get(f"{API}/{table}", params=params)
            r.raise_for_status()
            data = r.json()
            rows += [{"_record_id": rec["id"], **rec["fields"]} for rec in data["records"]]
            offset = data.get("offset")
            if not offset:
                return rows


def at_write(method: str, table: str, fields: dict, record_id: str | None = None) -> dict:
    url = f"{API}/{table}" + (f"/{record_id}" if record_id else "")
    with httpx.Client(headers=HEADERS, timeout=30) as client:
        r = client.request(method, url, json={"fields": fields, "typecast": True})
        r.raise_for_status()
        rec = r.json()
        return {"_record_id": rec["id"], **rec["fields"]}


_cache: dict[str, tuple[float, list[dict]]] = {}


def cached(table: str, seconds: int = 300) -> list[dict]:
    hit = _cache.get(table)
    if hit and time.time() - hit[0] < seconds:
        return hit[1]
    rows = at_list(table)
    _cache[table] = (time.time(), rows)
    return rows


def properties() -> list[dict]:
    return cached("Properties")


def tradies() -> list[dict]:
    return cached("Tradies")


def jobs() -> list[dict]:
    return at_list("Maintenance jobs")


def clean(row: dict) -> dict:
    return {k: v for k, v in row.items() if k != "_record_id"}


def today() -> date:
    return datetime.now(BRISBANE).date()


def now_text() -> str:
    return datetime.now(BRISBANE).strftime("%A %d %B %Y, %I:%M%p").replace(" 0", " ") + " (Brisbane time, AEST UTC+10)"


def signature(pm: str | None) -> str:
    return f"{pm}, {AGENCY}" if pm else AGENCY


# ---------- Address matching ----------

ABBREVIATIONS = {
    "st": "street", "ct": "court", "rd": "road", "ave": "avenue", "av": "avenue", "cres": "crescent",
    "cr": "crescent", "dr": "drive", "pde": "parade", "tce": "terrace", "pl": "place", "ln": "lane",
    "hwy": "highway", "cl": "close", "bvd": "boulevard", "blvd": "boulevard", "esp": "esplanade", "gr": "grove",
    "cct": "circuit", "wy": "way", "sq": "square",
}


def words(text: str) -> list[str]:
    return [ABBREVIATIONS.get(w, w) for w in re.findall(r"[a-z]+", text.lower())]


def split_address(address: str) -> tuple[str | None, str | None, list[str]]:
    m = re.match(r"\s*(?:(\d+[a-z]?)\s*/\s*)?(\d+[a-z]?)\s+(.*)", address.lower())
    if not m:
        return None, None, words(address)
    return m.group(1), m.group(2), words(m.group(3))


def match_properties(query: str) -> list[dict]:
    q = query.strip()
    pid = re.search(r"hpm-?\s*(\d{4})", q, re.I)
    if pid:
        want = f"HPM-{pid.group(1)}"
        return [p for p in properties() if p.get("property_id") == want]

    ql = q.lower()
    unit = None
    m = re.search(r"\b(?:unit|apartment|apt|flat|u)\s*#?\s*(\d+[a-z]?)\b", ql)
    if m:
        unit = m.group(1)
        ql = ql[: m.start()] + " " + ql[m.end():]
    m = re.search(r"\b(\d+[a-z]?)\s*/\s*(\d+[a-z]?\s+[a-z].*)", ql)
    if m:
        unit = unit or m.group(1)
        ql = ql[: m.start()] + m.group(2)
    m = re.search(r"\b(\d+[a-z]?)\s+([a-z][a-z ,]*)", ql)
    number = m.group(1) if m else None
    qwords = set(words(ql))

    suburbs = {p.get("suburb", "").lower() for p in properties()}
    named_suburbs = {s for s in suburbs if s and re.search(rf"\b{re.escape(s)}\b", q.lower())}

    out = []
    for p in properties():
        p_unit, p_number, p_street = split_address(p.get("address", ""))
        if unit and p_unit != unit:
            continue
        if number and p_number != number:
            continue
        if named_suburbs and p.get("suburb", "").lower() not in named_suburbs:
            continue
        street_given = bool(qwords - set(words(" ".join(named_suburbs))) - {"street", "road", "court"} - STOP)
        if street_given and not set(p_street) <= qwords:
            continue
        if not (unit or number or street_given or named_suburbs):
            continue
        out.append(p)
    return out


STOP = {"the", "at", "in", "property", "properties", "harbourline", "find", "which", "one", "is", "it", "qld", "brisbane", "and", "of", "a"}


def property_view(p: dict) -> dict:
    view = clean(p)
    view["sign_drafts_as"] = signature(p.get("property_manager"))
    return view


# ---------- Jobs ----------

def job_view(j: dict, today_: date) -> dict:
    view = clean(j)
    if j.get("status") != "Completed" and j.get("reported"):
        opened = date.fromisoformat(j["reported"])
        view["days_open"] = (today_ - opened).days
    return view


def property_index() -> dict[str, list[dict]]:
    index: dict[str, list[dict]] = {}
    for p in properties():
        index.setdefault(p.get("property_id", ""), []).append(p)
    return index


# ---------- Server ----------

INSTRUCTIONS = f"""You are working for {AGENCY}, a fictional residential property manager in Brisbane. These tools read and write Harbourline's live Airtable base (properties, maintenance jobs, tradies, requests).

- Any question about a property, an address or a bare unit number (for example "unit 8") goes to find_property first. Do not search past chats or memory for Harbourline data.
- find_property returns every match. If there is more than one, list them all and say a call back is needed to confirm which one. Never guess.
- Only use tradies from the tradie list. If no tradie's trades match (for example gas), say so; never invent one.
- Over {APPROVAL_LIMIT} dollars needs the landlord's approval first: draft the approval request, not a work order.
- Sign every draft with sign_drafts_as from the tool result: the property manager on the property and "{AGENCY}". Never sign with the user's own name or business.
- Tenancy-law points: flag them as things to check with the RTA (Residential Tenancies Authority). Never state them as fact.
- Tenant references only (for example T-5010), never tenant names. Australian spelling. Do not use em dashes."""

mcp = MCPServer("harbourline", instructions=INSTRUCTIONS)


@mcp.tool()
def find_property(query: str) -> dict:
    """Find Harbourline properties by address, unit number (e.g. "unit 8"), street, suburb or property ID (HPM-1234).
    Returns ALL matches and never guesses. More than one match means a call back is needed to confirm the property."""
    matches = match_properties(query)
    result: dict = {"query": query, "match_count": len(matches), "matches": [property_view(p) for p in matches]}
    ids = [p.get("property_id") for p in matches]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        result["data_warning"] = f"Property ID(s) {', '.join(dupes)} appear more than once in the rent roll; flag for the property manager to fix."
    if len(matches) == 1:
        result["sign_drafts_as"] = signature(matches[0].get("property_manager"))
    else:
        result["needs_call_back"] = True
        result["note"] = "No single match. List every match (or say none was found) and ask the caller to confirm the full address. Do not guess." if matches else "No property matched. Ask for the full address including unit number."
        result["sign_drafts_as"] = AGENCY
    result["drafting_note"] = DRAFTING_NOTE
    return result


@mcp.tool()
def job_history(property_id: str) -> dict:
    """Full maintenance job history for one property (by property ID, e.g. HPM-1290), oldest first,
    with days_open for jobs not yet completed, totals and categories seen more than once in the last six months (repeat faults)."""
    pid = property_id.strip().upper()
    props = property_index().get(pid, [])
    t = today()
    rows = sorted((j for j in jobs() if j.get("property_id") == pid), key=lambda j: j.get("reported", ""))
    six_months_ago = t - timedelta(days=183)
    recent: dict[str, int] = {}
    for j in rows:
        if j.get("reported") and date.fromisoformat(j["reported"]) >= six_months_ago:
            recent[j.get("category", "")] = recent.get(j.get("category", ""), 0) + 1
    pm = props[0].get("property_manager") if props else None
    return {
        "property_id": pid,
        "property": [clean(p) for p in props],
        "today": now_text(),
        "job_count": len(rows),
        "total_cost": sum(j.get("cost", 0) or 0 for j in rows),
        "repeat_categories_last_6_months": {k: v for k, v in recent.items() if v >= 2},
        "jobs": [job_view(j, t) for j in rows],
        "sign_drafts_as": signature(pm),
        "drafting_note": DRAFTING_NOTE,
    }


@mcp.tool()
def open_jobs(property_id: str | None = None, property_manager: str | None = None, tradie: str | None = None) -> dict:
    """Maintenance jobs not yet completed, oldest first, with days_open, the property address and property manager.
    Optionally filter by property ID, property manager (Dev Patel, Grace Liu, Mia Thompson) or tradie."""
    index = property_index()
    t = today()
    out = []
    for j in jobs():
        if j.get("status") == "Completed":
            continue
        if property_id and j.get("property_id") != property_id.strip().upper():
            continue
        if tradie and tradie.lower() not in (j.get("tradie") or "").lower():
            continue
        p = (index.get(j.get("property_id", "")) or [{}])[0]
        if property_manager and property_manager.lower() not in (p.get("property_manager") or "").lower():
            continue
        view = job_view(j, t)
        view["address"] = f"{p.get('address', '?')}, {p.get('suburb', '')}".strip(", ")
        view["property_manager"] = p.get("property_manager")
        view["sign_drafts_as"] = signature(p.get("property_manager"))
        out.append(view)
    out.sort(key=lambda j: j.get("reported", ""))
    pm_sign = signature(out[0]["property_manager"]) if out and len({j["property_manager"] for j in out}) == 1 else AGENCY
    return {"today": now_text(), "count": len(out), "jobs": out, "sign_drafts_as": pm_sign, "drafting_note": DRAFTING_NOTE}


@mcp.tool()
def list_tradies() -> dict:
    """Harbourline's approved tradies and their trades. Only these tradies may be used."""
    return {"tradies": [clean(t) for t in tradies()], "note": "Only these tradies may be used. If none matches the trade needed, say so."}


@mcp.tool()
def log_request(address: str, description: str, channel: str = "Email") -> dict:
    """Log a new maintenance request in the Requests table (status New) so the triage board picks it up.
    channel: Portal, Voice, Email, Text, Web form or Tradie report. Use tenant references, never names."""
    if channel not in CHANNELS:
        return {"error": f"channel must be one of {CHANNELS}"}
    row = at_write("POST", "Requests", {
        "received_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "channel": channel, "status": "New", "address": address, "description": description,
    })
    return {"logged": True, "request_id": row.get("request_id"), "status": "New", "note": "The triage board will triage it within a few seconds."}


@mcp.tool()
def create_or_update_job(
    property_id: str | None = None,
    category: str | None = None,
    urgency: str | None = None,
    tradie: str | None = None,
    status: str | None = None,
    cost: float | None = None,
    days_to_complete: int | None = None,
    job_id: str | None = None,
) -> dict:
    """Create a maintenance job, or update one when job_id (e.g. J-7050) is given.
    Rejects any tradie not on the tradie list. Jobs over 500 dollars cannot be Booked without landlord approval:
    use status "Awaiting landlord approval". New jobs need property_id, category, urgency and tradie."""
    names = {t.get("tradie") for t in tradies()}
    if tradie is not None and tradie not in names:
        return {"error": f"'{tradie}' is not on the tradie list. Use one of: {sorted(names)}. If none fits, say so; never invent a tradie."}
    for value, allowed, label in ((category, CATEGORIES, "category"), (urgency, URGENCIES, "urgency"), (status, STATUSES, "status")):
        if value is not None and value not in allowed:
            return {"error": f"{label} must be one of {allowed}"}

    fields = {k: v for k, v in {"category": category, "urgency": urgency, "tradie": tradie, "status": status, "cost": cost, "days_to_complete": days_to_complete}.items() if v is not None}
    all_jobs = jobs()

    if job_id:
        existing = next((j for j in all_jobs if j.get("job_id") == job_id.strip().upper()), None)
        if not existing:
            return {"error": f"No job {job_id}."}
        final_cost = fields.get("cost", existing.get("cost")) or 0
        if final_cost > APPROVAL_LIMIT and fields.get("status", existing.get("status")) == "Booked":
            return {"error": f"Cost {final_cost} is over {APPROVAL_LIMIT} dollars: set status 'Awaiting landlord approval' and draft the landlord approval request first."}
        if not fields:
            return {"error": "Nothing to update."}
        row = at_write("PATCH", "Maintenance jobs", fields, existing["_record_id"])
        return {"updated": True, "job": clean(row)}

    pid = (property_id or "").strip().upper()
    props = property_index().get(pid)
    if not props:
        return {"error": f"No property {property_id}. Use find_property first."}
    missing = [k for k in ("category", "urgency", "tradie") if k not in fields]
    if missing:
        return {"error": f"New jobs need {missing}."}
    fields.setdefault("status", "Awaiting quote")
    if (fields.get("cost") or 0) > APPROVAL_LIMIT and fields["status"] == "Booked":
        return {"error": f"Cost over {APPROVAL_LIMIT} dollars: use status 'Awaiting landlord approval' and draft the landlord approval request first."}
    next_no = max(int(m.group(1)) for j in all_jobs if (m := re.match(r"J-(\d+)", j.get("job_id", "")))) + 1
    fields.update({"job_id": f"J-{next_no}", "property_id": pid, "suburb": props[0].get("suburb"), "reported": today().isoformat()})
    row = at_write("POST", "Maintenance jobs", fields)
    return {"created": True, "job": clean(row), "sign_drafts_as": signature(props[0].get("property_manager"))}


@mcp.resource("harbourline://agency-rules", name="agency_rules", mime_type="text/markdown")
def agency_rules() -> str:
    """Harbourline's triage procedure and urgency policy, plus the QLD repair notes (background only, never advice)."""
    procedure = (ROOT / "triage-procedure.md").read_text(encoding="utf-8")
    qld = (ROOT / "qld-repair-rules.md").read_text(encoding="utf-8")
    return f"{procedure}\n\n---\n\n{qld}"


@mcp.resource("harbourline://tradie-list", name="tradie_list", mime_type="text/markdown")
def tradie_list() -> str:
    """Harbourline's approved tradies and their trades."""
    lines = ["| Tradie | Trades |", "|---|---|"] + [f"| {t.get('tradie')} | {t.get('trades')} |" for t in tradies()]
    return "\n".join(lines)


SHARED_RULES = f"""You work for {AGENCY}. Use the Harbourline tools for every fact: find_property first for any address or bare unit number (never past chats), then job_history or open_jobs. Never guess a property: if find_property returns more than one match, say a call back is needed. Only use tradies from the list. Over {APPROVAL_LIMIT} dollars needs landlord approval first. Sign drafts with sign_drafts_as from the tool results (property manager plus "{AGENCY}"), never the user's own name or business. Flag any tenancy-law point as something to check with the RTA; never state it as fact. Tenant references only, never names. Australian spelling. Do not use em dashes."""


@mcp.prompt()
def triage_request(request_text: str) -> str:
    """Triage one maintenance request with Harbourline's procedure (read-only: drafts, never sends)."""
    return f"""{SHARED_RULES}

Triage this maintenance request using the agency_rules procedure. Match the property, check its job history and open jobs, then give: urgency (Emergency, Urgent, Routine, Not maintenance or Job update), the property (or needs call back and why), existing job or duplicate, repeat fault, tradie from the list, the next step, a short tenant reply, a work order or landlord approval request, and things to confirm (including anything to check with the RTA). Do not log or change anything unless I ask.

Request:
{request_text}"""


@mcp.prompt()
def weekly_summary() -> str:
    """Weekly maintenance summary for Harbourline's property managers."""
    return f"""{SHARED_RULES}

Write this week's maintenance summary for Harbourline's three property managers (Dev Patel, Grace Liu, Mia Thompson). Today is {now_text()}; use times as given.

Use open_jobs and job_history. Cover:
1. Open jobs by property manager: job, property, urgency, tradie, status, days open. Oldest first.
2. Repeat faults: properties with the same kind of fault twice or more in six months, and whether to raise replacement with the landlord.
3. Tradie follow-ups: jobs Booked or Awaiting quote for more than 14 days, with a one-line chase for each tradie.
4. Awaiting landlord approval: what's waiting and for how long.
5. Questions to check with the RTA: any tenancy-law points raised by the above, as questions, never as statements of the law.

Keep it short, with tables where they help."""


if __name__ == "__main__":
    mcp.run()
