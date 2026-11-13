import test from "node:test";
import assert from "node:assert/strict";
import { validateMessage } from "../src/protocol.js";

test("accepts a valid join message", () => {
  assert.deepEqual(
    validateMessage({ v: 1, type: "join", room: "classic", name: "Pilot" }),
    { ok: true, value: { type: "join", room: "classic", name: "Pilot" } },
  );
});

test("rejects unknown message types and invalid chat", () => {
  assert.equal(validateMessage({ v: 1, type: "teleport" }).ok, false);
  assert.equal(validateMessage({ v: 1, type: "chat", text: " " }).ok, false);
});

test("rejects wrong protocol versions and unsafe room IDs", () => {
  assert.equal(
    validateMessage({ v: 2, type: "join", room: "classic", name: "Pilot" }).ok,
    false,
  );
  assert.equal(
    validateMessage({ v: 1, type: "join", room: "../etc", name: "Pilot" }).ok,
    false,
  );
});
