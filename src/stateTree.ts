// ---- StateTree --------------------------------------------------------------

import { deserializers, serializers } from "./seralize.ts";
import type { StorageBackend } from "./storage.ts";
import { detectStorage } from "./storage.ts";
import type { AspenType, KeyDef, ResolvedKey, TypeMap } from "./types.ts";
import { validators } from "./validation.ts";

export class StateTree<const Schema extends Record<string, KeyDef>> {
  private readonly namespace: string;
  private readonly keys: Map<string, ResolvedKey>;
  private readonly memory: Map<string, unknown>;
  private readonly storage: StorageBackend | null;

  constructor(namespace: string, schema: Schema) {
    this.namespace = namespace;
    this.keys = new Map();
    this.memory = new Map();
    this.storage = detectStorage();

    const seen = new Set<string>();
    for (const [name, def] of Object.entries(schema)) {
      if (seen.has(name) === true) {
        throw new Error(`[Aspen] Duplicate key: "${name}"`);
      }
      seen.add(name);

      const type = def.type as AspenType;

      if (validators[type] === undefined) {
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

      if (
        def.allowed !== undefined &&
        def.allowed.includes(def.default) === false
      ) {
        throw new Error(
          `[Aspen] Default value for "${name}" is not in the allowed list`,
        );
      }

      this.keys.set(name, {
        storageKey: namespace + name,
        type,
        persistent: def.persistent,
        default: def.default,
        allowed: def.allowed,
        aliases: def.aliases,
        onUpdate: def.onUpdate ?? [],
        serialize: def.serialize ?? serializers[type],
        deserialize: def.deserialize ?? deserializers[type],
        validate: validators[type],
      });
    }
  }

  get<Key extends string & keyof Schema>(
    key: Key,
  ): TypeMap[Schema[Key]["type"]] {
    const config = this.resolve(key);

    if (config.persistent === true) {
      if (this.storage !== null) {
        const raw = this.storage.getItem(config.storageKey);
        if (raw !== null) {
          return config.deserialize(raw) as TypeMap[Schema[Key]["type"]];
        }
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

    if (config.allowed !== undefined) {
      if (config.allowed.includes(value) === false) {
        throw new Error(
          `[Aspen] Value ${JSON.stringify(value)} is not allowed for "${key}". ` +
            `Allowed: ${JSON.stringify(config.allowed)}`,
        );
      }
    }

    if (config.persistent === true) {
      if (this.storage !== null) {
        this.storage.setItem(config.storageKey, config.serialize(value));
      }
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
    if (this.storage === null) return;

    const validStorageKeys = new Set<string>();
    const aliasMap = new Map<string, string>();

    for (const [name, config] of this.keys) {
      if (config.persistent === true) {
        validStorageKeys.add(config.storageKey);

        if (config.aliases !== undefined) {
          for (const alias of config.aliases) {
            aliasMap.set(alias, name);
          }
        }
      }
    }

    for (const [oldKey, currentName] of aliasMap) {
      const oldValue = this.storage.getItem(oldKey);
      if (oldValue !== null) {
        const config = this.keys.get(currentName);
        if (config === undefined) continue;
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
      if (
        config.persistent === true &&
        this.storage.getItem(config.storageKey) === null
      ) {
        console.info(`[Aspen] Using default for: ${name}`);
      }
    }
  }

  exportPersistent(): Record<string, string> {
    const out: Record<string, string> = {};
    if (this.storage === null) return out;

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
      const config = this.keys.get(name);
      if (config === undefined || config.persistent === false) continue;

      this.set(
        name as string & keyof Schema,
        config.deserialize(raw) as TypeMap[Schema[keyof Schema]["type"]],
      );
    }
  }

  private resolve(key: string): ResolvedKey {
    const config = this.keys.get(key);
    if (config === undefined) {
      throw new Error(`[Aspen] Key not registered: "${key}"`);
    }
    return config;
  }
}
