import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseUpgradeHeader,
  negotiateUpgrade,
  selectUpgradeProtocol,
} from "../src/core.js";

test("parseUpgradeHeader returns [] for empty string", () => {
  assert.deepEqual(parseUpgradeHeader(""), []);
});

test("parseUpgradeHeader returns [] for non-string input", () => {
  // Defensive: callers may pass undefined when the header is absent.
  assert.deepEqual(parseUpgradeHeader(/** @type {any} */ (undefined)), []);
});

test("parseUpgradeHeader parses a single protocol", () => {
  assert.deepEqual(parseUpgradeHeader("websocket"), ["websocket"]);
});

test("parseUpgradeHeader parses a comma-separated list", () => {
  assert.deepEqual(
    parseUpgradeHeader("websocket, h2c"),
    ["websocket", "h2c"],
  );
});

test("parseUpgradeHeader strips surrounding whitespace around items", () => {
  assert.deepEqual(
    parseUpgradeHeader("  websocket ,  h2c  "),
    ["websocket", "h2c"],
  );
});

test("parseUpgradeHeader lower-cases protocol names", () => {
  assert.deepEqual(
    parseUpgradeHeader("WebSocket, H2C"),
    ["websocket", "h2c"],
  );
});

test("parseUpgradeHeader discards the version after a slash", () => {
  assert.deepEqual(
    parseUpgradeHeader("foo/1.0, bar/2"),
    ["foo", "bar"],
  );
});

test("parseUpgradeHeader skips empty fragments from double commas", () => {
  assert.deepEqual(
    parseUpgradeHeader("a,,b"),
    ["a", "b"],
  );
});

test("parseUpgradeHeader skips leading-slash fragments", () => {
  assert.deepEqual(
    parseUpgradeHeader("/1.0, websocket"),
    ["websocket"],
  );
});

test("parseUpgradeHeader deduplicates in first-seen order", () => {
  assert.deepEqual(
    parseUpgradeHeader("websocket, WebSocket, h2c"),
    ["websocket", "h2c"],
  );
});

test("negotiateUpgrade returns the first matching requested protocol", () => {
  // Client prefers websocket first; server offers both websocket and h2c.
  assert.equal(
    negotiateUpgrade("websocket, h2c", ["h2c", "websocket"]),
    "websocket",
  );
});

test("negotiateUpgrade matches when versions are present in the header", () => {
  assert.equal(
    negotiateUpgrade("h2c/1.0", ["h2c"]),
    "h2c",
  );
});

test("negotiateUpgrade matches case-insensitively on the offered side", () => {
  assert.equal(
    negotiateUpgrade("websocket", ["WEBSOCKET"]),
    "websocket",
  );
});

test("negotiateUpgrade returns null when there is no intersection", () => {
  assert.equal(
    negotiateUpgrade("websocket", ["h2c"]),
    null,
  );
});

test("negotiateUpgrade returns null for an empty offered list", () => {
  assert.equal(
    negotiateUpgrade("websocket", []),
    null,
  );
});

test("negotiateUpgrade returns null for an empty header", () => {
  assert.equal(
    negotiateUpgrade("", ["websocket"]),
    null,
  );
});

test("negotiateUpgrade deduplicates offered list without throwing", () => {
  assert.equal(
    negotiateUpgrade("websocket", ["websocket", "websocket"]),
    "websocket",
  );
});

test("selectUpgradeProtocol selects the first requested match", () => {
  assert.equal(
    selectUpgradeProtocol(["websocket", "h2c"], ["h2c"]),
    "h2c",
  );
});

test("selectUpgradeProtocol lower-cases requested names", () => {
  assert.equal(
    selectUpgradeProtocol(["WebSocket"], ["websocket"]),
    "websocket",
  );
});

test("selectUpgradeProtocol skips invalid entries in requested", () => {
  assert.equal(
    selectUpgradeProtocol(
      [/** @type {any} */ (undefined), "", "h2c"],
      ["h2c"],
    ),
    "h2c",
  );
});

test("selectUpgradeProtocol returns null when nothing matches", () => {
  assert.equal(
    selectUpgradeProtocol(["foo"], ["bar"]),
    null,
  );
});
