import { NextResponse } from "next/server";
import { adminConfigured, authenticate, isAdmin, sameOrigin, adminCookie } from "@/lib/adminAuth";

let failures = { count: 0, until: 0 };
export async function GET(request: Request) {
  return NextResponse.json({ configured: await adminConfigured(), authenticated: await isAdmin(request) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (!sameOrigin(request) || request.headers.get("x-survey-mode") !== "1") return NextResponse.json({ error: "Survey access required." }, { status: 403 });
  if (failures.until > Date.now() && failures.count >= 10) return NextResponse.json({ error: "Too many attempts. Try again in 10 minutes." }, { status: 429 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.password !== "string") return NextResponse.json({ error: "Password required." }, { status: 400 });
  const token = await authenticate(request, body.password, body.setup === true);
  if (!token) {
    failures = { count: failures.until > Date.now() ? failures.count + 1 : 1, until: Date.now() + 600000 };
    return NextResponse.json({ error: "Check your password. First-time setup requires at least 12 characters and localhost access." }, { status: 401 });
  }
  failures = { count: 0, until: 0 };
  const response = NextResponse.json({ authenticated: true, configured: true });
  response.cookies.set({ ...adminCookie, value: token, secure: new URL(request.url).protocol === "https:" });
  return response;
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request) || request.headers.get("x-survey-mode") !== "1") return new Response(null, { status: 403 });
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({ ...adminCookie, value: "", maxAge: 0 });
  return response;
}
