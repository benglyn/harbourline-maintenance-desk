import Guide from "./guide";

export default function GuidePage() {
  return <Guide reportsUrl={process.env.NEXT_PUBLIC_AIRTABLE_INTERFACE_URL || "https://airtable.com"} />;
}
