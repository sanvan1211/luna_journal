// Unit tests for the dashboard's "most important quotes". Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickQuotes, scoreLine } from "../js/quote-picks.js";

const now = new Date("2026-10-25T16:00:00Z");
const e = (id, date, content) => ({ id, title: id, content, created_at: `${date}T16:00:00Z` });

test("reflective, feeling, or reasoning lines win over plain logistics", () => {
  assert.equal(scoreLine("ate tacos and did the math homework after school today"), 0);
  assert.ok(scoreLine("i think my absence of romance has led me to romanticize my own life") >= 3);
  assert.ok(scoreLine("for the first time in a while i felt proud of myself") > scoreLine("i want to finish my essay this week"));
});

test("picks from the past month only, one line per entry, newest first", () => {
  const picks = pickQuotes([
    e("old", "2026-09-01", "i realized i'm happier when i walk every day because it clears my head."),
    e("a", "2026-10-22", "school was fine. i think my absence of romance has led me to romanticize my own life. ate pasta."),
    e("b", "2026-10-24", "finished the essay. for the first time in a while i felt proud of myself because i didn't force it."),
    e("c", "2026-10-23", "ate tacos and did the math homework after school today."),
  ], { now });
  assert.deepEqual(picks.map((p) => p.entry.id), ["b", "a"]);
  assert.equal(picks[1].text, "i think my absence of romance has led me to romanticize my own life.");
});

test("never features a line about self-harm or danger, or anything from that entry", () => {
  const picks = pickQuotes([e("x", "2026-10-20", "i think everyone would be better off without me. i felt proud of my drawing because it took weeks.")], { now });
  assert.equal(picks.length, 0);
});
