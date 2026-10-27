/**
 * The little markdown the brain writes: paragraphs, "- " or "* " lists, **bold** and `code`. Anything else stays text.
 * Pure: returns blocks the UI renders as elements (never HTML strings).
 */
export type Span = { text: string; bold?: boolean; code?: boolean };
export type Block = { type: "p"; spans: Span[] } | { type: "ul"; items: Span[][] };

export function spans(line: string): Span[] {
  const out: Span[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let at = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2]!, code: true });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out;
}

export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const chunk of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    let para: string[] = [];
    let list: Span[][] = [];
    const flush = () => {
      if (para.length) out.push({ type: "p", spans: spans(para.join(" ").replace(/^#+\s*/, "")) });
      if (list.length) out.push({ type: "ul", items: list });
      para = [];
      list = [];
    };
    for (const l of lines) {
      const item = /^\s*[-*•]\s+(.*)$/.exec(l);
      if (item) {
        if (para.length) { out.push({ type: "p", spans: spans(para.join(" ")) }); para = []; }
        list.push(spans(item[1]!));
      } else {
        if (list.length) { out.push({ type: "ul", items: list }); list = []; }
        para.push(l.trim());
      }
    }
    flush();
  }
  return out;
}
