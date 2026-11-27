import { AspenKey } from "./key.ts";
import { IndexedDBBackend } from "./storage.ts";

type TreeSelf = Pick<StateTree, keyof StateTree>;

export abstract class StateTree {
  abstract readonly namespace: string;
  readonly persistenceUrl: string | null;
  readonly storage: IndexedDBBackend;

  private readonly ephemeralStore: Map<string, unknown> = new Map();

  private static creating = false;
  private static readonly keyCache = new WeakMap<object, AspenKey[]>();
  private static readonly RESERVED_FIELDS: ReadonlySet<string> = new Set([
    "namespace",
    "persistenceUrl",
    "storage",
    "ephemeralStore",
  ]);

  public constructor(
    storage: IndexedDBBackend,
    persistenceUrl: string | null = null,
  ) {
    if (StateTree.creating === false) {
      throw new Error(
        `[Aspen] ${new.target.name} cannot be built with new. Use await ${new.target.name}.create() so keys are bound and storage is open.`,
      );
    }
    StateTree.creating = false;
    this.storage = storage;
    this.persistenceUrl = persistenceUrl;
  }

  // Public methods

  public bootstrap(this: TreeSelf): void {
    StateTree.requireTree(this, "bootstrap");
    for (const key of StateTree.ownKeysOf(this)) {
      key.notify();
    }
  }

  public async validateStorage(this: TreeSelf): Promise<void> {
    StateTree.requireTree(this, "validateStorage");
    const storage = this.storage;
    const writes: Promise<void>[] = [];
    const owned = new Set<string>();

    for (const key of StateTree.ownKeysOf(this)) {
      owned.add(key.storageKey);
      writes.push(key.prepareStorage());
    }

    const orphaned: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const storedKey = storage.key(index);
      if (
        storedKey !== null &&
        storedKey.startsWith(this.namespace) === true &&
        owned.has(storedKey) === false
      ) {
        orphaned.push(storedKey);
      }
    }
    for (const storedKey of orphaned) {
      console.warn(`[Aspen] Removing orphaned key: ${storedKey}`);
      writes.push(storage.removeItem(storedKey));
    }

    const strayMirrors: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const storedKey = localStorage.key(index);
      if (
        storedKey !== null &&
        storedKey.startsWith(this.namespace) === true &&
        owned.has(storedKey) === false
      ) {
        strayMirrors.push(storedKey);
      }
    }
    for (const storedKey of strayMirrors) {
      localStorage.removeItem(storedKey);
    }

    await Promise.all(writes);
  }

  public exportPersistent(this: TreeSelf): Record<string, unknown> {
    StateTree.requireTree(this, "exportPersistent");
    const out: Record<string, unknown> = {};
    for (const key of StateTree.ownKeysOf(this)) {
      if (this.storage.hasItem(key.storageKey) === true) {
        out[key.storageKey] = this.storage.getItem(key.storageKey);
      }
    }
    return out;
  }

  public async importPersistent(
    this: TreeSelf,
    data: Record<string, unknown>,
  ): Promise<void> {
    StateTree.requireTree(this, "importPersistent");
    const writes: Promise<void>[] = [];
    for (const [storageKey, value] of Object.entries(data)) {
      if (storageKey.startsWith(this.namespace) === false) continue;

      const key = (this as unknown as Record<string, unknown>)[
        storageKey.slice(this.namespace.length)
      ];
      if (key instanceof AspenKey === false) continue;
      if (this.storage.hasItem(storageKey) === false) continue;

      writes.push(key.update(value));
    }
    await Promise.all(writes);
  }

  public async pushPersistent(
    this: TreeSelf,
    urlOverride: string | null = null,
  ): Promise<void> {
    StateTree.requireTree(this, "pushPersistent");
    const targetUrl = StateTree.resolvePersistenceUrl(
      this.persistenceUrl,
      urlOverride,
    );
    const response = await fetch(targetUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.exportPersistent()),
    });
    if (response.ok === false) {
      throw new Error(
        `[Aspen] Push to "${targetUrl}" failed: HTTP ${response.status}`,
      );
    }
  }

  public async pullPersistent(
    this: TreeSelf,
    urlOverride: string | null = null,
  ): Promise<boolean> {
    StateTree.requireTree(this, "pullPersistent");
    const targetUrl = StateTree.resolvePersistenceUrl(
      this.persistenceUrl,
      urlOverride,
    );
    const response = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) {
      return false;
    }
    if (response.ok === false) {
      throw new Error(
        `[Aspen] Pull from "${targetUrl}" failed: HTTP ${response.status}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    const malformedError = new Error(
      `[Aspen] Pull from "${targetUrl}" returned malformed state`,
    );
    if (typeof data !== "object") throw malformedError;
    if (data === null) throw malformedError;
    if (Array.isArray(data) === true) throw malformedError;

    await this.importPersistent(data);
    return true;
  }

  // Public static methods

  public static async create<Tree extends StateTree>(
    this: new (
      storage: IndexedDBBackend,
      persistenceUrl: string | null,
    ) => Tree,
    persistenceUrl: string | null = null,
  ): Promise<Readonly<Tree>> {
    const storage = await IndexedDBBackend.connect();

    StateTree.creating = true;
    let tree: Tree;
    try {
      tree = new this(storage, persistenceUrl);
    } finally {
      StateTree.creating = false;
    }

    for (const [name, field] of Object.entries(tree) as [string, unknown][]) {
      if (field instanceof AspenKey === false) continue;
      if (name in StateTree.prototype === true) {
        throw new Error(
          `[Aspen] Key name "${name}" collides with a StateTree method`,
        );
      }
      if (StateTree.RESERVED_FIELDS.has(name) === true) {
        throw new Error(
          `[Aspen] Key name "${name}" collides with a StateTree field`,
        );
      }

      const key = field as AspenKey;
      key.bind(name, tree.namespace, storage, tree.ephemeralStore);
      Object.defineProperty(tree, name, {
        value: key,
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }

    await tree.validateStorage();

    return tree as unknown as Readonly<Tree>;
  }

  // Private static methods

  private static requireTree(self: unknown, method: string): void {
    if (self instanceof StateTree === false) {
      throw new Error(
        `[Aspen] ${method}() was called without its tree as \`this\`. Call it as tree.${method}(...) or wrap it in a function.`,
      );
    }
  }

  private static ownKeysOf(tree: TreeSelf): AspenKey[] {
    const keys = StateTree.keyCache.get(tree);
    if (keys === undefined) {
      const found: AspenKey[] = [];
      for (const value of Object.values(tree) as unknown[]) {
        if (value instanceof AspenKey) found.push(value);
      }
      StateTree.keyCache.set(tree, found);
      return found;
    }
    return keys;
  }

  private static resolvePersistenceUrl(
    configured: string | null,
    urlOverride: string | null,
  ): string {
    let targetUrl: string | null = configured;
    if (urlOverride !== null) {
      targetUrl = urlOverride;
    }
    if (targetUrl === null) {
      throw new Error(
        "[Aspen] No persistence URL configured. Set persistenceUrl on the tree or pass one as an argument.",
      );
    }
    return targetUrl;
  }
}
