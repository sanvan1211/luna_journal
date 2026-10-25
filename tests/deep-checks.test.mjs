// Unit tests for deep analysis safety checks. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { clinicalSentences, needsSupportNote, addSupportNote, closingSentences, SUPPORT_NOTE } from "../supabase/functions/_shared/deep-checks.js";

test("clinical words are caught outside the writer's own quotes", () => {
  const md = "The repeated reference points to a sense of dissociation from the moment. You wrote “i feel depressed lately” on Sep 2. This may suggest you felt distant.";
  assert.deepEqual(clinicalSentences(md), ["The repeated reference points to a sense of dissociation from the moment."]);
});

test("support note is added when heaviness recurs and support isn't mentioned", () => {
  const notes = [{ date: "a", things_felt: ["mostly felt empty"] }, { date: "b", things_felt: ["felt heavy again"] }];
  const md = "# Title\n\nSome analysis.\n\n## A question to sit with\n\nWhat feels most true?";
  assert.equal(needsSupportNote(notes, md), true);
  const out = addSupportNote(md);
  assert.ok(out.indexOf(SUPPORT_NOTE) < out.indexOf("## A question to sit with"));
  assert.equal(needsSupportNote(notes, out), false, "not added twice");
  assert.equal(needsSupportNote([notes[0]], md), false, "one heavy day isn't enough");
});

test("the closing question's sentences are identified", () => {
  assert.deepEqual(closingSentences("# T\n\nText.\n\n## A question to sit with\n\n*When the heaviness returns, what part feels most accessible?*"), ["When the heaviness returns, what part feels most accessible?"]);
});
