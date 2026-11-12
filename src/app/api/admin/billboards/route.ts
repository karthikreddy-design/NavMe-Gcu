import { isAdmin, canEdit } from "@/lib/adminAuth";
import { readBillboards, updateBillboards } from "@/lib/billboardStore";
import { isBillboard } from "@/data/billboards";
import { billboardMediaPath } from "@/lib/billboardMedia";
export async function GET(request: Request) {
  if (!(await isAdmin(request))) return new Response(null, { status: 401 });
  return Response.json(await readBillboards(), { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request: Request) {
  if (!(await canEdit(request))) return Response.json({ error: "Admin authorization required." }, { status: 403 });
  let data: unknown;
  try { data = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!isBillboard(data)) return Response.json({ error: "Complete the title and position; use supported uploaded media." }, { status: 400 });
  const billboard = data;
  try {
    for (const media of billboard.media) await billboardMediaPath(media.id);
    return Response.json(await updateBillboards((all) => [...all.filter((b) => b.id !== billboard.id), billboard]));
  } catch { return Response.json({ error: "Could not save billboard or find its uploaded media." }, { status: 500 }); }
}
export async function DELETE(request: Request) {
  if (!(await canEdit(request))) return Response.json({ error: "Admin authorization required." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Billboard ID required." }, { status: 400 });
  return Response.json(await updateBillboards((all) => all.filter((b) => b.id !== id)));
}
