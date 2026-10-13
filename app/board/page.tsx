import { friendlyModel } from "@/lib/time";
import Board from "./board";

export default function BoardPage() {
  return <Board model={friendlyModel(process.env.ANTHROPIC_MODEL)} />;
}
