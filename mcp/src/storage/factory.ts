import { SQLiteAdapter } from "./sqlite.js";
import type { StorageAdapter } from "./adapter.js";

export function createStorageAdapter(): StorageAdapter {
  const backend = process.env.STORAGE_BACKEND ?? "sqlite";
  if (backend === "sqlite") {
    const dbPath = process.env.SKILLYARD_DB_PATH ?? "./skillyard.db";
    return new SQLiteAdapter(dbPath);
  }
  throw new Error(`Unsupported STORAGE_BACKEND: ${backend}. Supported: sqlite`);
}
