import guide from "@/guide.json";
import { friendlyModel } from "@/lib/time";
import PortalForm from "./form";

export default function Portal() {
  const samples = guide.test.find((t) => t.id === "portal")?.samples ?? [];
  const sample = {
    address: samples.find((s) => s.label === "Address")?.text ?? "",
    description: samples.find((s) => s.label === "Description")?.text ?? "",
  };
  return <PortalForm model={friendlyModel(process.env.ANTHROPIC_MODEL)} sample={sample} />;
}
