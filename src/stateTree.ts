// ---- StateTree --------------------------------------------------------------

import { deserializers, serializers } from "./seralize.ts";
import type { StorageBackend } from "./storage.ts";
import type {
  AspenType,
  KeyDef,
  KeyNames,
  ResolvedKey,
  TypeMap,
} from "./types.ts";
import { validators } from "./validation.ts";

export class StateTree<const Schema extends Record<string, KeyDef>> {
  /**
   * Every schema key name, mapped to itself and frozen. Use it in place of
   * string literals: `State.get(State.keys.theme)`. A typo is a compile error
   * in TypeScript and an `undefined` key (which `get`/`set` reject) in JS.
   */
  readonly keys: KeyNames<Schema>;

  private readonly namespace: string;
  private readonly registry: Map<string, ResolvedKey>;
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
    this.registry = new Map();
    this.memory = new Map();
    this.storage = storage;
    this.persistenceUrl = persistenceUrl;

    const checkedKeys = new Set<string>();
    const keyNames: Record<string, string> = {};
    for (const [name, def] of Object.entries(schema)) {
      if (checkedKeys.has(name) === true) {
        throw new Error(`[Aspen] Duplicate key: "${name}"`);
      }
      checkedKeys.add(name);
      keyNames[name] = name;

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

      let onUpdate: readonly (() => void)[] = [];
      if (Object.hasOwn(def, "onUpdate") === true) {
        const callbacks = def.onUpdate as unknown;
        if (Array.isArray(callbacks) === false) {
          throw new Error(
            `[Aspen] onUpdate for "${name}" must be an array of functions`,
          );
        }
        const seen = new Set<unknown>();
        for (const callback of callbacks as unknown[]) {
          if (typeof callback !== "function") {
            throw new Error(
              `[Aspen] onUpdate for "${name}" contains a non-function. ` +
                "Pass render functions by reference (renderTheme), " +
                "not their result (renderTheme()).",
            );
          }
          if (callback.name === "") {
            throw new Error(
              `[Aspen] onUpdate for "${name}" contains an anonymous function. ` +
                "Declare a named render function and reference it by name.",
            );
          }
          if (callback.length > 0) {
            throw new Error(
              `[Aspen] onUpdate function "${callback.name}" for "${name}" ` +
                "declares parameters. Render functions take no arguments " +
                "and read state via get().",
            );
          }
          if (seen.has(callback) === true) {
            throw new Error(
              `[Aspen] onUpdate for "${name}" lists "${callback.name}" more than once`,
            );
          }
          seen.add(callback);
        }
        onUpdate = Object.freeze([...callbacks]) as readonly (() => void)[];
      }

      let serialize = serializers[type];
      if (Object.hasOwn(def, "serialize") === true) {
        serialize = def.serialize as (value: unknown) => string;
      }

      let deserialize = deserializers[type];
      if (Object.hasOwn(def, "deserialize") === true) {
        deserialize = def.deserialize as (raw: string) => unknown;
      }

      this.registry.set(name, {
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
    this.keys = Object.freeze(keyNames) as KeyNames<Schema>;
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
    for (const config of this.registry.values()) {
      for (const fn of config.onUpdate) {
        fn();
      }
    }
  }

  validateStorage(): void {
    const validStorageKeys = new Set<string>();
    const aliasMap = new Map<string, string>();

    for (const [name, config] of this.registry) {
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

    for (const [name, config] of this.registry) {
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
    for (const config of this.registry.values()) {
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
    if (this.registry.has(name) === true) {
      return this.registry.get(name) as ResolvedKey;
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
