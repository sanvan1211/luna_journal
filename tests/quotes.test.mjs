// Unit tests for deep analysis quote checks. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyQuotes, checkBlockquotes, removeSentences, fakeInlineQuotes } from "../supabase/functions/_shared/quotes.js";

const days = [
  { date: "2026-10-22", text: "why is my life somewhat getting better. i think my absence of romance has led me to romanticize my own life" },
  { date: "2026-10-23", text: "today was alright, nothing special.   mom made pasta which was nice" },
];

test("verifyQuotes keeps verbatim quotes (case, spacing, curly quotes ignored) and drops made-up ones", () => {
  const kept = verifyQuotes(["Why is my life somewhat getting better", "“led me to romanticize my own life”", "I have never been happier", "ok"], days[0].text);
  assert.deepEqual(kept, ["Why is my life somewhat getting better", "led me to romanticize my own life"]);
});

test("checkBlockquotes removes a fake quote, keeps real ones, and fixes a wrong date", () => {
  const md = [
    "## 1. You're starting to enjoy ordinary days",
    "",
    '> "nothing special." — Oct 23',
    "",
    "Some text.",
    "",
    '> "I finally feel completely fixed and happy" — Oct 22',
    "",
    "> mom made pasta which was nice",
    "> — Oct 22",
  ].join("\n");
  const r = checkBlockquotes(md, days);
  assert.equal(r.verified, 2);
  assert.deepEqual(r.removed, ["I finally feel completely fixed and happy"]);
  assert.ok(!r.markdown.includes("completely fixed"));
  assert.ok(r.markdown.includes("> “nothing special.” — Oct 23"));
  assert.ok(r.markdown.includes("> “mom made pasta which was nice” — Oct 23"), "re-attributed to the day it came from");
});

test("removeSentences takes out flagged sentences only", () => {
  const md = "You wrote about school a lot. You clearly have anxiety disorder. One possibility is that rest helped.";
  assert.equal(removeSentences(md, ["You clearly have anxiety disorder."]), "You wrote about school a lot. One possibility is that rest helped.");
});

test("typographic look-alikes from the model still verify (NBSP, non-breaking hyphen, curly quotes)", () => {
  const md = "> \u201cwhy is my life somewhat getting better.\u201d \u2014 Oct\u00a022\n\n> \u201ctoday was alright, nothing special.\u201d\u00a0\u2014\u00a0Oct\u202f23";
  const r = checkBlockquotes(md, days);
  assert.equal(r.verified, 2);
  assert.equal(r.removed.length, 0);
});

test("fakeInlineQuotes flags sentences that quote words the writer never wrote", () => {
  const md = [
    "You asked, \u201cwhy is my life somewhat getting better\u201d and the days answer it.",
    "Your own note, \u201clife is improving,\u201d fits this.",
    "You call it a \u201cwin\u201d sometimes.",
    "> \u201canything in a blockquote is checked elsewhere\u201d \u2014 Oct 22",
  ].join("\n");
  assert.deepEqual(fakeInlineQuotes(md, days.map((d) => d.text)), ["Your own note, \u201clife is improving,\u201d fits this."]);
});

test("removing a flagged question leaves no empty numbered item", () => {
  const md = "## Questions to write about next\n1. What felt best this week?\n2. You should probably see someone about this, right?\n3. What would you keep doing?";
  assert.equal(removeSentences(md, ["You should probably see someone about this, right?"]), "## Questions to write about next\n1. What felt best this week?\n2. What would you keep doing?");
});
