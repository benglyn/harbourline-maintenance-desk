import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// POST { transcript: [{ role, text }] }: a two-sentence summary for display only. Never saved.
export async function POST(req: Request) {
  try {
    const { transcript } = (await req.json()) as { transcript: { role: string; text: string }[] };
    if (!transcript?.length) return Response.json({ summary: "The call ended before anything was said." });
    const lines = transcript.map((t) => `${t.role === "assistant" ? "Jane" : "Caller"}: ${t.text}`).join("\n");
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 2000,
      output_config: { effort: "low" },
      system:
        "You summarise calls to Jane, the voice agent on Harbourline Property Management's maintenance line. Write exactly two sentences: first what the caller wanted, then what Jane did. Plain text only. Australian spelling. Do not use em dashes.",
      messages: [{ role: "user", content: `Summarise this call:\n\n${lines}` }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = res.content.find((b) => b.type === "text");
    return Response.json({ summary: text && text.type === "text" ? text.text.replace(/\s*[—–]\s*/g, " - ").trim() : "" });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
