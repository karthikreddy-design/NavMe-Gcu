import "server-only";
import { access } from "node:fs/promises";
import path from "node:path";
import { dataDirectory } from "./dataDirectory";

export async function billboardMediaPath(id: string) {
  const uploaded = path.join(dataDirectory, "media", id);
  try { await access(uploaded); return uploaded; } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const bundled = path.join(process.cwd(), "assets", "billboard-media", id);
    await access(bundled);
    return bundled;
  }
}
