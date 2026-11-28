type WriteOperation =
  | { kind: "put"; key: string; value: unknown }
  | { kind: "delete"; key: string };

class RequestSettler<Result> {
  readonly promise: Promise<Result>;
  private readonly request: IDBRequest<Result>;
  private readonly resolve: (value: Result) => void;
  private readonly reject: (reason: unknown) => void;

  private constructor(request: IDBRequest<Result>) {
    const { promise, resolve, reject } = Promise.withResolvers<Result>();
    this.promise = promise;
    this.resolve = resolve;
    this.reject = reject;
    this.request = request;
    request.onsuccess = this.settleSuccess.bind(this);
    request.onerror = this.settleError.bind(this);
  }

  // Public static methods

  public static settle<Result>(request: IDBRequest<Result>): Promise<Result> {
    return new RequestSettler(request).promise;
  }

  // Private methods

  private settleSuccess(): void {
    this.resolve(this.request.result);
  }

  private settleError(): void {
    this.reject(this.request.error);
  }
}

export class IndexedDBBackend {
  private readonly database: IDBDatabase;
  private readonly cache: Map<string, unknown>;
  private tail: Promise<void>;

  private static readonly OBJECT_STORE_NAME = "aspen-kv";
  private static readonly DATABASE_NAME = "aspen";
  private static connection: Promise<void> | null = null;
  private static instance: IndexedDBBackend | null = null;

  private constructor(database: IDBDatabase, cache: Map<string, unknown>) {
    this.database = database;
    this.cache = cache;
    this.tail = Promise.resolve();
  }

  // Getters

  public get length(): number {
    IndexedDBBackend.requireBackend(this, "length");
    return this.cache.size;
  }

  /** The one open backend. Every read and write in Aspen goes through it. */
  public static get gateway(): IndexedDBBackend {
    if (IndexedDBBackend.instance === null) {
      throw new Error(
        "[Aspen] IndexedDB is not connected. Build trees and groves with await create().",
      );
    }
    return IndexedDBBackend.instance;
  }

  // Public methods

  public getItem(this: IndexedDBBackend, key: string): unknown {
    IndexedDBBackend.requireBackend(this, "getItem");
    return this.cache.get(key);
  }

  public hasItem(this: IndexedDBBackend, key: string): boolean {
    IndexedDBBackend.requireBackend(this, "hasItem");
    return this.cache.has(key);
  }

  public setItem(
    this: IndexedDBBackend,
    key: string,
    value: unknown,
  ): Promise<void> {
    IndexedDBBackend.requireBackend(this, "setItem");
    structuredClone(value);
    this.cache.set(key, value);
    return this.queueWrite({ kind: "put", key, value });
  }

  public removeItem(this: IndexedDBBackend, key: string): Promise<void> {
    IndexedDBBackend.requireBackend(this, "removeItem");
    this.cache.delete(key);
    return this.queueWrite({ kind: "delete", key });
  }

  public key(this: IndexedDBBackend, index: number): string | null {
    IndexedDBBackend.requireBackend(this, "key");
    const cacheKeys = [...this.cache.keys()];
    if (index >= 0 && index < cacheKeys.length) {
      return cacheKeys[index] as string;
    }
    return null;
  }

  public flush(this: IndexedDBBackend): Promise<void> {
    IndexedDBBackend.requireBackend(this, "flush");
    return this.tail;
  }

  public async close(this: IndexedDBBackend): Promise<void> {
    IndexedDBBackend.requireBackend(this, "close");
    if (IndexedDBBackend.instance === this) {
      IndexedDBBackend.instance = null;
      IndexedDBBackend.connection = null;
    }
    await this.tail;
    this.database.close();
  }

  // Public static methods

  public static connect(): Promise<void> {
    if (IndexedDBBackend.connection === null) {
      IndexedDBBackend.connection = IndexedDBBackend.open(
        IndexedDBBackend.DATABASE_NAME,
      ).then(
        IndexedDBBackend.rememberConnection,
        IndexedDBBackend.forgetFailedConnection,
      );
    }
    return IndexedDBBackend.connection;
  }

  // Private methods

  private queueWrite(
    this: IndexedDBBackend,
    operation: WriteOperation,
  ): Promise<void> {
    const result = this.tail.then(
      () =>
        new Promise<void>((resolve, reject) => {
          const transaction = this.database.transaction(
            IndexedDBBackend.OBJECT_STORE_NAME,
            "readwrite",
          );
          transaction.oncomplete = () => resolve();
          transaction.onerror = () =>
            reject(
              IndexedDBBackend.fatal(
                `IndexedDB write failed for "${operation.key}".`,
                transaction.error,
              ),
            );
          transaction.onabort = () =>
            reject(
              IndexedDBBackend.fatal(
                `IndexedDB write aborted for "${operation.key}".`,
                transaction.error,
              ),
            );
          const store = transaction.objectStore(
            IndexedDBBackend.OBJECT_STORE_NAME,
          );
          if (operation.kind === "put") {
            store.put(operation.value, operation.key);
          } else {
            store.delete(operation.key);
          }
        }),
    );
    this.tail = result.catch(() => undefined);
    return result;
  }

  // Private static methods

  private static async open(databaseName: string): Promise<IndexedDBBackend> {
    if (typeof indexedDB === "undefined") {
      throw new Error(
        "[Aspen] IndexedDB is required and not available in this environment.",
      );
    }

    let database: IDBDatabase;
    try {
      const openRequest = indexedDB.open(databaseName, 1);
      openRequest.onupgradeneeded = IndexedDBBackend.createObjectStoreOnUpgrade;
      database = await RequestSettler.settle(openRequest);
    } catch (error) {
      throw IndexedDBBackend.fatal("Could not open IndexedDB.", error);
    }

    if (
      database.objectStoreNames.contains(IndexedDBBackend.OBJECT_STORE_NAME) ===
      false
    ) {
      database.close();
      throw new Error(
        `[Aspen] IndexedDB database "${databaseName}" has no "${IndexedDBBackend.OBJECT_STORE_NAME}" store. It was not created by Aspen.`,
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
        .transaction(IndexedDBBackend.OBJECT_STORE_NAME, "readonly")
        .objectStore(IndexedDBBackend.OBJECT_STORE_NAME);
      const [keys, values] = await Promise.all([
        RequestSettler.settle(store.getAllKeys()),
        RequestSettler.settle(store.getAll()),
      ]);

      const CACHE = new Map<string, unknown>();
      for (const [index, key] of keys.entries()) {
        CACHE.set(String(key), values[index]);
      }
      return new IndexedDBBackend(database, CACHE);
    } catch (error) {
      database.close();
      throw IndexedDBBackend.fatal("Could not read IndexedDB.", error);
    }
  }

  private static requireBackend(self: unknown, method: string): void {
    if (self instanceof IndexedDBBackend === false) {
      throw new Error(
        `[Aspen] ${method}() was called without its storage backend as \`this\`. Call it as storage.${method}(...) or wrap it in a function.`,
      );
    }
  }

  private static fatal(message: string, cause: unknown): Error {
    return new Error(`[Aspen] ${message}`, { cause });
  }

  private static createObjectStoreOnUpgrade(
    event: IDBVersionChangeEvent,
  ): void {
    (event.target as IDBOpenDBRequest).result.createObjectStore(
      IndexedDBBackend.OBJECT_STORE_NAME,
    );
  }

  private static rememberConnection(backend: IndexedDBBackend): void {
    IndexedDBBackend.instance = backend;
  }

  private static forgetFailedConnection(error: unknown): never {
    IndexedDBBackend.connection = null;
    throw error;
  }
}
