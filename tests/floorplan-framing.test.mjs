import { test } from "node:test";
import assert from "node:assert/strict";
import { getCampusOverviewFraming, getFloorPlanFraming } from "../src/data/floorPlanFraming.ts";

const library = { id: "library", name: "Library", position: { x: -13, y: 3.4, z: 8.8 } };
test("library framing matches the horizontal reference and centers the reading room", () => {
  const framing = getFloorPlanFraming(library, 2.33);
  assert.deepEqual(framing.position, { x: -17.4, y: 3.4, z: 15.4 });
  assert.deepEqual(framing.rotation, { x: -90, y: 90 });
  assert.ok(Math.abs(framing.zoom - 18.75) < 0.001);
  assert.deepEqual(getFloorPlanFraming({ ...library, name: " Libruary " }, 2.33), framing);
});
test("library framing adapts to portrait screens without changing its target", () => {
  const wide = getFloorPlanFraming(library, 2.33);
  const narrow = getFloorPlanFraming(library, 0.5);
  assert.deepEqual(narrow.position, wide.position);
  assert.ok(narrow.zoom > wide.zoom);
  assert.ok(Math.abs(narrow.zoom * 0.5 - wide.zoom * 2.33) < 0.001);
});
test("other building floor-plan framing stays unchanged", () => {
  const building = { id: "unassigned", name: "Unassigned building", position: { x: 30, y: 3, z: 20 } };
  assert.deepEqual(getFloorPlanFraming(building, 2.33), { position: building.position, rotation: { x: -90, y: 0 }, zoom: 18 });
});

for (const [name, aliases, offset, heading, zoom] of [
  ["IIPC", [], [-5.4, 2], 0, 9.55],
  ["Cafeteria", [], [-0.8, -9.7], 0, 13.8],
  ["Front Office", ["frontoffice"], [-3.1, -3.8], 90, 8.65],
  ["Indoor Auditorium", ["Indore Auditorium"], [2.4, -7.2], 90, 12.8],
  ["Mac Lab", ["Maclab"], [0.68, -0.28], 187, 4],
]) {
  test(`${name} uses its reference framing and restores it consistently`, () => {
    const building = { id: name, name, position: { x: 0, y: 2, z: 0 } };
    const framing = getFloorPlanFraming(building, 2.3);
    assert.deepEqual(framing.position, { x: offset[0], y: 2, z: offset[1] });
    assert.deepEqual(framing.rotation, { x: -90, y: heading });
    assert.ok(Math.abs(framing.zoom - zoom) < 0.001);
    assert.equal(framing.refine, true);
    for (const alias of aliases) assert.deepEqual(getFloorPlanFraming({ ...building, name: alias }, 2.3), framing);
    const portrait = getFloorPlanFraming(building, 0.5);
    assert.deepEqual(portrait.position, framing.position);
    assert.ok(Math.abs(portrait.zoom * 0.5 - framing.zoom * 2.3) < 0.001);
  });
}

test("campus overview uses one responsive all-campus frame", () => {
  const frame = getCampusOverviewFraming(1256 / 670);
  assert.deepEqual(frame.position, { x: 35.5, y: 0, z: -32.2 });
  assert.deepEqual(frame.orbitRotation, { x: -45.86, y: 90 });
  assert.equal(frame.zoom, 76.5);
  const portrait = getCampusOverviewFraming(0.5);
  assert.deepEqual(portrait.position, frame.position);
  assert.ok(Math.abs(portrait.zoom * 0.5 - frame.zoom * 1256 / 670) < 0.001);
  assert.deepEqual(getCampusOverviewFraming(NaN), frame);
});

test("direct Dollhouse fly-out ends at the calibrated campus overview", () => {
  const frame = getCampusOverviewFraming(1256 / 670);
  assert.ok(Math.abs(frame.dollhousePosition.x - 100.87719960929904) < 0.0001);
  assert.ok(Math.abs(frame.dollhousePosition.y - 83.21597303751578) < 0.0001);
  assert.equal(frame.dollhousePosition.z, frame.position.z);
  const portrait = getCampusOverviewFraming(0.5);
  const wideDistance = frame.dollhousePosition.x - frame.position.x;
  const narrowDistance = portrait.dollhousePosition.x - portrait.position.x;
  assert.ok(Math.abs(narrowDistance / wideDistance - (1256 / 670) / 0.5) < 0.0001);
  assert.deepEqual(portrait.orbitRotation, frame.orbitRotation);
});

for (const [name, alias, x, z, zoom] of [
  ["Cafeteria 2", "cafeteria2", 1.6, -0.35, 17.25],
  ["Indoor Sports", "  INDOOR   SPORTS  ", -10, -5.8, 18.5],
]) {
  test(`${name} matches its reference room and adapts to screen width`, () => {
    const building = { id: name, name, position: { x: 0, y: 2, z: 0 } };
    const frame = getFloorPlanFraming(building, 2.115);
    assert.deepEqual(frame.position, { x, y: 2, z });
    assert.deepEqual(frame.rotation, { x: -90, y: 0 });
    assert.equal(frame.zoom, zoom);
    assert.equal(frame.refine, true);
    assert.deepEqual(getFloorPlanFraming({ ...building, name: alias }, 2.115), frame);
    const portrait = getFloorPlanFraming(building, 0.5);
    assert.deepEqual(portrait.position, frame.position);
    assert.ok(Math.abs(portrait.zoom * 0.5 - zoom * 2.115) < 0.001);
  });
}
