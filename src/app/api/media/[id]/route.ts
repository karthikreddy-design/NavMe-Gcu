import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { isAdmin } from "@/lib/adminAuth";
import { readBillboards } from "@/lib/billboardStore";
import { billboardMediaPath } from "@/lib/billboardMedia";
const types: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", webm: "video/webm" };
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif|mp4|webm)$/.test(id)) return new Response(null, { status: 404 });
  const publicMedia = (await readBillboards()).some((b) => b.published && b.enabled && b.media.some((m) => m.id === id));
  if (!publicMedia && !(await isAdmin(request))) return new Response(null, { status: 404 });
  let filename;
  let size;
  try { filename = await billboardMediaPath(id); size = (await stat(filename)).size; } catch { return new Response(null, { status: 404 }); }
  const headers = new Headers({ "Content-Type": types[id.split(".").pop()!], "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });
  let start = 0;
  let end = size - 1;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  return new Response(Readable.toWeb(createReadStream(filename, { start, end })) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
}
