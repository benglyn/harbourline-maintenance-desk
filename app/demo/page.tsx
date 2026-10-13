import Demo from "./demo";

export default function DemoPage() {
  return <Demo reportsUrl={process.env.NEXT_PUBLIC_AIRTABLE_INTERFACE_URL || "https://airtable.com"} />;
}
