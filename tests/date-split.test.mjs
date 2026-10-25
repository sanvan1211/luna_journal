// Unit tests for the inline date splitter. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitByDate } from "../js/date-split.js";

const NOW = new Date("2026-10-25T16:00:00Z"); // "current is Oct 2026"
const squash = (s) => s.replace(/\s+/g, " ").trim();
// Everything in the original text must come back out: the text before, each marker, and each day.
const rebuilt = (r) => squash([r.before, ...r.days.flatMap((d) => [d.marker, d.text])].join(" "));

test("fixture: three days dated 10/22, 10/23, 10/24 at New York noon, nothing lost", () => {
  const text = readFileSync(new URL("./fixtures/oct22-24.txt", import.meta.url), "utf8");
  const r = splitByDate(text, { now: NOW });
  assert.deepEqual(r.days.map((d) => d.date), ["2026-10-22", "2026-10-23", "2026-10-24"]);
  assert.deepEqual(r.days.map((d) => d.created_at), ["2026-10-22T16:00:00.000Z", "2026-10-23T16:00:00.000Z", "2026-10-24T16:00:00.000Z"]);
  assert.ok(r.days.every((d) => d.text.length > 0));
  assert.equal(rebuilt(r), squash(text));
});

test("markers after sentence-ending text, with -, : or a space", () => {
  const r = splitByDate("…nothin special… 10.22- why is it better. 10/23: alright… 10-24 today was fine", { now: NOW });
  assert.equal(r.before, "…nothin special…");
  assert.deepEqual(r.days.map((d) => [d.date, d.text]), [["2026-10-22", "why is it better."], ["2026-10-23", "alright…"], ["2026-10-24", "today was fine"]]);
});

test("numbers that aren't dates are left alone", () => {
  for (const text of [
    "I slept 3.5 hours and spent $11.50 on lunch. 4.5 is my GPA goal",
    "Version 10.22.5 shipped. 10.23.1 too",
    "10.22 10.23 numbers only, no words right after",
    "13.5 points. 2.40 later",
  ]) assert.equal(splitByDate(text, { now: NOW }).days.length, 0, text);
});

test("dates must run forward; a stray earlier number is ignored", () => {
  const r = splitByDate("10.20- monday. 3.5 hours of homework. 10.21- tuesday. 10.22- wednesday", { now: NOW });
  assert.deepEqual(r.days.map((d) => d.date), ["2026-10-20", "2026-10-21", "2026-10-22"]);
  assert.ok(r.days[0].text.includes("3.5 hours of homework"));
});

test("one marker is not enough to split", () => {
  assert.equal(splitByDate("10.22- just one day here", { now: NOW }).days.length, 0);
});

test("a date after today belongs to last year", () => {
  const r = splitByDate("12.30- end of year. 12.31- last day", { now: NOW });
  assert.deepEqual(r.days.map((d) => d.date), ["2025-12-30", "2025-12-31"]);
});

test("winter dates are noon in New York too (EST, not EDT)", () => {
  const r = splitByDate("1.5- cold. 1.6- colder", { now: NOW });
  assert.equal(r.days[0].created_at, "2026-01-05T17:00:00.000Z");
});

test("browser and Edge Function copies of the splitter are identical", () => {
  const a = readFileSync(new URL("../js/date-split.js", import.meta.url), "utf8");
  const b = readFileSync(new URL("../supabase/functions/_shared/date-split.js", import.meta.url), "utf8");
  assert.equal(a, b);
});
