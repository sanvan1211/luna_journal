// Unit tests for fitting deep-analysis notes into the token budget. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitNotes } from "../supabase/functions/_shared/deep-notes.js";

const day = (date) => ({
  date,
  events: ["went to school and then to work for a long shift", "studied chemistry", "cooked dinner"],
  behaviors: ["made a to-do list", "used a timer", "ran 2 miles"],
  people: ["Maya, who said to try out for robotics"],
  things_felt: ["kind of tired", "a little proud"],
  past_references: ["last month felt like just getting through days"],
  writer_questions: ["why is my life getting better"],
  exact_quotes: ["kind of ready", "finished the chem project", "nothing special"],
});
const days = Array.from({ length: 30 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, "0")}`));

test("small sets are left alone", () => {
  const r = fitNotes(days.slice(0, 3), 10000);
  assert.deepEqual(r.notes, days.slice(0, 3));
  assert.deepEqual(r.shortened, []);
});

test("a month of notes fits, with every day kept and older days shortened first", () => {
  const r = fitNotes(days, 10000);
  assert.ok(JSON.stringify(r.notes).length <= 10000);
  assert.equal(r.notes.length, 30, "no day is dropped");
  assert.deepEqual(r.notes.map((d) => d.date), days.map((d) => d.date));
  assert.ok(r.shortened.length > 0 && !r.shortened.includes("2026-09-30"), "the most recent days are untouched");
  assert.ok(r.notes.every((d) => d.things_felt && d.past_references && d.writer_questions), "baseline fields survive");
});
