import { test } from "node:test";
import assert from "node:assert/strict";
import { stripIds } from "../supabase/functions/_shared/text.js";

const UUID = "1949731c-9068-42af-8323-3e9a47a2f86a";

test("removes ids in parentheses, in any form", () => {
  assert.equal(stripIds(`You built Burrow (${UUID}).`), "You built Burrow.");
  assert.equal(stripIds(`Essays too (${UUID}, e2ca23ea-2a28-431b-99cb-5b6f9b8a2fef).`), "Essays too.");
  assert.equal(stripIds(`The essay entry (id ${UUID}) says so.`), "The essay entry says so.");
  assert.equal(stripIds("The run entry (id: demo-09) links a run."), "The run entry links a run.");
});

test("turns 'Entries <ids>' into plain words", () => {
  assert.equal(stripIds("Entries 7d7fe2c0, 9b8c2003, 990c1147, and 42001b64 all note finishing."), "These entries all note finishing.");
  assert.equal(stripIds("In entry demo-03 you ran."), "In this entry you ran.");
});

test("leaves ordinary text alone", () => {
  const s = "You ran a 21:48 and got a 98 on the test in 2026 (Oct 15).";
  assert.equal(stripIds(s), s);
});
