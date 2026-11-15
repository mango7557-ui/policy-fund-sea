import { NextResponse } from "next/server";
import { readTraining } from "../../../server/training-store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const store = readTraining();
    return NextResponse.json({ ...store, entries: store.entries.filter(e => e.status === "published") }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "학습 자료를 불러오지 못했습니다." }, { status: 503 }); }
}
