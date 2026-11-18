import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { addDocument, changeDocument, DocumentError, documentInventory, readDocument } from "../../../../server/document-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.ADMIN_ACCESS_TOKEN;
  if (!secret) return false;
  const provided = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(secret), digest(provided));
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const denied = () => json({ error: "관리자 인증이 필요합니다." }, 401);

function failure(error: unknown) {
  if (error instanceof DocumentError) return json({ error: error.message }, error.status);
  return json({ error: "서버에서 자료를 처리하지 못했습니다." }, 500);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return denied();
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (id === null) return json(documentInventory());
    const document = readDocument(id);
    if (!document) return json({ error: "자료를 찾을 수 없습니다." }, 404);
    return new NextResponse(new Uint8Array(document.bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(document.info.name).replace(/'/g, "%27"),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return denied();
  if (Number(request.headers.get("content-length")) > 10_500_000) return json({ error: "파일은 10MB 이하여야 합니다." }, 413);
  try {
    const form = await request.formData().catch(() => { throw new DocumentError(400, "파일 형식을 확인해 주세요."); });
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 10_000_000) return json({ error: "10MB 이하의 파일을 선택해 주세요." }, 400);
    return json(addDocument(file.name, String(form.get("category") || "기타"), String(form.get("note") || ""), new Uint8Array(await file.arrayBuffer())), 201);
  } catch (error) { return failure(error); }
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) return denied();
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    const revision = request.headers.get("x-document-revision");
    const value = await request.json().catch(() => null);
    if (value?.action !== "edit" && value?.action !== "restore") return json({ error: "요청 형식을 확인해 주세요." }, 400);
    return json(changeDocument(id, revision, value.action, value));
  } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest) {
  if (!authorized(request)) return denied();
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    return json(changeDocument(id, request.headers.get("x-document-revision"), "trash"));
  } catch (error) { return failure(error); }
}
