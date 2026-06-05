import { afterEach, beforeEach } from "bun:test";

export class MockStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  key(index: number): string | null {
    const keys = [...this.data.keys()];
    return keys[index] ?? null;
  }

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }
}

export let mockStorage: MockStorage;

beforeEach(() => {
  mockStorage = new MockStorage();
  (globalThis as Record<string, unknown>).localStorage = mockStorage;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
});
