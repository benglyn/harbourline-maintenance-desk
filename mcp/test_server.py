"""Exercise every tool, resource and prompt over stdio. Rows the write tools create are deleted at the end.

Run: .venv\\Scripts\\python.exe test_server.py
"""

import asyncio
import json
import sys
from pathlib import Path

import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from server import API, HEADERS  # noqa: E402

failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")
    if not ok:
        failures.append(label)


async def call(session: ClientSession, name: str, args: dict | None = None):
    result = await session.call_tool(name, args or {})
    text = result.content[0].text if result.content else ""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


async def main() -> None:
    params = StdioServerParameters(command=sys.executable, args=[str(HERE / "server.py")], cwd=str(HERE))
    async with stdio_client(params) as (read, write), ClientSession(read, write) as session:
        init = await session.initialize()
        check("instructions mention Harbourline and find_property", "Harbourline Property Management" in (init.instructions or "") and "find_property" in (init.instructions or ""))

        tools = {t.name for t in (await session.list_tools()).tools}
        check("6 tools", tools == {"find_property", "job_history", "open_jobs", "list_tradies", "log_request", "create_or_update_job"}, str(sorted(tools)))
        resources = {r.name: str(r.uri) for r in (await session.list_resources()).resources}
        check("2 resources", set(resources) == {"agency_rules", "tradie_list"}, str(resources))
        prompts = {p.name for p in (await session.list_prompts()).prompts}
        check("2 prompts", prompts == {"triage_request", "weekly_summary"}, str(sorted(prompts)))

        r = await call(session, "find_property", {"query": "unit 8"})
        check("unit 8 -> 8 matches, call back", r["match_count"] == 8 and r.get("needs_call_back") is True, f"{r['match_count']} matches")
        r = await call(session, "find_property", {"query": "Find the Harbourline property at unit 8"})
        check("unit 8 in a sentence -> 8 matches", r["match_count"] == 8, f"{r['match_count']} matches")
        r = await call(session, "find_property", {"query": "69 Lakeside Ct, Toowong"})
        check("69 Lakeside Ct, Toowong -> one property", r["match_count"] == 1, json.dumps([m["property_id"] + " " + m["address"] for m in r["matches"]]))
        lakeside = r["matches"][0]["property_id"] if r["match_count"] == 1 else None
        check("sign_drafts_as on a single match", r.get("sign_drafts_as", "").endswith("Harbourline Property Management"), r.get("sign_drafts_as", ""))
        r = await call(session, "find_property", {"query": "69 Lakeside Crescent, Toowong"})
        check("Lakeside Crescent -> no match", r["match_count"] == 0)
        r = await call(session, "find_property", {"query": "18 Ferndale St, Wilston"})
        check("18 Ferndale St, Wilston -> only 4/18, call back", r["match_count"] == 1 and r["matches"][0]["address"].startswith("4/18"), json.dumps([m["address"] for m in r["matches"]]))
        r = await call(session, "find_property", {"query": "HPM-1201"})
        check("HPM-1201 -> both rows and a data warning", r["match_count"] == 2 and "data_warning" in r)

        r = await call(session, "job_history", {"property_id": "HPM-1130"})
        check("job_history HPM-1130 has jobs and sign_drafts_as", r["job_count"] > 0 and "sign_drafts_as" in r and "drafting_note" in r, f"{r['job_count']} jobs, total {r['total_cost']}")
        r = await call(session, "job_history", {"property_id": "HPM-1011"})
        check("job_history HPM-1011 shows hot water repeats", "Hot water" in json.dumps(r["jobs"]), str(r["repeat_categories_last_6_months"]))

        r = await call(session, "open_jobs", {"property_id": lakeside or "x"})
        j7050 = next((j for j in r["jobs"] if j["job_id"] == "J-7050"), None)
        check("open_jobs at Lakeside -> J-7050 Urgent Brightline since 1 Aug", bool(j7050) and j7050["urgency"] == "Urgent" and j7050["tradie"] == "Brightline Electrical" and j7050["reported"] == "2026-08-01", json.dumps(j7050 and {k: j7050[k] for k in ("status", "days_open", "sign_drafts_as")}))
        r = await call(session, "open_jobs", {})
        check("open_jobs all", r["count"] > 0 and all(j["status"] != "Completed" for j in r["jobs"]), f"{r['count']} open")
        r = await call(session, "open_jobs", {"property_manager": "Grace Liu"})
        check("open_jobs by PM", r["count"] > 0 and all(j["property_manager"] == "Grace Liu" for j in r["jobs"]), f"{r['count']} for Grace")

        r = await call(session, "list_tradies")
        check("list_tradies -> 8", len(r.get("tradies", [])) == 8, str(len(r.get("tradies", []))))

        r = await call(session, "create_or_update_job", {"property_id": "HPM-1130", "category": "General", "urgency": "Routine", "tradie": "Bob's Gas"})
        check("rejects tradie not on list", "error" in r and "not on the tradie list" in r["error"])
        r = await call(session, "create_or_update_job", {"job_id": "J-7050", "cost": 900, "status": "Booked"})
        check("rejects Booked over 500", "error" in r and "landlord" in r["error"])

        created = await call(session, "create_or_update_job", {"property_id": "HPM-1130", "category": "Air conditioning", "urgency": "Routine", "tradie": "Coolair Services"})
        new_job = created.get("job", {})
        check("creates a job", created.get("created") is True and new_job.get("status") == "Awaiting quote", new_job.get("job_id", str(created)))
        updated = await call(session, "create_or_update_job", {"job_id": new_job.get("job_id", "none"), "status": "Booked", "cost": 180})
        check("updates the job", updated.get("updated") is True and updated["job"].get("status") == "Booked")

        logged = await call(session, "log_request", {"address": "MCP TEST 1 Test St", "description": "MCP TEST row, delete me", "channel": "Email"})
        check("log_request", logged.get("logged") is True, str(logged.get("request_id")))
        r = await call(session, "log_request", {"address": "x", "description": "x", "channel": "Pigeon"})
        check("log_request rejects bad channel", "error" in r)

        text = (await session.read_resource(resources["agency_rules"])).contents[0].text
        check("agency_rules resource", "Urgency policy" in text and "Emergency repairs" in text, f"{len(text)} chars")
        text = (await session.read_resource(resources["tradie_list"])).contents[0].text
        check("tradie_list resource", text.count("\n") == 9 and "Coastline Plumbing" in text)

        p = await session.get_prompt("triage_request", {"request_text": "Tap dripping at 16 Example St"})
        body = p.messages[0].content.text
        check("triage_request prompt", "Harbourline Property Management" in body and "RTA" in body and "find_property" in body and "Tap dripping" in body)
        p = await session.get_prompt("weekly_summary", {})
        body = p.messages[0].content.text
        check("weekly_summary prompt", "check with the RTA" in body and "never as statements" in body and "Harbourline Property Management" in body)

    # Clean up rows the write tools created
    with httpx.Client(headers=HEADERS, timeout=30) as client:
        for table, field, value in (("Maintenance jobs", "job_id", new_job.get("job_id")), ("Requests", "address", "MCP TEST 1 Test St")):
            if not value:
                continue
            recs = client.get(f"{API}/{table}", params={"filterByFormula": f"{{{field}}}='{value}'"}).json()["records"]
            for rec in recs:
                client.delete(f"{API}/{table}/{rec['id']}").raise_for_status()
            print(f"cleaned up {len(recs)} test row(s) in {table}")
        count = 0
        offset = None
        while True:
            data = client.get(f"{API}/Maintenance jobs", params={"pageSize": 100, **({"offset": offset} if offset else {})}).json()
            count += len(data["records"])
            offset = data.get("offset")
            if not offset:
                break
        check("Maintenance jobs back to 183", count == 183, str(count))

    print(f"\n{'ALL PASSED' if not failures else 'FAILED: ' + ', '.join(failures)}")
    sys.exit(1 if failures else 0)


asyncio.run(main())
