import { AspenKey } from "./key.ts";
import {
  decodeMirror,
  encodeMirror,
  getStorage,
  openStorage,
} from "./storage.ts";

function requireTree(self: unknown, method: string): void {
  if (self instanceof StateTree === false) {
    throw new Error(
      `[Aspen] ${method}() was called without its tree as \`this\`. Call it as tree.${method}(...) or wrap it in a function.`,
    );
  }
}

type TreeSelf = Pick<StateTree, keyof StateTree>;

const keyCache = new WeakMap<object, AspenKey[]>();

function ownKeysOf(tree: TreeSelf): AspenKey[] {
  let keys = keyCache.get(tree);
  if (keys === undefined) {
    const found: AspenKey[] = [];
    for (const value of Object.values(tree) as unknown[]) {
      if (value instanceof AspenKey) found.push(value);
    }
    keyCache.set(tree, found);
    return found;
  }
  return keys;
}

function resolvePersistenceUrl(
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

let creating = false;

export abstract class StateTree {
  abstract readonly namespace: string;
  readonly persistenceUrl: string | null;

  private readonly ephemeralStore: Map<string, unknown> = new Map();

  constructor(persistenceUrl: string | null = null) {
    if (creating === false) {
      throw new Error(
        `[Aspen] ${new.target.name} cannot be built with new. Use await ${new.target.name}.create() so keys are bound and storage is open.`,
      );
    }
    creating = false;
    this.persistenceUrl = persistenceUrl;
  }

  static async create<Tree extends StateTree>(
    this: new (
      persistenceUrl: string | null,
    ) => Tree,
    persistenceUrl: string | null = null,
  ): Promise<Readonly<Tree>> {
    await openStorage();

    creating = true;
    let tree: Tree;
    try {
      tree = new this(persistenceUrl);
    } finally {
      creating = false;
    }

    for (const [name, field] of Object.entries(tree) as [string, unknown][]) {
      if (field instanceof AspenKey === false) continue;
      if (name in StateTree.prototype === true) {
        throw new Error(
          `[Aspen] Key name "${name}" collides with a StateTree method`,
        );
      }

      const key = field as AspenKey;
      key.bind(name, tree.namespace, tree.ephemeralStore);
      Object.defineProperty(tree, name, {
        value: key,
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }

    return tree as unknown as Readonly<Tree>;
  }

  bootstrap(this: TreeSelf): void {
    requireTree(this, "bootstrap");
    for (const key of ownKeysOf(this)) {
      key.notify();
    }
  }

  async validateStorage(this: TreeSelf): Promise<void> {
    requireTree(this, "validateStorage");
    const storage = getStorage();
    const writes: Promise<void>[] = [];
    const validStorageKeys = new Set<string>();
    const mirrorKeys = new Set<string>();
    const aliasMap = new Map<string, AspenKey>();

    const legacyKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key !== null && key.startsWith(this.namespace) === true) {
        legacyKeys.push(key);
      }
    }

    const keysByStorageKey = new Map<string, AspenKey>();
    for (const key of ownKeysOf(this)) {
      keysByStorageKey.set(key.storageKey, key);
    }

    for (const legacyKey of legacyKeys) {
      const raw = localStorage.getItem(legacyKey);
      const owner = keysByStorageKey.get(legacyKey);
      if (
        raw !== null &&
        owner !== undefined &&
        owner.definition.persistent === true &&
        storage.hasItem(legacyKey) === false
      ) {
        const value = decodeMirror(
          raw,
          typeof owner.definition.default === "string",
        );
        if (value === undefined) continue;
        writes.push(storage.setItem(legacyKey, value));
        console.info(
          `[Aspen] Moved "${legacyKey}" from localStorage to IndexedDB`,
        );
      }
    }

    for (const key of ownKeysOf(this)) {
      if (key.definition.persistent === true) {
        validStorageKeys.add(key.storageKey);

        if (key.definition.aliases !== null) {
          for (const alias of key.definition.aliases) {
            aliasMap.set(alias, key);
          }
        }
      }
      if (key.definition.bootMirror === true) {
        mirrorKeys.add(key.storageKey);
      }
    }

    for (const [oldKey, key] of aliasMap) {
      if (storage.hasItem(oldKey) === true) {
        const oldValue = storage.getItem(oldKey);
        if (storage.hasItem(key.storageKey) === false) {
          writes.push(storage.setItem(key.storageKey, oldValue));
          console.info(`[Aspen] Migrated "${oldKey}" → "${key.storageKey}"`);
        }
        writes.push(storage.removeItem(oldKey));
        validStorageKeys.add(oldKey);
      }
    }

    const orphaned: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const storedKey = storage.key(index);
      if (
        storedKey !== null &&
        storedKey.startsWith(this.namespace) === true &&
        validStorageKeys.has(storedKey) === false
      ) {
        orphaned.push(storedKey);
      }
    }

    for (const storedKey of orphaned) {
      console.warn(`[Aspen] Removing orphaned key: ${storedKey}`);
      writes.push(storage.removeItem(storedKey));
    }

    for (const [name, value] of Object.entries(this) as [string, unknown][]) {
      if (value instanceof AspenKey === false) continue;
      const key = value as AspenKey;

      if (key.definition.persistent === false) continue;

      if (storage.hasItem(key.storageKey) === false) {
        writes.push(storage.setItem(key.storageKey, key.definition.default));
        console.info(`[Aspen] Restored default for missing key: ${name}`);
        continue;
      }

      if (key.accepts(storage.getItem(key.storageKey)) === false) {
        console.warn(
          `[Aspen] Invalid stored value for "${name}"; resetting to default`,
        );
        writes.push(storage.setItem(key.storageKey, key.definition.default));
      }
    }

    for (const legacyKey of legacyKeys) {
      if (mirrorKeys.has(legacyKey) === false) {
        localStorage.removeItem(legacyKey);
      }
    }
    for (const mirrorKey of mirrorKeys) {
      if (storage.hasItem(mirrorKey) === true) {
        localStorage.setItem(
          mirrorKey,
          encodeMirror(storage.getItem(mirrorKey)),
        );
      }
    }

    await Promise.all(writes);
  }

  exportPersistent(this: TreeSelf): Record<string, unknown> {
    requireTree(this, "exportPersistent");
    const out: Record<string, unknown> = {};
    for (const key of ownKeysOf(this)) {
      if (key.definition.persistent === true) {
        const storage = getStorage();
        if (storage.hasItem(key.storageKey) === true) {
          out[key.storageKey] = storage.getItem(key.storageKey);
        }
      }
    }
    return out;
  }

  async importPersistent(
    this: TreeSelf,
    data: Record<string, unknown>,
  ): Promise<void> {
    requireTree(this, "importPersistent");
    const writes: Promise<void>[] = [];
    for (const [storageKey, value] of Object.entries(data)) {
      if (storageKey.startsWith(this.namespace) === false) continue;

      const key = (this as unknown as Record<string, unknown>)[
        storageKey.slice(this.namespace.length)
      ];
      if (key instanceof AspenKey === false) continue;
      if (key.definition.persistent === false) continue;

      writes.push(key.update(value));
    }
    await Promise.all(writes);
  }

  async pushPersistent(
    this: TreeSelf,
    urlOverride: string | null = null,
  ): Promise<void> {
    requireTree(this, "pushPersistent");
    const targetUrl = resolvePersistenceUrl(this.persistenceUrl, urlOverride);
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

  async pullPersistent(
    this: TreeSelf,
    urlOverride: string | null = null,
  ): Promise<boolean> {
    requireTree(this, "pullPersistent");
    const targetUrl = resolvePersistenceUrl(this.persistenceUrl, urlOverride);
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
}
