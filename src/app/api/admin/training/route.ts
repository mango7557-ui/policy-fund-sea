import { timingSafeEqual, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { readTraining, writeTraining } from "../../../../server/training-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function authorize(req: NextRequest) {
  const token = process.env.ADMIN_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "서버에 ADMIN_ACCESS_TOKEN을 설정한 후 연결해 주세요." }, { status: 503 });
  const supplied = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(hash(token), hash(supplied))) return NextResponse.json({ error: "관리자 연결 키가 일치하지 않습니다." }, { status: 401 });
  return null;
}
export async function GET(req: NextRequest) {
  const denied = authorize(req); if (denied) return denied;
  try { return NextResponse.json(readTraining(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "학습 데이터를 읽을 수 없습니다." }, { status: 500 }); }
}
export async function PUT(req: NextRequest) {
  const denied = authorize(req); if (denied) return denied;
  if (Number(req.headers.get("content-length")) > 4_000_000) return NextResponse.json({ error: "파일은 4MB 이하여야 합니다." }, { status: 413 });
  try {
    const raw = await req.text();
    if (raw.length > 4_000_000) return NextResponse.json({ error: "파일은 4MB 이하여야 합니다." }, { status: 413 });
    return NextResponse.json(writeTraining(JSON.parse(raw)));
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT") return NextResponse.json({ error: "다른 화면에서 수정했습니다. 서버 데이터를 다시 불러온 후 저장해 주세요." }, { status: 409 });
    return NextResponse.json({ error: "저장에 실패했습니다. 데이터 형식과 서버 저장 권한을 확인해 주세요." }, { status: 400 });
  }
}
