/**
 * The application every new owner fills before Hoodie lets them in, one question per screen. One list drives the form
 * and the server's check. $HOODIE is asked but cannot be answered until the token is live; it is stored as "not live".
 */
export type Question = {
  id: string;
  kind: "text" | "long" | "choice" | "multi" | "token";
  label: string;
  hint?: string;
  placeholder?: string;
  /** text and long: shortest and longest answer */
  min?: number;
  max?: number;
  /** text: what a valid answer looks like, after `clean` */
  pattern?: RegExp;
  invalid?: string;
  /** text: strips a pasted profile link down to the handle */
  clean?: (v: string) => string;
  optional?: boolean;
  /** choice and multi */
  options?: readonly string[];
};

const handle = (host: string) => (v: string) => v.trim().replace(new RegExp(`^(https?://)?(www\\.)?(${host})/`, "i"), "").replace(/^@/, "").replace(/[/?#].*$/, "");

export const QUESTIONS: readonly Question[] = [
  { id: "hoodie", kind: "token", label: "Do you hold $HOODIE?", hint: "$HOODIE is not live yet, so there is nothing to answer here. We will ask again at launch; holders move to the front of the line." },
  { id: "x", kind: "text", label: "What is your X?", hint: "Your handle, or paste a link to your profile.", placeholder: "@you", max: 15, pattern: /^[A-Za-z0-9_]{1,15}$/, invalid: "That is not an X handle.", clean: handle("x\\.com|twitter\\.com") },
  { id: "telegram", kind: "text", label: "And your Telegram?", hint: "If you get in, this is where we reach you.", placeholder: "@you", max: 32, pattern: /^[A-Za-z0-9_]{5,32}$/, invalid: "That is not a Telegram handle.", clean: handle("t\\.me|telegram\\.me") },
  { id: "experience", kind: "choice", label: "How long have you been trading onchain?", options: ["Just starting, under 3 months", "Finding my feet, 3 to 12 months", "Seasoned, 1 to 3 years", "Veteran, 3 years or more"] },
  { id: "volume", kind: "choice", label: "How much would you trade through Hoodie each month?", hint: "A rough guess is fine.", options: ["Under 1 ETH", "1 to 10 ETH", "10 to 50 ETH", "50 to 250 ETH", "More than 250 ETH"] },
  { id: "purpose", kind: "multi", label: "What do you want Hoodie for?", hint: "Pick all that apply.", options: ["Snipe new Pons launches", "Run strategies while I sleep", "Research tokens faster", "Trade by hand on a better screen", "Launch my own token"] },
  { id: "terminals", kind: "multi", label: "Do you trade on other terminals?", hint: "Pick all that apply.", optional: true, options: ["Axiom", "GMGN", "Photon", "Banana Gun", "Maestro", "Pons app", "None"] },
  { id: "tools", kind: "multi", label: "Which of these have you traded with?", hint: "Pick all that apply.", optional: true, options: ["Stop losses", "Take profits", "Trailing stops", "DCA", "Limit orders", "Copy trading", "Snipers", "Trading bots", "None yet"] },
  { id: "why", kind: "long", label: "Why should you get access?", hint: "One or two sentences.", min: 10, max: 280, invalid: "Tell us why in a sentence or two." },
];

export type Answers = Record<string, string | string[]>;

/** One answer: the cleaned value, or a message saying what is wrong with it. */
export function checkOne(q: Question, v: unknown): { value: string | string[] } | { error: string } {
  if (q.kind === "token") return { value: "not live" };
  if (q.kind === "text" || q.kind === "long") {
    const raw = typeof v === "string" ? v : "";
    const t = (q.clean ? q.clean(raw) : raw.trim()).slice(0, q.max ?? 600);
    if (!t) return q.optional ? { value: "" } : { error: q.invalid ?? "Answer this one." };
    if (q.pattern && !q.pattern.test(t)) return { error: q.invalid ?? "That does not look right." };
    // at least `min` characters and four different ones, so "aaaaaaaaaa" does not count
    if (q.min && (t.length < q.min || new Set(t.toLowerCase().replace(/\s/g, "")).size < 4)) return { error: q.invalid ?? "A little more, please." };
    return { value: t };
  }
  const options = q.options ?? [];
  if (q.kind === "choice") return typeof v === "string" && options.includes(v) ? { value: v } : { error: "Pick one." };
  const picked = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && options.includes(x)))] : [];
  return picked.length || q.optional ? { value: picked } : { error: "Pick at least one." };
}

/** Every answer checked; a message naming the first problem otherwise. */
export function checkAnswers(raw: unknown): Answers | string {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Answers = {};
  for (const q of QUESTIONS) {
    const r = checkOne(q, input[q.id]);
    if ("error" in r) return `${q.label} ${r.error}`;
    out[q.id] = r.value;
  }
  return out;
}
