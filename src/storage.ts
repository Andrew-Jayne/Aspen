// ---- Storage Interface ------------------------------------------------------

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

// ---- Storage Detection ------------------------------------------------------

export function detectStorage(): StorageBackend | null {
  try {
    const storage = (globalThis as Record<string, unknown>).localStorage as
      | StorageBackend
      | undefined;
    if (storage === undefined) return null;
    storage.setItem("__aspen_test__", "1");
    storage.removeItem("__aspen_test__");
    return storage;
  } catch {
    return null;
  }
}
