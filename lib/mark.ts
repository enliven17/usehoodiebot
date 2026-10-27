/**
 * The HOODIEBOT mark: a hooded bot on Kurage's pixel grid. One cell per character; "#" solid, "+" faded, "." empty.
 * The face is open, so the ground shows through it, and the eyes are lit cells. Drawn the same way in the app (Logo) and in brand/.
 */
const GRID = [
  "..##.....",
  ".#####...",
  ".#######.",
  "##.....##",
  "#..#.#..#",
  "#..#.#..#",
  "##.....##",
  ".#######.",
  "+#######+",
];

const CELL = 2;
const SIZE = 1.6;

export const MARK_VIEWBOX = `-0.2 -0.2 ${GRID[0]!.length * CELL} ${GRID.length * CELL}`;

export const MARK_CELLS = GRID.flatMap((row, y) =>
  [...row].flatMap((c, x) => (c === "." ? [] : [{ x: x * CELL + 0.2, y: y * CELL + 0.2, size: SIZE, opacity: c === "+" ? 0.5 : 1 }])),
);

/** Standalone SVG source (brand files, favicon). `fill` is a colour or "gradient". */
export function markSvg(fill: string = "gradient", px = 64): string {
  const paint = fill === "gradient" ? "url(#hb)" : fill;
  const defs = fill === "gradient" ? `<defs><linearGradient id="hb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8ef0f7"/><stop offset="1" stop-color="#b9a6ff"/></linearGradient></defs>` : "";
  const rects = MARK_CELLS.map((c) => `<rect x="${c.x}" y="${c.y}" width="${c.size}" height="${c.size}" rx=".35"${c.opacity < 1 ? ` opacity="${c.opacity}"` : ""}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px * (GRID.length / GRID[0]!.length)}" viewBox="${MARK_VIEWBOX}">${defs}<g fill="${paint}">${rects}</g></svg>`;
}
