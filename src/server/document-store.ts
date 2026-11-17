import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const root = () => path.resolve(process.cwd(), ".data", "documents");
const index = () => path.join(root(), "index.json");
export type StoredDocument = { id: string; name: string; category: string; note: string; size: number; createdAt: string };
export function listDocuments(): StoredDocument[] {
  if (!fs.existsSync(index())) return [];
  const result = JSON.parse(fs.readFileSync(index(), "utf8"));
  if (!Array.isArray(result)) throw new Error("Invalid document index");
  return result;
}
export function addDocument(name: string, category: string, note: string, bytes: Uint8Array): StoredDocument {
  const safeName = name.trim();
  if (!safeName || safeName.length > 200 || /[\x00-\x1f\\/]/.test(safeName) || category.length > 100 || note.length > 4000 || bytes.byteLength < 1 || bytes.byteLength > 10_000_000) throw new Error("Invalid document");
  const records = listDocuments();
  const entry = { id: randomUUID(), name: safeName, category: category.trim(), note: note.trim(), size: bytes.byteLength, createdAt: new Date().toISOString() };
  fs.mkdirSync(root(), { recursive: true });
  const file = path.join(root(), entry.id + ".bin");
  fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  try { const temp = path.join(root(), randomUUID() + ".tmp"); fs.writeFileSync(temp, JSON.stringify([entry, ...records], null, 2), { mode: 0o600 }); fs.renameSync(temp, index()); }
  catch (error) { fs.unlinkSync(file); throw error; }
  return entry;
}
export function readDocument(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  const info = listDocuments().find(item => item.id === id);
  return info ? { info, bytes: fs.readFileSync(path.join(root(), id + ".bin")) } : null;
}
