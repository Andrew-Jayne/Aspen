import { AspenKey } from "./key.ts";
import { IndexedDBBackend } from "./storage.ts";
import type { AspenType, Live, ValueOf } from "./types.ts";

const DATABASE_NAME = "aspen";

export abstract class StateTree {
  abstract readonly namespace: string;
  readonly persistenceUrl: string | null;
  readonly exec: Readonly<Record<string, AspenKey>> = {};

  private static storage: IndexedDBBackend | null = null;
  private readonly ephemeralStore: Map<string, unknown> = new Map();

  constructor(persistenceUrl: string | null) {
    this.persistenceUrl = persistenceUrl;
  }

  static async create<Tree extends StateTree>(
    this: new (
      persistenceUrl: string | null,
    ) => Tree,
    persistenceUrl: string | null,
  ): Promise<Live<Tree>> {
    if (StateTree.storage === null) {
      StateTree.storage = await IndexedDBBackend.open(DATABASE_NAME);
    }

    const tree = new this(persistenceUrl);
    const keyMap: Record<string, AspenKey> = {};

    for (const [name, field] of Object.entries(tree) as [string, unknown][]) {
      if (field instanceof AspenKey === false) continue;
      if (name in StateTree.prototype === true) {
        throw new Error(
          `[Aspen] Key name "${name}" collides with a StateTree method`,
        );
      }

      const key = field as AspenKey;
      key.bind(
        name,
        tree.namespace,
        StateTree.requireStorage(),
        tree.ephemeralStore,
      );
      keyMap[name] = key;
      Object.defineProperty(tree, name, {
        get: key.read.bind(key),
        enumerable: true,
        configurable: false,
      });
    }

    Object.defineProperty(tree, "exec", {
      value: Object.freeze(keyMap),
      enumerable: false,
      configurable: false,
      writable: false,
    });

    return tree as unknown as Live<Tree>;
  }

  private static requireStorage(): IndexedDBBackend {
    if (StateTree.storage === null) {
      throw new Error(
        "[Aspen] Storage is not open. Build the tree with create().",
      );
    }
    return StateTree.storage;
  }

  bootstrap(): void {
    for (const key of Object.values(this.exec)) {
      key.notify();
    }
  }

  async validateStorage(): Promise<void> {
    const storage = StateTree.requireStorage();
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

    for (const legacyKey of legacyKeys) {
      const raw = localStorage.getItem(legacyKey);
      if (raw !== null && storage.getItem(legacyKey) === null) {
        writes.push(storage.setItem(legacyKey, raw));
        console.info(
          `[Aspen] Moved "${legacyKey}" from localStorage to IndexedDB`,
        );
      }
    }

    for (const key of Object.values(this.exec)) {
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
      const oldValue = storage.getItem(oldKey);
      if (oldValue !== null) {
        if (storage.getItem(key.storageKey) === null) {
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

    for (const [name, key] of Object.entries(this.exec)) {
      if (key.definition.persistent === false) continue;

      const raw = storage.getItem(key.storageKey);
      if (raw === null) {
        writes.push(
          storage.setItem(
            key.storageKey,
            key.serialize(key.definition.default),
          ),
        );
        console.info(`[Aspen] Restored default for missing key: ${name}`);
        continue;
      }

      let intact = true;
      try {
        intact = key.accepts(key.deserialize(raw));
      } catch {
        intact = false;
      }

      if (intact === false) {
        console.warn(
          `[Aspen] Invalid stored value for "${name}"; resetting to default`,
        );
        writes.push(
          storage.setItem(
            key.storageKey,
            key.serialize(key.definition.default),
          ),
        );
      }
    }

    for (const legacyKey of legacyKeys) {
      if (mirrorKeys.has(legacyKey) === false) {
        localStorage.removeItem(legacyKey);
      }
    }
    for (const mirrorKey of mirrorKeys) {
      const raw = storage.getItem(mirrorKey);
      if (raw !== null) {
        localStorage.setItem(mirrorKey, raw);
      }
    }

    await Promise.all(writes);
  }

  exportPersistent(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of Object.values(this.exec)) {
      if (key.definition.persistent === true) {
        const raw = StateTree.requireStorage().getItem(key.storageKey);
        if (raw !== null) {
          out[key.storageKey] = raw;
        }
      }
    }
    return out;
  }

  async importPersistent(data: Record<string, string>): Promise<void> {
    const writes: Promise<void>[] = [];
    for (const [storageKey, raw] of Object.entries(data)) {
      if (storageKey.startsWith(this.namespace) === false) continue;

      const name = storageKey.slice(this.namespace.length);
      if (Object.hasOwn(this.exec, name) === false) continue;
      const key = this.exec[name] as AspenKey;
      if (key.definition.persistent === false) continue;

      writes.push(key.update(key.deserialize(raw) as ValueOf<AspenType>));
    }
    await Promise.all(writes);
  }

  async pushPersistent(urlOverride: string | null = null): Promise<void> {
    const targetUrl = this.resolvePersistenceUrl(urlOverride);
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

  async pullPersistent(urlOverride: string | null = null): Promise<boolean> {
    const targetUrl = this.resolvePersistenceUrl(urlOverride);
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

    const data = (await response.json()) as Record<string, string>;
    const malformedError = new Error(
      `[Aspen] Pull from "${targetUrl}" returned malformed state`,
    );
    if (typeof data !== "object") throw malformedError;
    if (data === null) throw malformedError;
    if (Array.isArray(data) === true) throw malformedError;

    await this.importPersistent(data);
    return true;
  }

  private resolvePersistenceUrl(urlOverride: string | null): string {
    let targetUrl: string | null = this.persistenceUrl;
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
