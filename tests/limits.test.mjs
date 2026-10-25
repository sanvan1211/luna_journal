// Unit tests for the free-limit reset reminder. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { retryAfterSeconds } from "../supabase/functions/_shared/limits.js";
import { limitResetText } from "../js/limits.js";

test("reads Groq's wait time from the header or the error text", () => {
  assert.equal(retryAfterSeconds("12", ""), 12);
  assert.equal(retryAfterSeconds(null, "Rate limit reached on tokens per day (TPD): Limit 200000, Used 199870. Please try again in 7m12.5s. Need more tokens?"), 433);
  assert.equal(retryAfterSeconds(null, "Please try again in 1h2m3s."), 3723);
  assert.equal(retryAfterSeconds(null, "Please try again in 950ms."), null);
  assert.equal(retryAfterSeconds(null, "something else"), null);
});

test("reminder says when it should work again", () => {
  const now = new Date("2026-10-25T19:00:00Z");
  assert.equal(limitResetText(30, now), "It should work again in less than a minute.");
  assert.match(limitResetText(433, now), /^It should work again in about 7 minutes, around .+\.$/);
  assert.match(limitResetText(5400, now), /^It should work again in about 1\.5 hours, around .+\.$/);
  assert.match(limitResetText(null, now), /usually reset within a few minutes/);
});
