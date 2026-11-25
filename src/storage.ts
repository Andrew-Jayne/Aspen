const OBJECT_STORE_NAME = "aspen-kv";
const DATABASE_NAME = "aspen";

let backend: IndexedDBBackend | null = null;
let opening: Promise<IndexedDBBackend> | null = null;

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

export function encodeMirror(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function decodeMirror(raw: string, type: unknown): unknown {
  if (type === String) return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

type WriteOperation =
  | { kind: "put"; key: string; value: unknown }
  | { kind: "delete"; key: string };

function fatal(message: string, cause: unknown): Error {
  return new Error(`[Aspen] ${message}`, { cause });
}

class IndexedDBBackend {
  private readonly database: IDBDatabase;
  private readonly cache: Map<string, unknown>;
  private tail: Promise<void>;

  private constructor(database: IDBDatabase, cache: Map<string, unknown>) {
    this.database = database;
    this.cache = cache;
    this.tail = Promise.resolve();
  }

  static async open(databaseName: string): Promise<IndexedDBBackend> {
    if (typeof indexedDB === "undefined") {
      throw new Error(
        "[Aspen] IndexedDB is required and not available in this environment.",
      );
    }

    let database: IDBDatabase;
    try {
      const openRequest = indexedDB.open(databaseName, 1);
      openRequest.onupgradeneeded = createObjectStoreOnUpgrade;
      database = await awaitRequest(openRequest);
    } catch (error) {
      throw fatal("Could not open IndexedDB.", error);
    }

    if (database.objectStoreNames.contains(OBJECT_STORE_NAME) === false) {
      database.close();
      throw new Error(
        `[Aspen] IndexedDB database "${databaseName}" has no "${OBJECT_STORE_NAME}" store. It was not created by Aspen.`,
      );
    }

    database.onversionchange = () => {
      database.close();
      console.error(
        "[Aspen] IndexedDB connection closed: the database was upgraded elsewhere. Reload the page.",
      );
    };

    try {
      const store = database
        .transaction(OBJECT_STORE_NAME, "readonly")
        .objectStore(OBJECT_STORE_NAME);
      const [keys, values] = await Promise.all([
        awaitRequest(store.getAllKeys()),
        awaitRequest(store.getAll()),
      ]);

      const CACHE = new Map<string, unknown>();
      for (const [index, key] of keys.entries()) {
        CACHE.set(String(key), values[index]);
      }
      return new IndexedDBBackend(database, CACHE);
    } catch (error) {
      database.close();
      throw fatal("Could not read IndexedDB.", error);
    }
  }

  getItem(key: string): unknown {
    return this.cache.get(key);
  }

  hasItem(key: string): boolean {
    return this.cache.has(key);
  }

  setItem(key: string, value: unknown): Promise<void> {
    structuredClone(value);
    this.cache.set(key, value);
    return this.queueWrite({ kind: "put", key, value });
  }

  removeItem(key: string): Promise<void> {
    this.cache.delete(key);
    return this.queueWrite({ kind: "delete", key });
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

  flush(): Promise<void> {
    return this.tail;
  }

  async close(): Promise<void> {
    await this.tail;
    this.database.close();
  }

  private queueWrite(operation: WriteOperation): Promise<void> {
    const result = this.tail.then(() => this.commit(operation));
    this.tail = result.catch(() => undefined);
    return result;
  }

  private commit(operation: WriteOperation): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.database.transaction(
        OBJECT_STORE_NAME,
        "readwrite",
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          fatal(
            `IndexedDB write failed for "${operation.key}".`,
            transaction.error,
          ),
        );
      transaction.onabort = () =>
        reject(
          fatal(
            `IndexedDB write aborted for "${operation.key}".`,
            transaction.error,
          ),
        );
      const store = transaction.objectStore(OBJECT_STORE_NAME);
      if (operation.kind === "put") {
        store.put(operation.value, operation.key);
      } else {
        store.delete(operation.key);
      }
    });
  }
}

export async function openStorage(): Promise<void> {
  if (backend !== null) return;
  opening ??= IndexedDBBackend.open(DATABASE_NAME);
  try {
    backend = await opening;
  } finally {
    opening = null;
  }
}

export function getStorage(): IndexedDBBackend {
  if (backend === null) {
    throw new Error(
      "[Aspen] Storage is not open. Build the tree with create().",
    );
  }
  return backend;
}

export async function closeStorage(): Promise<void> {
  if (backend === null) return;
  const closing = backend;
  backend = null;
  await closing.close();
}
