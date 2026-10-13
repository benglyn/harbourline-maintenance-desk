# Airtable schema

One base, four tables. The first field of each table is its primary field. Load the CSVs in `seed/` exactly as they are: the data has some deliberate errors (HPM-1058 rent 4950, HPM-1121 days_in_arrears -3, HPM-1201 appears twice, J-7034 completed with no cost) that the tools should notice, not fix. Expected counts: Properties 351, Maintenance jobs 183, Tradies 8, Requests 0.

Loading tip: create the tables first, then load rows through the Airtable REST API in batches of 10 with `typecast: true`.

## Properties (from `seed/rent-roll.csv`)

property_id (text), address (text), suburb (text), type (single select: House, Townhouse, Unit), bedrooms (number, 0 dp), weekly_rent (currency $, 0 dp), status (single select: Leased, Vacant), lease_start (date, ISO), lease_end (date, ISO), tenant_ref (text), landlord_ref (text), property_manager (single select: Dev Patel, Grace Liu, Mia Thompson), days_in_arrears (number, 0 dp), arrears_amount (currency $, 2 dp)

## Maintenance jobs (from `seed/maintenance-log.csv`)

job_id (text), property_id (text), suburb (text), reported (date, ISO), category (single select: Air conditioning, Appliance, Electrical, Garden, General, Hot water, Locks and keys, Pest control, Plumbing), urgency (single select: Emergency, Urgent, Routine), tradie (single select: Brightline Electrical, Coastline Plumbing, Coolair Services, Greenshield Pest, Handyfix, Metro Appliance Repairs, Secure Locksmiths, Tidy Yards), status (single select: Awaiting landlord approval, Awaiting quote, Booked, Completed), days_to_complete (number, 0 dp), cost (currency $, 0 dp)

## Tradies (from `seed/tradies.csv`)

tradie (text), trades (text)

## Requests (starts empty; every channel lands here)

request_id (autonumber), received_at (dateTime, Australia/Brisbane), channel (single select: Portal, Voice, Email, Text, Web form, Tradie report), status (single select: New, Triaged), address (text), description (long text), photo_description (text), call_id (text), urgency (single select: Emergency, Urgent, Routine, Not maintenance, Job update), property_id (text), needs_call_back (checkbox), issue (text), existing_job_id (text), duplicate_of (text), repeat_fault (checkbox), repeat_note (text), property_manager (text), tradie (text), next_step (long text), tenant_reply (long text), work_order (long text), landlord_approval (long text), things_to_confirm (long text), triage_json (long text)

## Optional Interface (for the Reports link)

"Harbourline Maintenance": a dashboard (open jobs by urgency and by category, total cost of completed jobs, Requests by urgency), a Requests grid (Emergency first, then newest), and an Open jobs Kanban grouped by status. Publish it and put its URL in `NEXT_PUBLIC_AIRTABLE_INTERFACE_URL`.
