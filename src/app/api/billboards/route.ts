import { readBillboards } from "@/lib/billboardStore";
export async function GET() {
  try {
    return Response.json((await readBillboards()).filter((b) => b.published && b.enabled), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Could not load billboards." }, { status: 500 }); }
}
