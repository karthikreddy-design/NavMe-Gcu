import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { canEdit } from "@/lib/adminAuth";
import { dataDirectory } from "@/lib/dataDirectory";
const maxSize = 50 * 1024 * 1024;
export async function POST(request: Request) {
  if (!(await canEdit(request))) return Response.json({ error: "Admin authorization required." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > maxSize + 65536) return Response.json({ error: "Upload limit is 50 MB per file." }, { status: 413 });
  let form;
  try { form = await request.formData(); } catch { return Response.json({ error: "Invalid upload." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > maxSize) return Response.json({ error: "Choose a file up to 50 MB." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  let extension = "";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) extension = "png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) extension = "jpg";
  else if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) extension = "gif";
  else if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") extension = "webp";
  else if (bytes.toString("ascii", 4, 8) === "ftyp" && file.type === "video/mp4") extension = "mp4";
  else if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) && file.type === "video/webm") extension = "webm";
  if (!extension) return Response.json({ error: "Use JPEG, PNG, WebP, GIF, MP4 or WebM." }, { status: 400 });
  const id = `${randomUUID()}.${extension}`;
  await mkdir(path.join(dataDirectory, "media"), { recursive: true });
  await writeFile(path.join(dataDirectory, "media", id), bytes, { flag: "wx" });
  return Response.json({ id, name: file.name.slice(0, 255), type: ["mp4", "webm"].includes(extension) ? "video" : "image", url: `/api/media/${id}` }, { status: 201 });
}
