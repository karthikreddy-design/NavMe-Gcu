import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutBillboards, layoutFixedBillboards } from "../src/data/billboardLayout.ts";

function verify(cards, width, height) {
  const result = layoutBillboards(cards, width, height);
  assert.equal(result.length, cards.length);
  for (const card of result) {
    const original = cards.find((c) => c.id === card.id);
    assert.equal(card.x, original.x);
    assert.equal(card.y, original.y);
    assert.ok(card.left >= 0 && card.top >= 0);
    assert.ok(card.left + card.width <= width + 0.001);
    assert.ok(card.top + card.height <= height + 0.001);
    for (const other of result.filter((c) => c.id !== card.id)) {
      assert.ok(card.left + card.width <= other.left || other.left + other.width <= card.left ||
        card.top + card.height <= other.top || other.top + other.height <= card.top,
      `${card.id} overlaps ${other.id}`);
    }
  }
  return result;
}

for (const [width, height] of [[1440, 900], [390, 620], [320, 180]]) {
  test(`eight overlapping library anchors separate at ${width}×${height}`, () => {
    const cards = Array.from({ length: 8 }, (_, i) => ({ id: String(i), x: width / 2, y: height / 2, width: 112, height: 93 }));
    verify(cards, width, height);
  });
}
test("cards remain separated while camera zoom changes card size and projected positions", () => {
  for (const zoom of [0.6, 0.8, 1, 1.25, 1.6]) {
    const cards = Array.from({ length: 8 }, (_, i) => ({ id: String(i), x: 600 + i * 7 * zoom, y: 360 + i * 5 * zoom, width: 112 * zoom, height: 93 * zoom }));
    verify(cards, 1440, 900);
  }
});
test("edge anchors stay unchanged and input order does not change placement", () => {
  const cards = [{ id: "b", x: 0, y: 0, width: 140, height: 100 }, { id: "a", x: 3, y: 2, width: 140, height: 100 }, { id: "c", x: 389, y: 619, width: 140, height: 100 }];
  assert.deepEqual(verify(cards, 390, 620), verify([...cards].reverse(), 390, 620));
});

test("walkthrough cards keep their exact anchored position and size", () => {
  const cards = [{ id: "a", x: 200, y: 220, width: 104, height: 86, distance: 3 }, { id: "b", x: 420, y: 350, width: 104, height: 86, distance: 8 }];
  const result = layoutFixedBillboards(cards, 800, 600);
  assert.equal(result.length, 2);
  for (const card of result) {
    assert.equal(card.left, card.x - 52);
    assert.equal(card.top, card.y - 86);
    assert.equal(card.width, 104);
    assert.equal(card.height, 86);
    assert.equal(card.factor, 1);
  }
});
test("nearby walkthrough signs occlude distant overlapping signs instead of moving them", () => {
  const cards = [{ id: "far", x: 210, y: 220, width: 104, height: 86, distance: 12 }, { id: "near", x: 200, y: 220, width: 104, height: 86, distance: 2 }];
  assert.deepEqual(layoutFixedBillboards(cards, 800, 600).map((card) => card.id), ["near"]);
  cards[0].x = 450;
  assert.equal(layoutFixedBillboards(cards, 800, 600).length, 2);
});
test("off-screen walkthrough signs are never moved into a screen corner", () => {
  assert.deepEqual(layoutFixedBillboards([{ id: "edge", x: 1, y: 1, width: 104, height: 86 }], 800, 600), []);
});
