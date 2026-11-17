import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { addDocument, listDocuments, readDocument } from "../../../../server/document-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function authorized(request: NextRequest) {
  const secret = process.env.ADMIN_ACCESS_TOKEN;
  if (!secret) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(secret), digest(provided));
}
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ documents: listDocuments() }, { headers: { "Cache-Control": "no-store" } });
    const document = readDocument(id);
    if (!document) return NextResponse.json({ error: "자료를 찾을 수 없습니다." }, { status: 404 });
    return new NextResponse(new Uint8Array(document.bytes), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.info.name)}`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "자료를 읽지 못했습니다." }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  if (Number(request.headers.get("content-length")) > 10_500_000) return NextResponse.json({ error: "파일은 10MB 이하여야 합니다." }, { status: 413 });
  try {
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File) || file.size > 10_000_000) return NextResponse.json({ error: "10MB 이하의 파일을 선택해 주세요." }, { status: 400 });
    return NextResponse.json(addDocument(file.name, String(form.get("category") || "기타"), String(form.get("note") || ""), new Uint8Array(await file.arrayBuffer())), { status: 201 });
  } catch { return NextResponse.json({ error: "자료를 저장하지 못했습니다. 파일명과 크기를 확인해 주세요." }, { status: 400 }); }
}
