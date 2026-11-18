import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const root = () => path.resolve(process.env.BAREUN_DATA_DIR || path.join(process.cwd(), ".data"), "documents");
const indexPath = () => path.join(root(), "index.json");
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DocumentFields = { name: string; category: string; note: string };
export type StoredDocument = DocumentFields & {
  id: string;
  size: number;
  createdAt: string;
  revision?: string;
  deletedAt?: string;
};

export class DocumentError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function records(): StoredDocument[] {
  if (!fs.existsSync(indexPath())) return [];
  const result = JSON.parse(fs.readFileSync(indexPath(), "utf8"));
  if (!Array.isArray(result)) throw new Error("Invalid document index");
  return result;
}

function writeIndex(items: StoredDocument[]) {
  const temp = path.join(root(), randomUUID() + ".tmp");
  try {
    fs.writeFileSync(temp, JSON.stringify(items, null, 2), { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, indexPath());
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function fields(value: unknown): DocumentFields {
  if (!value || typeof value !== "object" || !("name" in value) || typeof value.name !== "string"
    || !("note" in value) || typeof value.note !== "string" || !("category" in value) || typeof value.category !== "string") {
    throw new DocumentError(400, "파일명, 분류, 설명을 확인해 주세요.");
  }
  const name = value.name.trim();
  if (!name || name.length > 200 || /[\x00-\x1f\\/]/.test(name) || value.category.length > 100 || value.note.length > 4000) {
    throw new DocumentError(400, "파일명, 분류 또는 설명의 길이와 문자를 확인해 주세요.");
  }
  return { name, category: value.category.trim() || "기타", note: value.note.trim() };
}

export function documentInventory() {
  const items = records();
  return { documents: items.filter(item => !item.deletedAt), trash: items.filter(item => item.deletedAt) };
}

export function addDocument(name: string, category: string, note: string, bytes: Uint8Array): StoredDocument {
  const metadata = fields({ name, category, note });
  if (bytes.byteLength < 1 || bytes.byteLength > 10_000_000) throw new DocumentError(400, "비어 있지 않은 10MB 이하 파일을 선택해 주세요.");
  const items = records();
  const entry = { ...metadata, id: randomUUID(), size: bytes.byteLength, createdAt: new Date().toISOString() };
  fs.mkdirSync(root(), { recursive: true });
  const file = path.join(root(), entry.id + ".bin");
  fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  try {
    writeIndex([entry, ...items]);
  } catch (error) {
    fs.unlinkSync(file);
    throw error;
  }
  return entry;
}

export function changeDocument(id: string, revision: string | null, action: "edit" | "trash" | "restore", metadata?: unknown): StoredDocument {
  const items = records();
  const entry = items.find(item => item.id === id);
  if (!entry || !validId.test(id)) throw new DocumentError(404, "자료를 찾을 수 없습니다.");
  if (!revision || revision !== (entry.revision ?? entry.id)) {
    throw new DocumentError(409, "자료가 변경되었습니다. 최신 목록을 확인한 후 다시 시도해 주세요.");
  }
  if (action === "restore") {
    if (!entry.deletedAt) throw new DocumentError(409, "이미 보관함에 있는 자료입니다.");
    delete entry.deletedAt;
  } else {
    if (entry.deletedAt) throw new DocumentError(409, "휴지통에 있는 자료입니다.");
    if (action === "trash") entry.deletedAt = new Date().toISOString();
    else Object.assign(entry, fields(metadata));
  }
  entry.revision = randomUUID();
  writeIndex(items);
  return entry;
}

export function readDocument(id: string) {
  if (!validId.test(id)) return null;
  const info = records().find(item => item.id === id && !item.deletedAt);
  return info ? { info, bytes: fs.readFileSync(path.join(root(), id + ".bin")) } : null;
}
