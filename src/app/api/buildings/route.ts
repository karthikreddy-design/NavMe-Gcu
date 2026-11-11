import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isBuildingList } from "@/data/buildings";
import defaultBuildings from "@/data/defaultBuildings.json";

const directory = path.join(process.cwd(), ".data");
const file = path.join(directory, "buildings.json");
let writes: Promise<unknown> = Promise.resolve();

async function readBuildings() {
  try {
    const data: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!isBuildingList(data)) throw new Error("Invalid saved labels");
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function GET() {
  try {
    return Response.json(await readBuildings() ?? defaultBuildings, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not read shared labels." }, { status: 500 });
  }
}

async function save(request: Request, initialize: boolean) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  let data: unknown;
  try { data = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isBuildingList(data)) {
    return Response.json({ error: "Invalid building labels" }, { status: 400 });
  }
  const buildings = data;
  const operation = writes.catch(() => {}).then(async () => {
    const existing = await readBuildings();
    if (initialize && existing !== null) return existing;
    await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `${randomUUID()}.json`);
    await writeFile(temporary, JSON.stringify(buildings, null, 2), "utf8");
    await rename(temporary, file);
    return buildings;
  });
  writes = operation;
  try { return Response.json(await operation); } catch {
    return Response.json({ error: "Could not save shared labels." }, { status: 500 });
  }
}

export async function POST(request: Request) { return save(request, true); }
export async function PUT(request: Request) { return save(request, false); }
