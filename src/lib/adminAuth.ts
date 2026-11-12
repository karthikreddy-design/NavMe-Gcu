import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { dataDirectory } from "./dataDirectory";

const authFile = path.join(dataDirectory, "admin-auth.json");
type Credentials = { salt: string; hash: string; secret: string };
async function credentials(): Promise<Credentials | null> {
  try { return JSON.parse(await readFile(authFile, "utf8")); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function adminConfigured() { return (await credentials()) !== null; }
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.host === request.headers.get("host") && url.protocol === new URL(request.url).protocol;
  } catch { return false; }
}
export async function authenticate(request: Request, password: string, setup: boolean) {
  let stored = await credentials();
  if (!stored && setup) {
    const hostname = new URL(`http://${request.headers.get("host")}`).hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname) || password.length < 12 || password.length > 256) return null;
    const salt = randomBytes(16).toString("hex");
    stored = { salt, hash: scryptSync(password, salt, 64).toString("hex"), secret: randomBytes(32).toString("hex") };
    await mkdir(dataDirectory, { recursive: true });
    try { await writeFile(authFile, JSON.stringify(stored), { flag: "wx", mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      stored = await credentials();
    }
  }
  if (!stored || password.length > 256 || !timingSafeEqual(scryptSync(password, stored.salt, 64), Buffer.from(stored.hash, "hex"))) return null;
  const expires = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${expires}.${createHmac("sha256", stored.secret).update(expires).digest("hex")}`;
}
export async function isAdmin(request: Request) {
  const stored = await credentials();
  if (!stored) return false;
  const cookie = request.headers.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith("navme_admin="))?.slice(12) ?? "";
  const [expires, signature] = cookie.split(".");
  if (!/^\d+$/.test(expires ?? "") || Number(expires) <= Date.now() || !/^[a-f0-9]{64}$/.test(signature ?? "")) return false;
  return timingSafeEqual(createHmac("sha256", stored.secret).update(expires).digest(), Buffer.from(signature, "hex"));
}
export async function canEdit(request: Request) {
  return request.headers.get("x-survey-mode") === "1" && sameOrigin(request) && await isAdmin(request);
}
export const adminCookie = { name: "navme_admin", httpOnly: true, sameSite: "strict" as const, path: "/api", maxAge: 8 * 60 * 60 };
