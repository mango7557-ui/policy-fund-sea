import { NextResponse } from "next/server";
import { publicOrigins } from "../../../public-site.mjs";
import { readTraining } from "../../../server/training-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  const origin = request.headers.get("origin");
  if (origin && publicOrigins.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
  try {
    const store = readTraining();
    return NextResponse.json({ ...store, entries: store.entries.filter(e => e.status === "published") }, { headers });
  } catch { return NextResponse.json({ error: "학습 자료를 불러오지 못했습니다." }, { status: 503, headers }); }
}
