// Brisbane time everywhere. received_at is stored in UTC; Brisbane is AEST (UTC+10), no daylight saving.

const TZ = "Australia/Brisbane";

function parts(d: Date) {
  const p = new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { weekday: g("weekday"), day: g("day"), month: g("month"), year: g("year"), hour: g("hour"), minute: g("minute"), ampm: g("dayPeriod").toLowerCase().replace(/\./g, "") };
}

/** "Friday 9 October 2026, 8:21am (Brisbane time, AEST UTC+10)" for Claude. */
export function brisbaneLong(iso: string | Date) {
  const p = parts(new Date(iso));
  return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}${p.ampm} (Brisbane time, AEST UTC+10)`;
}

/** "Fri 9 Oct, 8:21am" for the board. */
export function brisbaneShort(iso: string | Date) {
  const p = parts(new Date(iso));
  return `${p.weekday.slice(0, 3)} ${p.day} ${p.month.slice(0, 3)}, ${p.hour}:${p.minute}${p.ampm}`;
}

/** YYYY-MM-DD in Brisbane, for the date filter. */
export function brisbaneDate(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Parse a Brisbane wall-clock time like "Friday 30 October 2026, 6:42pm" to a UTC Date. */
export function parseBrisbane(text: string): Date {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) throw new Error(`Cannot parse time: ${text}`);
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  let h = Number(m[4]) % 12;
  if (m[6].toLowerCase() === "pm") h += 12;
  return new Date(Date.UTC(Number(m[3]), months.indexOf(m[2].toLowerCase()), Number(m[1]), h - 10, Number(m[5])));
}

export const friendlyModel = (id?: string) => {
  const m = (id || "").match(/claude-(\w+)-(\d+)(?:-(\d+))?/);
  if (!m) return id || "Claude";
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? "." + m[3] : ""}`;
};
