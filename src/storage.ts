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

/**
 * Settles a promise from an IDBRequest's `success` / `error` events using
 * bound methods, so the request needs no anonymous callbacks. Bound methods
 * rather than an EventListenerObject because fake-indexeddb (used in tests)
 * invokes `handleEvent` with `this` set to the request, not the listener.
 */
class RequestSettler<Result> {
  readonly promise: Promise<Result>;
  private readonly request: IDBRequest<Result>;
  private readonly resolve: (value: Result) => void;
  private readonly reject: (reason: unknown) => void;

  constructor(request: IDBRequest<Result>) {
    const { promise, resolve, reject } = Promise.withResolvers<Result>();
    this.promise = promise;
    this.resolve = resolve;
    this.reject = reject;
    this.request = request;
    request.onsuccess = this.settleSuccess.bind(this);
    request.onerror = this.settleError.bind(this);
  }

  private settleSuccess(): void {
    this.resolve(this.request.result);
  }

  private settleError(): void {
    this.reject(this.request.error);
  }
}

function awaitRequest<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new RequestSettler(request).promise;
}

function createObjectStoreOnUpgrade(event: IDBVersionChangeEvent): void {
  (event.target as IDBOpenDBRequest).result.createObjectStore(
    OBJECT_STORE_NAME,
  );
}

type WriteOperation =
  | { kind: "put"; key: string; value: string }
  | { kind: "delete"; key: string };

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
    openRequest.onupgradeneeded = createObjectStoreOnUpgrade;
    const DATABASE = await awaitRequest(openRequest);

    // Both requests are issued synchronously so they share one transaction
    // and see one consistent snapshot; getAllKeys/getAll return in key order.
    const store = DATABASE.transaction(
      OBJECT_STORE_NAME,
      "readonly",
    ).objectStore(OBJECT_STORE_NAME);
    const [keys, values] = await Promise.all([
      awaitRequest(store.getAllKeys()),
      awaitRequest(store.getAll()),
    ]);

    const CACHE = new Map<string, string>();
    for (const [index, key] of keys.entries()) {
      CACHE.set(String(key), String(values[index]));
    }

    return new IndexedDBBackend(DATABASE, CACHE);
  }

  getItem(key: string): string | null {
    if (this.cache.has(key) === true) {
      return this.cache.get(key) as string;
    }
    return null;
  }

  setItem(key: string, value: string): void {
    this.cache.set(key, value);
    this.queueWrite({ kind: "put", key, value });
  }

  removeItem(key: string): void {
    this.cache.delete(key);
    this.queueWrite({ kind: "delete", key });
  }

  key(index: number): string | null {
    const cacheKeys = [...this.cache.keys()];
    if (index >= 0 && index < cacheKeys.length) {
      return cacheKeys[index] as string;
    }
    return null;
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

  private queueWrite(operation: WriteOperation): void {
    this.pendingWrites = this.persistAfter(this.pendingWrites, operation);
  }

  /** Runs `operation` against IndexedDB once `previous` has settled. */
  private async persistAfter(
    previous: Promise<void>,
    operation: WriteOperation,
  ): Promise<void> {
    await previous;
    try {
      const store = this.database
        .transaction(OBJECT_STORE_NAME, "readwrite")
        .objectStore(OBJECT_STORE_NAME);
      if (operation.kind === "put") {
        await awaitRequest(store.put(operation.value, operation.key));
      } else {
        await awaitRequest(store.delete(operation.key));
      }
    } catch (error) {
      console.error("[Aspen] IndexedDB write failed:", error);
    }
  }
}
