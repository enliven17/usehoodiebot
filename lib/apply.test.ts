import assert from "node:assert/strict";
import { test } from "node:test";

import { checkAnswers } from "./apply";

const good = {
  x: "https://x.com/hood_ie?s=20",
  telegram: "@hoodie_tg",
  experience: "Seasoned, 1 to 3 years",
  volume: "1 to 10 ETH",
  purpose: ["Snipe new Pons launches", "nope"],
  why: "I trade Pons launches every day.",
};

test("checkAnswers cleans handles and keeps known options", () => {
  assert.deepEqual(checkAnswers({ ...good, hoodie: "yes" }), {
    x: "hood_ie",
    telegram: "hoodie_tg",
    experience: "Seasoned, 1 to 3 years",
    volume: "1 to 10 ETH",
    purpose: ["Snipe new Pons launches"],
    terminals: [],
    tools: [],
    why: "I trade Pons launches every day.",
  });
});

test("checkAnswers names what is wrong", () => {
  assert.match(checkAnswers({ ...good, x: "not a handle!" }) as string, /X handle/);
  assert.match(checkAnswers({ ...good, telegram: "abc" }) as string, /Telegram handle/);
  assert.match(checkAnswers({ ...good, volume: "a lot" }) as string, /Pick one/);
  assert.match(checkAnswers({ ...good, purpose: [] }) as string, /at least one/);
  assert.match(checkAnswers({ ...good, why: "aaaaaaaaaaaa" }) as string, /sentence or two/);
});
