import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isBillboard, type Billboard } from "@/data/billboards";
import { dataDirectory } from "./dataDirectory";
import defaultBillboards from "@/data/defaultBillboards.json";
const file = path.join(dataDirectory, "billboards.json");
let queue: Promise<unknown> = Promise.resolve();
export async function readBillboards(): Promise<Billboard[]> {
  try {
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(value) || !value.every(isBillboard)) throw new Error("Invalid saved billboards");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (!defaultBillboards.every(isBillboard)) throw new Error("Invalid default billboards");
      return defaultBillboards;
    }
    throw error;
  }
}
export function updateBillboards(change: (items: Billboard[]) => Billboard[]) {
  const operation = queue.catch(() => {}).then(async () => {
    const next = change(await readBillboards());
    await mkdir(dataDirectory, { recursive: true });
    const temporary = path.join(dataDirectory, `${randomUUID()}.json`);
    await writeFile(temporary, JSON.stringify(next, null, 2), "utf8");
    await rename(temporary, file);
    return next;
  });
  queue = operation;
  return operation;
}
