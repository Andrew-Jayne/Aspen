// ---- StateTree --------------------------------------------------------------

import { deserializers, serializers } from "./seralize.ts";
import type { StorageBackend } from "./storage.ts";
import type { AspenType, KeyDef, ResolvedKey, TypeMap } from "./types.ts";
import { validators } from "./validation.ts";

export class StateTree<const Schema extends Record<string, KeyDef>> {
  private readonly namespace: string;
  private readonly keys: Map<string, ResolvedKey>;
  private readonly memory: Map<string, unknown>;
  private readonly storage: StorageBackend;
  private readonly persistenceUrl: string | null;

  constructor(
    namespace: string,
    schema: Schema,
    storage: StorageBackend = localStorage,
    persistenceUrl: string | null = null,
  ) {
    this.namespace = namespace;
    this.keys = new Map();
    this.memory = new Map();
    this.storage = storage;
    this.persistenceUrl = persistenceUrl;

    const checkedKeys = new Set<string>();
    for (const [name, def] of Object.entries(schema)) {
      if (checkedKeys.has(name) === true) {
        throw new Error(`[Aspen] Duplicate key: "${name}"`);
      }
      checkedKeys.add(name);

      const type = def.type as AspenType;

      if (Object.hasOwn(validators, type) === false) {
        throw new Error(
          `[Aspen] Unknown type "${type}" for key "${name}". ` +
            `Valid types: ${Object.keys(validators).join(", ")}`,
        );
      }

      if (validators[type](def.default) === false) {
        throw new Error(
          `[Aspen] Default value for "${name}" does not match declared type "${type}"`,
        );
      }

      let allowed: unknown[] | null = null;
      if (Object.hasOwn(def, "allowed") === true) {
        allowed = def.allowed as unknown[];
      }
      if (allowed !== null && allowed.includes(def.default) === false) {
        throw new Error(
          `[Aspen] Default value for "${name}" is not in the allowed list`,
        );
      }

      let aliases: string[] | null = null;
      if (Object.hasOwn(def, "aliases") === true) {
        aliases = def.aliases as string[];
      }

      let onUpdate: (() => void)[] = [];
      if (Object.hasOwn(def, "onUpdate") === true) {
        onUpdate = def.onUpdate as (() => void)[];
      }

      let serialize = serializers[type];
      if (Object.hasOwn(def, "serialize") === true) {
        serialize = def.serialize as (value: unknown) => string;
      }

      let deserialize = deserializers[type];
      if (Object.hasOwn(def, "deserialize") === true) {
        deserialize = def.deserialize as (raw: string) => unknown;
      }

      this.keys.set(name, {
        storageKey: namespace + name,
        type,
        persistent: def.persistent,
        default: def.default,
        allowed,
        aliases,
        onUpdate,
        serialize,
        deserialize,
        validate: validators[type],
      });
    }
  }

  get<Key extends string & keyof Schema>(
    key: Key,
  ): TypeMap[Schema[Key]["type"]] {
    const config = this.resolve(key);

    if (config.persistent === true) {
      const raw = this.storage.getItem(config.storageKey);
      if (raw !== null) {
        return config.deserialize(raw) as TypeMap[Schema[Key]["type"]];
      }
      return config.default as TypeMap[Schema[Key]["type"]];
    }

    if (this.memory.has(key) === true) {
      return this.memory.get(key) as TypeMap[Schema[Key]["type"]];
    }
    return config.default as TypeMap[Schema[Key]["type"]];
  }

  set<Key extends string & keyof Schema>(
    key: Key,
    value: TypeMap[Schema[Key]["type"]],
  ): void {
    const config = this.resolve(key);

    if (config.validate(value) === false) {
      throw new Error(
        `[Aspen] Type error on "${key}": expected ${config.type}, got ${typeof value}`,
      );
    }

    if (config.allowed !== null) {
      if (config.allowed.includes(value) === false) {
        throw new Error(
          `[Aspen] Value ${JSON.stringify(value)} is not allowed for "${key}". ` +
            `Allowed: ${JSON.stringify(config.allowed)}`,
        );
      }
    }

    if (config.persistent === true) {
      this.storage.setItem(config.storageKey, config.serialize(value));
    } else {
      this.memory.set(key, value);
    }

    for (const fn of config.onUpdate) {
      fn();
    }
  }

  bootstrap(): void {
    for (const config of this.keys.values()) {
      for (const fn of config.onUpdate) {
        fn();
      }
    }
  }

  validateStorage(): void {
    const validStorageKeys = new Set<string>();
    const aliasMap = new Map<string, string>();

    for (const [name, config] of this.keys) {
      if (config.persistent === true) {
        validStorageKeys.add(config.storageKey);

        if (config.aliases !== null) {
          for (const alias of config.aliases) {
            aliasMap.set(alias, name);
          }
        }
      }
    }

    for (const [oldKey, currentName] of aliasMap) {
      const oldValue = this.storage.getItem(oldKey);
      if (oldValue !== null) {
        const config = this.lookupKey(currentName);
        if (config === null) continue;
        if (this.storage.getItem(config.storageKey) === null) {
          this.storage.setItem(config.storageKey, oldValue);
          console.info(`[Aspen] Migrated "${oldKey}" → "${config.storageKey}"`);
        }
        this.storage.removeItem(oldKey);
        validStorageKeys.add(oldKey);
      }
    }

    const orphaned: string[] = [];
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index);
      if (
        key !== null &&
        key.startsWith(this.namespace) === true &&
        validStorageKeys.has(key) === false
      ) {
        orphaned.push(key);
      }
    }

    for (const key of orphaned) {
      console.warn(`[Aspen] Removing orphaned key: ${key}`);
      this.storage.removeItem(key);
    }

    for (const [name, config] of this.keys) {
      if (config.persistent === false) continue;

      const raw = this.storage.getItem(config.storageKey);
      if (raw === null) {
        this.storage.setItem(
          config.storageKey,
          config.serialize(config.default),
        );
        console.info(`[Aspen] Restored default for missing key: ${name}`);
        continue;
      }

      let value: unknown;
      let intact = true;
      try {
        value = config.deserialize(raw);
      } catch {
        intact = false;
      }
      if (intact === true && config.validate(value) === false) {
        intact = false;
      }
      if (
        intact === true &&
        config.allowed !== null &&
        config.allowed.includes(value) === false
      ) {
        intact = false;
      }

      if (intact === false) {
        console.warn(
          `[Aspen] Invalid stored value for "${name}"; resetting to default`,
        );
        this.storage.setItem(
          config.storageKey,
          config.serialize(config.default),
        );
      }
    }
  }

  exportPersistent(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const config of this.keys.values()) {
      if (config.persistent === true) {
        const raw = this.storage.getItem(config.storageKey);
        if (raw !== null) {
          out[config.storageKey] = raw;
        }
      }
    }
    return out;
  }

  importPersistent(data: Record<string, string>): void {
    for (const [storageKey, raw] of Object.entries(data)) {
      if (storageKey.startsWith(this.namespace) === false) continue;

      const name = storageKey.slice(this.namespace.length);
      const config = this.lookupKey(name);
      if (config === null) continue;
      if (config.persistent === false) continue;

      this.set(
        name as string & keyof Schema,
        config.deserialize(raw) as TypeMap[Schema[keyof Schema]["type"]],
      );
    }
  }

  /**
   * PUTs `exportPersistent()` as JSON to the persistence URL. Pass a URL to
   * override the one from the constructor options.
   */
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

  /**
   * GETs JSON state from the persistence URL and feeds it through
   * `importPersistent()`. Returns false when the server has no saved state
   * (HTTP 404); returns true when state was imported.
   */
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

    this.importPersistent(data);
    return true;
  }

  private resolvePersistenceUrl(urlOverride: string | null): string {
    let targetUrl: string | null = this.persistenceUrl;
    if (urlOverride !== null) {
      targetUrl = urlOverride;
    }
    if (targetUrl === null) {
      throw new Error(
        "[Aspen] No persistence URL configured. Pass one in the constructor " +
          "options or as an argument.",
      );
    }
    return targetUrl;
  }

  private lookupKey(name: string): ResolvedKey | null {
    if (this.keys.has(name) === true) {
      return this.keys.get(name) as ResolvedKey;
    }
    return null;
  }

  private resolve(key: string): ResolvedKey {
    const config = this.lookupKey(key);
    if (config === null) {
      throw new Error(`[Aspen] Key not registered: "${key}"`);
    }
    return config;
  }
}
