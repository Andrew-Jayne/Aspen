// ---- Storage Interface ------------------------------------------------------

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

// ---- IndexedDB Backend ------------------------------------------------------

const OBJECT_STORE_NAME = "aspen-kv";

function awaitRequest<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * A StorageBackend backed by IndexedDB. IndexedDB is async-only, so this
 * backend keeps a full in-memory mirror: `open()` hydrates the mirror once,
 * reads are served synchronously from it, and writes update it synchronously
 * then persist to IndexedDB in the background. Call `flush()` to wait for
 * pending writes (e.g. before page teardown).
 */
export class IndexedDBBackend implements StorageBackend {
  private readonly database: IDBDatabase;
  private readonly cache: Map<string, string>;
  private pendingWrites: Promise<void>;

  private constructor(database: IDBDatabase, cache: Map<string, string>) {
    this.database = database;
    this.cache = cache;
    this.pendingWrites = Promise.resolve();
  }

  static async open(databaseName: string): Promise<IndexedDBBackend> {
    const openRequest = indexedDB.open(databaseName, 1);
    openRequest.onupgradeneeded = () => {
      openRequest.result.createObjectStore(OBJECT_STORE_NAME);
    };
    const DATABASE = await awaitRequest(openRequest);

    const CACHE = new Map<string, string>();
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = DATABASE.transaction(OBJECT_STORE_NAME, "readonly")
        .objectStore(OBJECT_STORE_NAME)
        .openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor === null) {
          resolve();
          return;
        }
        CACHE.set(String(cursor.key), String(cursor.value));
        cursor.continue();
      };
      cursorRequest.onerror = () => {
        reject(cursorRequest.error);
      };
    });

    return new IndexedDBBackend(DATABASE, CACHE);
  }

  getItem(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.cache.set(key, value);
    this.queueWrite((store) => {
      return store.put(value, key);
    });
  }

  removeItem(key: string): void {
    this.cache.delete(key);
    this.queueWrite((store) => {
      return store.delete(key);
    });
  }

  key(index: number): string | null {
    return [...this.cache.keys()][index] ?? null;
  }

  get length(): number {
    return this.cache.size;
  }

  /** Resolves once every write issued so far has been persisted. */
  flush(): Promise<void> {
    return this.pendingWrites;
  }

  /** Waits for pending writes, then closes the underlying database. */
  async close(): Promise<void> {
    await this.pendingWrites;
    this.database.close();
  }

  private queueWrite(
    operation: (store: IDBObjectStore) => IDBRequest<unknown>,
  ): void {
    this.pendingWrites = this.pendingWrites.then(async () => {
      try {
        await awaitRequest(
          operation(
            this.database
              .transaction(OBJECT_STORE_NAME, "readwrite")
              .objectStore(OBJECT_STORE_NAME),
          ),
        );
      } catch (error) {
        console.error("[Aspen] IndexedDB write failed:", error);
      }
    });
  }
}
