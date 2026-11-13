import { test } from "node:test";
import assert from "node:assert/strict";
import { surfaceRing } from "../src/data/surfaceRing.ts";

for (const normal of [{ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 2, z: -3 }]) {
  test(`ring follows the surface plane ${JSON.stringify(normal)}`, () => {
    const center = { x: 4, y: -2, z: 7 };
    const points = surfaceRing(center, normal);
    assert.equal(points.length, 48);
    for (const p of points) {
      const d = { x: p.x - center.x, y: p.y - center.y, z: p.z - center.z };
      assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 0.2) < 1e-8);
      assert.ok(Math.abs(d.x * normal.x + d.y * normal.y + d.z * normal.z) < 1e-8);
    }
  });
}
test("invalid intersections cannot produce a visible ring", () => {
  assert.deepEqual(surfaceRing({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), []);
  assert.deepEqual(surfaceRing({ x: NaN, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), []);
});
