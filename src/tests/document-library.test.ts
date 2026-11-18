import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH } from "../app/api/admin/documents/route";

const legacy = {
  id: "a83609a6-605b-41f1-845b-e8668570e1cb",
  name: "기존 설계서.pdf", category: "원본 자료", note: "", size: 4, createdAt: "2026-11-17T01:00:00Z",
};
const original = Buffer.from([0, 10, 200, 255]);
let directory: string;
function request(method: string, revision = legacy.id, body?: unknown, token = "test-key") {
  return new NextRequest("http://localhost/api/admin/documents?id=" + legacy.id, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "X-Document-Revision": revision },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("서버 원본 자료 보관함", () => {
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "bareun-library-test-"));
    const store = path.join(directory, ".data", "documents");
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(path.join(store, "index.json"), JSON.stringify([legacy]));
    fs.writeFileSync(path.join(store, legacy.id + ".bin"), original);
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    vi.stubEnv("BAREUN_DATA_DIR", path.join(directory, ".data"));
    vi.stubEnv("ADMIN_ACCESS_TOKEN", "test-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("edits a legacy record, detects stale writes and restores its exact bytes from trash", async () => {
    const edit = await PATCH(request("PATCH", legacy.id, { action: "edit", name: "최신 설계서.pdf", category: "설계서", note: "검토 완료" }));
    expect(edit.status).toBe(200);
    const revised = await edit.json();
    expect(revised.name).toBe("최신 설계서.pdf");
    expect((await DELETE(request("DELETE"))).status).toBe(409);
    const remove = await DELETE(request("DELETE", revised.revision));
    expect(remove.status).toBe(200);
    const removed = await remove.json();
    expect((await GET(request("GET"))).status).toBe(404);
    const list = await GET(new NextRequest("http://localhost/api/admin/documents", { headers: { Authorization: "Bearer test-key" } }));
    const inventory = await list.json();
    expect(inventory.documents).toHaveLength(0);
    expect(inventory.trash).toHaveLength(1);
    expect((await PATCH(request("PATCH", removed.revision, { action: "restore" }))).status).toBe(200);
    const file = await GET(request("GET"));
    expect(file.status).toBe(200);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(original);
  });

  it("blocks unauthorized changes and preserves metadata after invalid edits", async () => {
    const update = { action: "edit", name: "../outside.pdf", category: "설계서", note: "" };
    expect((await PATCH(request("PATCH", legacy.id, update, "wrong"))).status).toBe(401);
    expect((await DELETE(request("DELETE", legacy.id, undefined, "wrong"))).status).toBe(401);
    expect((await PATCH(request("PATCH", legacy.id, update))).status).toBe(400);
    expect((await GET(request("GET"))).headers.get("Content-Disposition")).toContain(encodeURIComponent(legacy.name));
  });
});
