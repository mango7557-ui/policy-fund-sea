import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { EMPTY_TRAINING, matchTraining, parseTrainingStore, trainingPrompt, TrainingEntry } from "../engines/training";
import { readTraining, writeTraining } from "../server/training-store";
import { GET, PUT } from "../app/api/admin/training/route";
import { GET as publicKnowledge } from "../app/api/knowledge/route";

const entry = (overrides: Partial<TrainingEntry> = {}): TrainingEntry => ({ id: "one", title: "서류 준비", content: "사업자등록증을 준비합니다.", keywords: "운전자금, 서류", category: "신청·서류", status: "published", source: "기관 안내", updatedAt: "2026-11-09T00:00:00Z", ...overrides });
let temp = "";
const oldFile = process.env.TRAINING_DATA_FILE;
const oldToken = process.env.ADMIN_ACCESS_TOKEN;
afterEach(() => {
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
  temp = "";
  if (oldFile === undefined) delete process.env.TRAINING_DATA_FILE; else process.env.TRAINING_DATA_FILE = oldFile;
  if (oldToken === undefined) delete process.env.ADMIN_ACCESS_TOKEN; else process.env.ADMIN_ACCESS_TOKEN = oldToken;
});
function setup() { temp = fs.mkdtempSync(path.join(os.tmpdir(), "bareunfund-training-")); process.env.TRAINING_DATA_FILE = path.join(temp, "training.json"); process.env.ADMIN_ACCESS_TOKEN = "test-only-admin-token"; }
function request(method = "GET", token = "test-only-admin-token", body?: unknown) { return new NextRequest("http://localhost/api/admin/training", { method, headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); }

describe("training knowledge", () => {
  it("validates imports and rejects duplicate IDs, blank content and unknown status", () => {
    expect(parseTrainingStore({ ...EMPTY_TRAINING, entries: [entry()] }).entries).toHaveLength(1);
    for (const entries of [[entry(), entry()], [entry({ content: " " })], [entry({ status: "active" as "draft" })]]) expect(() => parseTrainingStore({ ...EMPTY_TRAINING, entries })).toThrow();
    expect(() => parseTrainingStore({ ...EMPTY_TRAINING, revision: -1 })).toThrow();
    expect(() => parseTrainingStore({ ...EMPTY_TRAINING, entries: [entry({ content: "a".repeat(6001) })] })).toThrow();
  });
  it("finds published keyword matches but never draft knowledge", () => {
    const entries = [entry({ id: "draft", status: "draft" }), entry()];
    expect(matchTraining(entries, "운전자금을 신청하려고 합니다").map(e => e.id)).toEqual(["one"]);
    expect(matchTraining(entries, "안녕하세요")).toEqual([]);
  });
  it("includes published tone rules independently of search and removes duplicates", () => {
    const rules = entry({ category: "상담 원칙", content: "한 번에 하나씩 질문하세요." });
    const prompt = trainingPrompt([rules, entry({ id: "private", status: "draft", content: "PRIVATE_DRAFT" })], "운전자금");
    expect(prompt).toContain("한 번에 하나씩 질문하세요.");
    expect(prompt).not.toContain("PRIVATE_DRAFT");
    expect(prompt.split("한 번에 하나씩 질문하세요.")).toHaveLength(2);
  });
  it("persists edits and prevents stale writes from overwriting newer knowledge", () => {
    setup();
    const saved = writeTraining({ ...EMPTY_TRAINING, entries: [entry()] });
    expect(saved.revision).toBe(1);
    expect(readTraining().entries[0].title).toBe("서류 준비");
    expect(() => writeTraining(EMPTY_TRAINING)).toThrow("CONFLICT");
    writeTraining({ ...saved, entries: [] });
    expect(readTraining().entries).toEqual([]);
  });
  it("requires authentication for all admin reads and writes", async () => {
    setup();
    expect((await GET(request("GET", "wrong"))).status).toBe(401);
    expect((await PUT(request("PUT", "wrong", EMPTY_TRAINING))).status).toBe(401);
    delete process.env.ADMIN_ACCESS_TOKEN;
    expect((await GET(request())).status).toBe(503);
  });
  it("serves only published entries publicly and rejects conflicting updates", async () => {
    setup();
    const payload = { ...EMPTY_TRAINING, entries: [entry(), entry({ id: "draft", status: "draft" })] };
    expect((await PUT(request("PUT", undefined, payload))).status).toBe(200);
    expect((await (await GET(request())).json()).entries).toHaveLength(2);
    expect((await (await publicKnowledge(new Request("http://localhost/api/knowledge"))).json()).entries.map((e: TrainingEntry) => e.id)).toEqual(["one"]);
    expect((await PUT(request("PUT", undefined, payload))).status).toBe(409);
  });
  it.each([
    ["https://barunfund.kr", true],
    ["https://www.barunfund.kr", true],
    ["https://mango7557-ui.github.io", true],
    ["https://other.github.io", false],
    ["https://barunfund.kr.example.com", false],
  ] as const)("checks the published knowledge origin %s", async (origin, allowed) => {
    setup();
    const response = await publicKnowledge(new Request("http://localhost/api/knowledge", { headers: { Origin: origin } }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(allowed ? origin : null);
    expect(response.headers.get("Vary")).toBe("Origin");
  });
});
