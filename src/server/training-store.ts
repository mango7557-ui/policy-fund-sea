import fs from "node:fs";
import path from "node:path";
import { EMPTY_TRAINING, parseTrainingStore, TrainingStore } from "../engines/training";

const file = () => path.resolve(process.env.TRAINING_DATA_FILE || path.join(process.cwd(), ".data", "training.json"));
export function readTraining(): TrainingStore {
  const target = file();
  if (!fs.existsSync(target)) return EMPTY_TRAINING;
  return parseTrainingStore(JSON.parse(fs.readFileSync(target, "utf8")));
}
export function writeTraining(input: unknown): TrainingStore {
  const next = parseTrainingStore(input);
  const current = readTraining();
  if (next.revision !== current.revision) throw new Error("CONFLICT");
  const saved = { ...next, revision: current.revision + 1 };
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(saved, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, target);
  return saved;
}
