import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getBuildingBillboards } from "../src/data/billboardGroups.ts";

const billboards = JSON.parse(readFileSync(new URL("../src/data/defaultBillboards.json", import.meta.url), "utf8"));
const menu = {
  IIPC: ["Industry Institute & Career Development", "AR Development & Innovation Workspace"],
  "Mac Lab": ["Digital Learning & Innovation"],
  Library: ["ಕನ್ನಡ (Kannada)", "Literature", "Hindi", "Journalism", "General Management", "Hotel Management", "Book Bank - SC/ST Students", "Management Book"],
  "Front Office": ["Welcome & Student Assistance"],
  "Indoor Auditorium": ["Events & Programs", "Graduation & Certificate Distribution"],
  Cafeteria: ["Cafe Levista", "JustVend", "Convenience & Stationery", "Addies Basket", "Jai Foods", "Vintage Cafe", "Water Falls Juice Center"],
  "Cafeteria 2": ["University Cafeteria", "Food For Every Taste"],
  "Indoor Sports": ["Indoor Sports & Recreation", "Badminton Court"],
};

test("no billboards appear without a selected building or for an unknown space", () => {
  assert.deepEqual(getBuildingBillboards(billboards, null), []);
  assert.deepEqual(getBuildingBillboards(billboards, "Unknown building"), []);
});
for (const [building, expected] of Object.entries(menu)) {
  test(`${building} shows only its menu billboards`, () => {
    assert.deepEqual(getBuildingBillboards(billboards, building).map((b) => b.title).sort(), [...expected].sort());
  });
}
test("existing label spellings and capitalization map to the same groups", () => {
  for (const [alias, canonical] of [["Libruary", "Library"], ["MACLAB", "Mac Lab"], ["Frontoffice", "Front Office"], ["Indore Auditorium", "Indoor Auditorium"]]) {
    assert.deepEqual(getBuildingBillboards(billboards, alias), getBuildingBillboards(billboards, canonical));
  }
});
test("all 25 current billboards have exactly one building group", () => {
  const ids = Object.keys(menu).flatMap((name) => getBuildingBillboards(billboards, name).map((b) => b.id));
  assert.equal(ids.length, 25);
  assert.equal(new Set(ids).size, billboards.length);
});
