import type { Billboard } from "./billboards";

const groups: Record<string, readonly string[]> = {
  iipc: ["Industry Institute & Career Development", "AR Development & Innovation Workspace"],
  "mac lab": ["Digital Learning & Innovation"],
  library: ["ಕನ್ನಡ (Kannada)", "Literature", "Hindi", "Journalism", "General Management", "Hotel Management", "Book Bank - SC/ST Students", "Management Book"],
  "front office": ["Welcome & Student Assistance"],
  "indoor auditorium": ["Events & Programs", "Graduation & Certificate Distribution"],
  cafeteria: ["Cafe Levista", "JustVend", "Convenience & Stationery", "Addies Basket", "Jai Foods", "Vintage Cafe", "Water Falls Juice Center"],
  "cafeteria 2": ["University Cafeteria", "Food For Every Taste"],
  "indoor sports": ["Indoor Sports & Recreation", "Badminton Court"],
};

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

const aliases: Record<string, string> = {
  libruary: "library", maclab: "mac lab", frontoffice: "front office",
  "indore auditorium": "indoor auditorium", "indoor sport": "indoor sports",
};

export function getBillboardBuildingKey(buildingName: string) {
  const name = normalize(buildingName);
  return aliases[name] ?? name;
}

export function getBuildingBillboards(items: readonly Billboard[], buildingName: string | null): Billboard[] {
  if (!buildingName) return [];
  const titles = groups[getBillboardBuildingKey(buildingName)];
  if (!titles) return [];
  const allowed = new Set(titles.map(normalize));
  return items.filter((item) => allowed.has(normalize(item.title)));
}
