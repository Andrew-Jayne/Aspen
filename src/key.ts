import type { IndexedDBBackend } from "./storage.ts";

type StorableType =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ArrayConstructor
  | ObjectConstructor;

interface Binding {
  name: string;
  storageKey: string;
  storage: IndexedDBBackend;
  ephemeralStore: Map<string, unknown>;
  onUpdate: readonly (() => void)[];
}

interface KeyOptions<ValueType> {
  persistent?: boolean | null;
  default: NoInfer<ValueType>;
  bootMirror?: boolean | null;
  allowed?: readonly NoInfer<ValueType>[] | null;
  aliases?: readonly string[] | null;
  onUpdate?: readonly (() => void)[] | null;
}

class AspenKey<ValueType = unknown> {
  private readonly type: StorableType;
  private readonly persistent: boolean;
  private readonly default: ValueType;
  private readonly bootMirror: boolean;
  private readonly allowed: readonly ValueType[] | null;
  private readonly aliases: readonly string[] | null;
  private readonly onUpdate: readonly (() => void)[] | null;
  private binding: Binding | null;
  private dynamicCallbacks: Map<number, (() => void)[]> = new Map<number, (() => void)[]>(); //WTF Is this type

  private constructor(type: StorableType, options: KeyOptions<ValueType>) {
    if (options.persistent === false) {
      this.persistent = false;
    } else {
      this.persistent = true;
    }

    this.type = type;
    AspenKey.checkType(options.default, type, "key default");
    this.default = options.default;

    if (options.bootMirror === true) {
      this.bootMirror = true;
    } else {
      this.bootMirror = false;
    }

    if (options.allowed === undefined || options.allowed === null) {
      this.allowed = null;
    } else {
      this.allowed = options.allowed;
    }

    if (options.aliases === undefined || options.aliases === null) {
      this.aliases = null;
    } else {
      this.aliases = options.aliases;
    }

    if (options.onUpdate === undefined || options.onUpdate === null) {
      this.onUpdate = null;
    } else {
      this.onUpdate = options.onUpdate;
    }

    this.binding = null;
  }

  // Getters

  public get storageKey(): string {
    return this.bound().storageKey;
  }

  public get value(): ValueType {
    const binding = this.bound();

    if (this.persistent === true) {
      if (binding.storage.hasItem(binding.storageKey) === false) {
        throw new Error(
          `[Aspen] "${binding.name}" is missing from storage. create() seeds every persistent key; something removed it afterwards.`,
        );
      }
      return AspenKey.isolate(binding.storage.getItem(binding.storageKey)) as ValueType;
    }

    return binding.ephemeralStore.get(binding.name) as ValueType;
  }

  // Public methods

  public bind(
    this: AspenKey<ValueType>,
    name: string,
    namespace: string,
    storage: IndexedDBBackend,
    ephemeralStore: Map<string, unknown>,
  ): void {
    AspenKey.requireKey(this, "bind");

    if (this.allowed !== null) {
      for (const entry of this.allowed) {
        AspenKey.checkType(
          entry,
          this.type,
          `allowed value ${JSON.stringify(entry)} for "${name}"`,
        );
      }
    }

    if (
      this.allowed !== null &&
      this.allowed.includes(this.default) === false
    ) {
      throw new Error(
        `[Aspen] Default value for "${name}" is not in the allowed list`,
      );
    }

    if (this.bootMirror === true && this.persistent === false) {
      throw new Error(
        `[Aspen] bootMirror on "${name}" requires persistent: true`,
      );
    }

    let onUpdate: readonly (() => void)[] = [];
    if (this.onUpdate !== null) {
      const callbacks = this.onUpdate as unknown;
      if (Array.isArray(callbacks) === false) {
        throw new Error(
          `[Aspen] onUpdate for "${name}" must be an array of functions`,
        );
      }
      const seen = new Set<unknown>();
      for (const callback of callbacks as unknown[]) {
        if (typeof callback !== "function") {
          throw new Error(
            `[Aspen] onUpdate for "${name}" contains a non-function. Pass render functions by reference (renderTheme), not their result (renderTheme()).`,
          );
        }
        if (callback.name === "") {
          throw new Error(
            `[Aspen] onUpdate for "${name}" contains an anonymous function. Declare a named render function and reference it by name.`,
          );
        }
        if (callback.length > 0) {
          throw new Error(
            `[Aspen] onUpdate function "${callback.name}" for "${name} declares parameters. Render functions take no arguments and read state via tree properties.`,
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

    this.binding = {
      name,
      storageKey: namespace + name,
      storage,
      ephemeralStore,
      onUpdate,
    };

    if (this.persistent === false) {
      ephemeralStore.set(name, AspenKey.isolate(this.default));
    }
  }

  public update(this: AspenKey<ValueType>, value: ValueType): Promise<void> {
    AspenKey.requireKey(this, "update");
    const binding = this.bound();

    AspenKey.checkType(value, this.type, `"${binding.name}"`);

    if (this.accepts(value) === false) {
      throw new Error(
        `[Aspen] ValueType ${JSON.stringify(value)} is not allowed for "${binding.name}". Allowed: ${JSON.stringify(this.allowed)}`,
      );
    }

    let pending: Promise<void> = Promise.resolve();
    if (this.persistent === true) {
      const stored = AspenKey.isolate(value);
      if (this.bootMirror === true) {
        localStorage.setItem(
          binding.storageKey,
          AspenKey.encodeMirror(stored),
        );
      }
      pending = binding.storage.setItem(binding.storageKey, stored);
    } else {
      binding.ephemeralStore.set(binding.name, value);
    }

    this.notify();
    return pending;
  }

  public toggle(this: AspenKey<boolean>): Promise<void> {
    AspenKey.requireKey(this, "toggle");
    if (this.type !== Boolean) {
      throw new Error(
        `[Aspen] toggle() on "${this.storageKey}" requires a Boolean key, got ${this.type.name}`,
      );
    }
    return this.update(this.value === false);
  }

  public listen(
    this: AspenKey<ValueType>,
    callback: unknown,
    syncWave: number | null = null,
  ): (() => void) & Disposable {
    AspenKey.requireKey(this, "listen");
    let resolvedWave = 0;
    if (syncWave !== null) {
      resolvedWave = syncWave;
    }
    if (typeof callback !== "function") {
      throw new Error("[Aspen] listen callback must be a named function.");
    }
    const func = callback as (...args: unknown[]) => unknown;
    if (func.name === "") {
      throw new Error("[Aspen] listen callback must be a named function.");
    }
    if (func.length > 0) {
      throw new Error(
        `[Aspen] listen callback "${func.name}" declares parameters. Render functions take no arguments and read state via tree properties.`,
      );
    }
    if (
      Number.isInteger(resolvedWave) === false ||
      resolvedWave < 0 ||
      resolvedWave > 255
    ) {
      throw new Error(`[Aspen] syncWave must be 0-255, got ${resolvedWave}`);
    }
    const typed = callback as () => void;
    const existing = this.dynamicCallbacks.get(resolvedWave);
    if (existing !== undefined) {
      existing.push(typed);
    } else {
      const sorted = new Map<number, (() => void)[]>();
      for (const waveIndex of [
        ...this.dynamicCallbacks.keys(),
        resolvedWave,
      ].sort((waveA, waveB) => waveA - waveB)) {
        if (waveIndex === resolvedWave) {
          sorted.set(waveIndex, [typed]);
        } else {
          sorted.set(
            waveIndex,
            this.dynamicCallbacks.get(waveIndex) as (() => void)[],
          );
        }
      }
      this.dynamicCallbacks = sorted;
    }
    const unlisten = (): void => {
      const list = this.dynamicCallbacks.get(resolvedWave);
      if (list === undefined) return;
      const idx = list.indexOf(typed);
      if (idx !== -1) list.splice(idx, 1);
    };
    unlisten[Symbol.dispose] = unlisten;
    return unlisten;
  }

  public notify(this: AspenKey<ValueType>): void {
    AspenKey.requireKey(this, "notify");
    for (const fn of this.bound().onUpdate) {
      fn();
    }
    for (const [, callbacks] of this.dynamicCallbacks) {
      for (const fn of [...callbacks]) {
        fn();
      }
    }
  }

  public accepts(this: AspenKey<ValueType>, value: unknown): boolean {
    AspenKey.requireKey(this, "accepts");
    if (AspenKey.checkType(value, this.type) === false) return false;
    if (this.allowed === null) return true;
    return (this.allowed as readonly unknown[]).includes(value);
  }

  public async prepareStorage(this: AspenKey<ValueType>): Promise<void> {
    AspenKey.requireKey(this, "prepareStorage");
    const binding = this.bound();
    const storage = binding.storage;
    const storageKey = binding.storageKey;
    const writes: Promise<void>[] = [];

    if (this.persistent === false) {
      if (storage.hasItem(storageKey) === true) {
        writes.push(storage.removeItem(storageKey));
      }
      localStorage.removeItem(storageKey);
      await Promise.all(writes);
      return;
    }

    if (this.aliases !== null) {
      for (const alias of this.aliases) {
        if (storage.hasItem(alias) === false) continue;
        if (storage.hasItem(storageKey) === false) {
          writes.push(storage.setItem(storageKey, storage.getItem(alias)));
          console.info(`[Aspen] Migrated "${alias}" → "${storageKey}"`);
        }
        writes.push(storage.removeItem(alias));
      }
    }

    if (storage.hasItem(storageKey) === false) {
      writes.push(storage.setItem(storageKey, AspenKey.isolate(this.default)));
      console.info(`[Aspen] Restored default for missing key: ${binding.name}`);
    } else if (this.accepts(storage.getItem(storageKey)) === false) {
      console.warn(
        `[Aspen] Invalid stored value for "${binding.name}"; resetting to default`,
      );
      writes.push(storage.setItem(storageKey, AspenKey.isolate(this.default)));
    }

    if (this.bootMirror === true) {
      localStorage.setItem(
        storageKey,
        AspenKey.encodeMirror(storage.getItem(storageKey)),
      );
    } else {
      localStorage.removeItem(storageKey);
    }

    await Promise.all(writes);
  }

  // Public static methods

  public static boolean<ValueType extends boolean = boolean>(
    options: KeyOptions<ValueType>,
  ): AspenKey<ValueType> {
    return new AspenKey<ValueType>(Boolean, options);
  }

  public static string<ValueType extends string = string>(
    options: KeyOptions<ValueType>,
  ): AspenKey<ValueType> {
    return new AspenKey<ValueType>(String, options);
  }

  public static number<ValueType extends number = number>(
    options: KeyOptions<ValueType>,
  ): AspenKey<ValueType> {
    return new AspenKey<ValueType>(Number, options);
  }

  public static array<ValueType extends readonly unknown[]>(
    options: readonly unknown[] extends ValueType
      ? "AspenKey.array requires a declared type: AspenKey.array<YourType>({ ... })"
      : KeyOptions<ValueType>,
  ): AspenKey<ValueType> {
    return new AspenKey<ValueType>(Array, options as KeyOptions<ValueType>);
  }

  public static object<ValueType extends object>(
    options: object extends ValueType
      ? "AspenKey.object requires a declared type: AspenKey.object<YourType>({ ... })"
      : KeyOptions<ValueType>,
  ): AspenKey<ValueType> {
    return new AspenKey<ValueType>(Object, options as KeyOptions<ValueType>);
  }

  // Private methods

  private bound(this: AspenKey<ValueType>): Binding {
    if (this.binding === null) {
      throw new Error(
        "[Aspen] Key is not bound to a tree. Build the tree with create().",
      );
    }
    return this.binding;
  }

  // Private static methods

  private static checkType(
    value: unknown,
    expected: StorableType,
    context: string | null = null,
  ): boolean {
    let gotName: string;
    if (value === null || value === undefined || Number.isNaN(value) === true) {
      gotName = String(value);
    } else {
      const valueConstructor = Object(value).constructor;
      if (valueConstructor === expected) return true;
      if (valueConstructor === undefined) {
        gotName = "null-prototype object";
      } else {
        gotName = valueConstructor.name;
      }
    }
    if (context === null) return false;
    throw new Error(
      `[Aspen] Type error on ${context}: expected ${expected.name}, got ${gotName}`,
    );
  }

  private static requireKey(self: unknown, method: string): void {
    if (self instanceof AspenKey === false) {
      throw new Error(
        `[Aspen] ${method}() was called without its key as \`this\`. Call it as key.${method}(...) or wrap it in a function.`,
      );
    }
  }

  private static isolate<ValueType>(value: ValueType): ValueType {
    if (typeof value === "object" && value !== null) {
      return structuredClone(value);
    }
    return value;
  }

  private static encodeMirror(value: unknown): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }}

export type { KeyOptions };
export { AspenKey };
