# CLAUDE.md: Harbourline Maintenance Desk (build night)

Built from scratch tonight in about 100 minutes with Claude Code on Opus 5.5 (medium effort). Stop building at **7:40pm**. Demo is about **2 minutes**. Optimised after practice runs 1 (8 Oct) and 2 (9 Oct): everything below was built and tested. In run 2 the whole build took 40 minutes, so the checkpoint times have slack.

## The problem (say this first in the demo)

A seven-person Brisbane property management agency gets maintenance requests by phone, web form, email and text. On Monday morning someone sorts them by hand, and the gas leak is buried under a dripping tap.

## What we are building

| Part | What it does |
|---|---|
| **Airtable base** | Source of truth: Properties (**351 rows**, HPM-1201 deliberately twice), Maintenance jobs (183), Tradies (8), Requests (empty; every channel lands here). Plus an Interface for reporting |
| **Tenant portal** (`/portal`) | Form: address, description, optional photo. Saves a Request, triages it straight away, shows "Triaging with Sonnet 5.5... N s", then the drafted reply. Stores nothing itself. **Photos are never stored:** shrunk in the browser, sent only to Claude; only Claude's one-line `photo_description` is saved. **Sample card** to the right of the form (stacked below on narrow screens): the portal sample from `guide.json` (address and description, each with a Copy button, plus "Attach a photo of water under a sink") |
| **Talk to Jane** (`/talk`, its own page) | Browser voice call with live transcript and a two-sentence summary at the end, plus two sample cards beside the transcript (see Talk to Jane) |
| **Triage agent** (`lib/triage.ts`, `/api/triage`) | A workflow, not a tool loop (see How triage works). `claude-sonnet-5-5` at **effort low** (7-13 s per request), from `ANTHROPIC_MODEL`. Haiku 5.5 was tested in run 2 and rejected (failed 01 aircon, and slower). System prompt: `triage-procedure.md` + `qld-repair-rules.md` |
| **Triage board** (`/board`) | Compact cards, Emergency first, newest first within each urgency. Card: urgency badge, flags, one-line issue, one-line "Next:", rest under Details. **Details:** each section on its own line under a small bold heading (Tradie, Things to confirm, Tenant reply, Work order, Landlord approval, Original request, Callback, Access), line breaks kept; Callback and Access split out of voice descriptions; ends "Triaged by Sonnet 5.5" (friendly model name; the model ID is saved inside `triage_json`). Filters: urgency, flags, date, and a **property address** text box (about 20 characters wide, contains, case-insensitive), with "Showing X of Y requests". Refreshes every 5 s and **triages any row still marked New** (voice rows), showing "Triaging with Sonnet 5.5...". Leaves a Portal row alone for its first 60 s (the portal is triaging it with the photo) |
| **Architecture** (`/architecture`) | The two prepared diagrams from the kit's `architecture/` folder, copied into `public/architecture/`: **System architecture** (`architecture.png`, how the parts connect) and **Skills map** (`skills-map.png`, the AI Adoption Series skills mapped to Harbourline). Two tab buttons switch between them. Each image sits full width on a white rounded card (the diagrams have light backgrounds) and opens full size in a new tab when clicked. For judges' questions and the video |
| **Guide** (`/guide`) | Renders `guide.json` (prepared, in the kit). Two tabs. **Test as you build:** one card per component in build order, each with a "When" tag, an Open button for its page, tick boxes saved in the browser, a Request/Expect table for the answer key, sample inputs and Claude Desktop questions in grey boxes with Copy buttons, amber notes. **Demo:** starts with the **Brought vs built** card from `demo.provenance` (two columns, "Brought" and "Built tonight", then the `say` line in a quote box), then the "Before you go up" list, a run-sheet timeline (time, page link, what to do, the line to say in a quote box, Optional tags), the fallback in red, and the freeze checklist as tick boxes |
| **Demo** (`/demo`) | Renders `demo.json` (prepared, in the kit). Two tabs: **Competition video (2 min)**, starting on the architecture diagram, and **Long video (about 12 min)**, a walkthrough for a partner. Each: who it is for, a "Before you record" list, then the run sheet as a table: competition video **Time / Area / Task** (Talk to Jane gets 25 s), long video **Time / Section / Area / Subtask** (sections Overview, Triage board, Live channels, Claude Desktop, Close, each spanning its rows). Area is a page link opening in a new tab; under each task, what to do and either the line to say in a quote box or talking points. A red fallback box at the end |
| **Make.com scenario** | Vapi end-of-call report to a new Requests row (channel Voice, status New). Built through the Make API |
| **MCP server** (`mcp/`) | Python, stdio, for Claude Desktop: 6 tools, 2 resources, 2 prompts (see MCP server) |

## Stack (decided)

- **App:** Next.js 16 (App Router, TypeScript), Tailwind, Anthropic TypeScript SDK, Airtable REST via `fetch` with no-store (Next 16.4 rejects `export const dynamic`). **Runs on localhost: no Vercel deploy** (decided after run 1). **Scaffold without touching the kit files:** `create-next-app` overwrites `CLAUDE.md` (run 3), so scaffold into a temporary folder and move the app files up, never replacing `CLAUDE.md`, `guide.json` or anything in the kit.
- **MCP server:** Python, official `mcp` SDK **2.x (FastMCP is now `MCPServer`, same decorators)**, stdio, own venv in `mcp/`.
- **Secrets:** `.env.local` only (every setting explained in `.env.example`). Never print values.
- **Two chats:** the main chat (A) builds the app; the second chat (B) does Airtable, Make.com and MCP. They never edit the same files, and each commits only its own files. Prompts are in `prompts.md`.

## Build order and checkpoints

| By | Done | Prompt |
|---|---|---|
| 6:00 | **Swap `ANTHROPIC_API_KEY` for the event's credited key** (night only; practice keeps the everyday key) | |
| 6:15 | Next.js scaffold, shared menu, one Airtable read works | A1 |
| 6:20 | Airtable base, 542 rows, Interface published | B1 |
| 6:45 | Triage passes `npm run check` (all checks) | A1 |
| 7:05 | Portal (photo, sample card) and board (filters, Details) live end to end | A1 |
| 7:15 | Make.com: the sample payload lands in Requests (real call after A2) | B2 |
| 7:25 | Talk to Jane page (sample cards); Guide page; real test call | A2 |
| 7:35 | MCP server in Claude Desktop | B3 |
| 7:40 | **Freeze.** Follow the Guide's freeze checklist: `npm run check`, delete live test rows, one clean voice call and one clean portal request | |
| 7:40-8:00 | Record a backup video, rehearse twice | |

## Cut order if behind at 7:00

1. MCP server. 2. Guide page (use `guide.json` in an editor instead). 3. Talk to Jane page (test calls from the Vapi dashboard). 4. Make.com (voice calls shown as seed call summaries). Never drop: portal, triage, board.

## How triage works

1. **Code looks up:** match the address to Properties; pull the property's full job history, its last 30 days of Requests and the tradie list.
2. **Code applies hard rules:** an address matching none or several properties gets `needs_call_back` (never guess). Only tradies from the list. Over 500 dollars: landlord approval, not a work order.
3. **One Claude call:** request text, photo (if any, and say whether one was attached) and all the looked-up data in; triage JSON out, enforced with JSON schema output. Send full records, not extracts.
4. **Code saves** the result to the Request row and marks it Triaged.

**Answer-key check (`npm run check`):** finds and removes previous seed rows by matching their descriptions (never touches live rows), loads the 8 `seed/inbox` files with **dates shifted so the newest is 2 hours before now** (live requests always sort newest), triages them **one at a time in file order** (so 04 sees 03), and asserts in code. No AI judge.

## Answer key (the 8 seed requests)

| # | Expect |
|---|---|
| 02 gas | Emergency; next step says "**the after-hours transfer was not answered**"; no gasfitter on the tradie list |
| 06 unit 8 lock | **Emergency** (premises can't be secured) **and** `needs_call_back` (eight properties have a unit 8) |
| 05 power points | Urgent; existing job J-7050 (open since 1 August); chase Brightline |
| 01 aircon | Routine; repeat fault at HPM-1130 (highest maintenance spend) |
| 03 + 04 tap | One job: 04 is a duplicate of 03 (HPM-1290) |
| 07 cat and TV bracket | Not maintenance; route to Grace; nothing approved or refused |
| 08 tradie report | Job update J-7302 (2,380 dollars); **repeat fault true** (HPM-1011's hot water history); ceiling leak from unit 5/18 goes to things to confirm |

Count rule: among requests matched to a property, 02 is the only Emergency. On the board 06 sits above 02 (both Emergency, 06 is newer); the demo line says "the two emergencies are at the top".

## Triage output (one JSON object per request)

`urgency` (Emergency | Urgent | Routine | Not maintenance | Job update), `property_id` or `needs_call_back`, `issue`, `existing_job_id`, `duplicate_of`, `repeat_fault` + `repeat_note`, `property_manager`, `tradie`, `next_step`, `tenant_reply`, `work_order` or `landlord_approval`, `things_to_confirm`, `photo_description`.

## Talk to Jane (same pattern as reception.benglyn.com, written fresh)

1. `new Vapi(NEXT_PUBLIC_VAPI_PUBLIC_KEY)`, `start(NEXT_PUBLIC_VAPI_ASSISTANT_ID)`.
2. Live transcript from `message` events with `type === "transcript"` and `transcriptType === "final"`, labelled caller and Jane.
3. On `call-end`, POST the transcript to `/api/summary` (`claude-sonnet-5-5`, two sentences: what the caller wanted, what Jane did, no em dashes). **Display only, never saved.** Make.com logs the call.
4. **Two sample cards** to the right of the transcript (stacked below on narrow screens), headed "Try saying", with exactly this text. They answer Jane's usual questions up front, so calls stay short:
   - **Hot water:** "Hi, the hot water's stopped at 18 Ferndale St, Wilston. It went cold this morning and there's no leaking or smell. You can call me back on 0400 000 001. For access, the key's in the lockbox by the front door, and there are no pets." (No unit number: the only property is 4/18, so expect a call back.)
   - **Power points:** "Hi, two power points in the kitchen at 69 Lakeside Court, Toowong stopped working a week ago and it's stayed the same. No sparks or burning smell. You can call me back on 0400 000 002. I work from home so any time is fine, there are no pets and no lockbox." (Write "Court", not "Ct", so it's read aloud correctly; "Crescent" correctly gets a call back.)

## Make.com and Vapi (lessons from run 1)

- Make API host `{MAKE_ZONE}.make.com`, header `Authorization: Token <token>` **and a normal User-Agent** (otherwise 403 "error code: 1010").
- Vapi's real end-of-call payload: structured data at `message.analysis.structuredData`, call ID at `message.call.id`, summary at `message.analysis.summary`.
- Map into Requests: channel Voice, status New, call_id, address, description = "SAFETY RISK: " (if true) + issue + summary + "Callback: " + "Access: ". received_at as plain ISO.
- If a Make run fails with "Failed to verify connection ... 400", the Airtable OAuth connection needs reauthorising in the Make UI.

## MCP server

- Tools: `find_property` (returns all matches, never guesses), `job_history`, `open_jobs`, `list_tradies`, `log_request`, `create_or_update_job` (rejects tradies not on the list). Resources: `agency_rules`, `tradie_list`. Prompts: `triage_request`, `weekly_summary`.
- `weekly_summary` and every prompt: **flag tenancy-law points to check with the RTA; never state them as fact.**
- Server instructions and both prompts: **Claude works for Harbourline Property Management**; any question about a property, address or bare unit number ("unit 8") goes to `find_property` first, not past chats (run 3: a fresh chat searched past chats). Drafts are signed by the property manager on the property and "Harbourline Property Management", never the user's own name or business (run 3 signed as the user's own business) Instructions alone lost to the user's Claude Desktop profile, so `find_property`, `job_history` and `open_jobs` also return `sign_drafts_as` ("Dev Patel, Harbourline Property Management") and a one-line drafting note.
- **After the restart (action for Ben, not Claude Code):** set the Harbourline tools to **Always allow** in Claude Desktop (Connectors or the tools menu, or Always allow on the first prompt), otherwise every tool call asks permission mid-demo (run 3).
- Claude Desktop is the **Microsoft Store version**: config at `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\claude_desktop_config.json`. Back it up, merge (keep any existing servers), use the venv's full `python.exe` path. Restart means Quit from the system tray.

## Rules

- Everything is fictional. Tenant references only (T-5010), never names on the board.
- No legal positions in drafts or summaries. Tenancy rules go under things to confirm.
- Australian spelling. No em dashes in any UI text or generated text (say so in every prompt).
- Simple over clever: no auth, no tests beyond the answer-key check.
- **Brand (Ben Glyn, internal-app style), from the first page:** one dark navy theme, no light mode. Page `#162F52`, header `#0F2340`, cards and panels `#1C3A63`, inputs, Details and hover `#224575`. Text `#F0F4F8`, muted text `#A9B8CC`, borders `#2C4A75`. Primary buttons: gradient `#3860EF` to `#0DBEE4`, white text. **Gold `#F0C060` only for small labels on navy** (eyebrows such as "Try saying", Details headings, "When" tags, the active menu item), never for buttons, large headings or body text. Font: Geist. Urgency badges, all readable on navy: Emergency `#EF4444`, Urgent `#F97316`, Routine `#0DBEE4`, Not maintenance `#94A3B8`, Job update `#3860EF`. The sample cards and the Guide use the same navy surfaces.
- **Shared navigation from the first page:** header in `app/layout.tsx`: "Harbourline", then Portal, Talk to Jane, Triage board, Architecture, Guide, Demo, Reports (`NEXT_PUBLIC_AIRTABLE_INTERFACE_URL`, new tab; the base URL until it's set), Test script (the kit's `recording-test-script.pdf` copied into `public/`, new tab; the printable recording script, never regenerated). `/` redirects to `/portal`.
- **Brisbane time everywhere:** `received_at` is stored in UTC. Convert to Australia/Brisbane before giving times to Claude, written out with the zone named (for example "Friday 9 October 2026, 8:21am (Brisbane time, AEST UTC+10)"), and tell Claude to use times as given and never convert them. Board times show Brisbane time whatever the viewer's computer is set to. (Run 2 bug: raw UTC made 8:21am read as "after hours (10:21pm)"; on the night it would make 7:40pm look like business hours.)
- **Model names:** show friendly names ("Sonnet 5.5") in the UI, never model IDs.
- **React effects:** always `useEffect(() => { ... }, deps)` with braces, returning nothing or a clean-up function. Never an implicit-return arrow (for example `() => el.scrollIntoView()`): current browsers return a Promise and React throws "destroy is not a function".
- Commit at each checkpoint, staging only your own files.
