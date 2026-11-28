import { IndexedDBBackend } from "./storage.ts";

type StorableType =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ArrayConstructor
  | ObjectConstructor;

interface Binding {
  name: string;
  storageKey: string;
  ephemeralStore: Map<string, unknown>;
  onUpdate: readonly (() => void)[];
}

interface StateLeafOptions<ValueType> {
  persistent?: boolean | null;
  default: NoInfer<ValueType>;
  bootMirror?: boolean | null;
  allowed?: readonly NoInfer<ValueType>[] | null;
  aliases?: readonly string[] | null;
  onUpdate?: readonly (() => void)[] | null;
}

class StateLeaf<ValueType = unknown> {
  private readonly type: StorableType;
  private readonly persistent: boolean;
  private readonly default: ValueType;
  private readonly bootMirror: boolean;
  private readonly allowed: readonly ValueType[] | null;
  private readonly aliases: readonly string[] | null;
  private readonly onUpdate: readonly (() => void)[] | null;
  private binding: Binding | null;
  // Listeners added with listen(), keyed by sync wave and kept in ascending
  // wave order so notify() can walk the map front to back.
  private dynamicCallbacks: Map<number, (() => void)[]> = new Map<
    number,
    (() => void)[]
  >();

  private constructor(
    type: StorableType,
    options: StateLeafOptions<ValueType>,
  ) {
    if (options.persistent === false) {
      this.persistent = false;
    } else {
      this.persistent = true;
    }

    this.type = type;
    StateLeaf.checkType(options.default, type, "leaf default");
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

  /**
   * Persistent values come back frozen: storage shares one copy with every
   * reader. Ephemeral values are the exact reference last passed to update(),
   * so they can hold things storage can't clone (promises, files).
   */
  public get value(): ValueType {
    const binding = this.bound();

    if (this.persistent === true) {
      if (IndexedDBBackend.gateway.hasItem(binding.storageKey) === false) {
        throw new Error(
          `[Aspen] "${binding.name}" is missing from storage. create() seeds every persistent leaf; something removed it afterwards.`,
        );
      }
      return IndexedDBBackend.gateway.getItem(binding.storageKey) as ValueType;
    }

    return binding.ephemeralStore.get(binding.name) as ValueType;
  }

  // Public methods

  public bind(
    this: StateLeaf<ValueType>,
    name: string,
    namespace: string,
    ephemeralStore: Map<string, unknown>,
  ): void {
    StateLeaf.requireLeaf(this, "bind");

    if (this.binding !== null) {
      throw new Error(
        `[Aspen] Leaf "${name}" is already bound as "${this.binding.storageKey}". Give each tree its own leaves.`,
      );
    }

    if (this.allowed !== null) {
      for (const entry of this.allowed) {
        StateLeaf.checkType(
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
            `[Aspen] onUpdate function "${callback.name}" for "${name}" declares parameters. Render functions take no arguments and read state via tree properties.`,
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
      ephemeralStore,
      onUpdate,
    };

    if (this.persistent === false) {
      let seeded: unknown = this.default;
      if (typeof seeded === "object" && seeded !== null) {
        seeded = structuredClone(seeded);
      }
      ephemeralStore.set(name, seeded);
    }
  }

  public update(this: StateLeaf<ValueType>, value: ValueType): Promise<void> {
    StateLeaf.requireLeaf(this, "update");
    const binding = this.bound();

    StateLeaf.checkType(value, this.type, `"${binding.name}"`);

    if (this.accepts(value) === false) {
      throw new Error(
        `[Aspen] Value ${JSON.stringify(value)} is not allowed for "${binding.name}". Allowed: ${JSON.stringify(this.allowed)}`,
      );
    }

    let pending: Promise<void> = Promise.resolve();
    if (this.persistent === true) {
      pending = IndexedDBBackend.gateway.setItem(binding.storageKey, value);
      if (this.bootMirror === true) {
        // Mirror only what reached IndexedDB, so a failed write can't leave
        // first paint showing a value the store never kept.
        const mirror = StateLeaf.encodeMirror(value);
        pending = pending.then(() => {
          localStorage.setItem(binding.storageKey, mirror);
        });
      }
    } else {
      binding.ephemeralStore.set(binding.name, value);
    }

    this.notify();
    return pending;
  }

  public toggle(this: StateLeaf<boolean>): Promise<void> {
    StateLeaf.requireLeaf(this, "toggle");
    if (this.type !== Boolean) {
      throw new Error(
        `[Aspen] toggle() on "${this.storageKey}" requires a Boolean leaf, got ${this.type.name}`,
      );
    }
    return this.update(this.value === false);
  }

  public listen(
    this: StateLeaf<ValueType>,
    callback: () => void,
    syncWave: number | null = null,
  ): (() => void) & Disposable {
    StateLeaf.requireLeaf(this, "listen");
    let resolvedWave = 0;
    if (syncWave !== null) {
      resolvedWave = syncWave;
    }
    if (typeof callback !== "function") {
      throw new Error("[Aspen] listen callback must be a named function.");
    }
    if (callback.name === "") {
      throw new Error("[Aspen] listen callback must be a named function.");
    }
    if (callback.length > 0) {
      throw new Error(
        `[Aspen] listen callback "${callback.name}" declares parameters. Render functions take no arguments and read state via tree properties.`,
      );
    }
    if (
      Number.isInteger(resolvedWave) === false ||
      resolvedWave < 0 ||
      resolvedWave > 255
    ) {
      throw new Error(`[Aspen] syncWave must be 0-255, got ${resolvedWave}`);
    }
    const existing = this.dynamicCallbacks.get(resolvedWave);
    if (existing !== undefined) {
      existing.push(callback);
    } else {
      const sorted = new Map<number, (() => void)[]>();
      for (const waveIndex of [
        ...this.dynamicCallbacks.keys(),
        resolvedWave,
      ].sort((waveA, waveB) => waveA - waveB)) {
        if (waveIndex === resolvedWave) {
          sorted.set(waveIndex, [callback]);
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
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    };
    unlisten[Symbol.dispose] = unlisten;
    return unlisten;
  }

  public notify(this: StateLeaf<ValueType>): void {
    StateLeaf.requireLeaf(this, "notify");
    for (const fn of this.bound().onUpdate) {
      fn();
    }
    for (const [, callbacks] of this.dynamicCallbacks) {
      for (const fn of [...callbacks]) {
        fn();
      }
    }
  }

  public accepts(this: StateLeaf<ValueType>, value: unknown): boolean {
    StateLeaf.requireLeaf(this, "accepts");
    if (StateLeaf.checkType(value, this.type) === false) return false;
    if (this.allowed === null) return true;
    return (this.allowed as readonly unknown[]).includes(value);
  }

  public async prepareStorage(this: StateLeaf<ValueType>): Promise<void> {
    StateLeaf.requireLeaf(this, "prepareStorage");
    const binding = this.bound();
    const storage = IndexedDBBackend.gateway;
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
        localStorage.removeItem(alias);
      }
    }

    if (storage.hasItem(storageKey) === false) {
      writes.push(storage.setItem(storageKey, this.default));
      console.info(
        `[Aspen] Restored default for missing leaf: ${binding.name}`,
      );
    } else if (this.accepts(storage.getItem(storageKey)) === false) {
      console.warn(
        `[Aspen] Invalid stored value for "${binding.name}"; resetting to default`,
      );
      writes.push(storage.setItem(storageKey, this.default));
    }

    await Promise.all(writes);

    if (this.bootMirror === true) {
      localStorage.setItem(
        storageKey,
        StateLeaf.encodeMirror(storage.getItem(storageKey)),
      );
    } else {
      localStorage.removeItem(storageKey);
    }
  }

  // Public static methods

  public static boolean<ValueType extends boolean = boolean>(
    options: StateLeafOptions<ValueType>,
  ): StateLeaf<ValueType> {
    return new StateLeaf<ValueType>(Boolean, options);
  }

  public static string<ValueType extends string = string>(
    options: StateLeafOptions<ValueType>,
  ): StateLeaf<ValueType> {
    return new StateLeaf<ValueType>(String, options);
  }

  public static number<ValueType extends number = number>(
    options: StateLeafOptions<ValueType>,
  ): StateLeaf<ValueType> {
    return new StateLeaf<ValueType>(Number, options);
  }

  public static array<ValueType extends readonly unknown[]>(
    options: readonly unknown[] extends ValueType
      ? "StateLeaf.array requires a declared type: StateLeaf.array<YourType>({ ... })"
      : StateLeafOptions<ValueType>,
  ): StateLeaf<ValueType> {
    return new StateLeaf<ValueType>(
      Array,
      options as StateLeafOptions<ValueType>,
    );
  }

  public static object<ValueType extends object>(
    options: object extends ValueType
      ? "StateLeaf.object requires a declared type: StateLeaf.object<YourType>({ ... })"
      : StateLeafOptions<ValueType>,
  ): StateLeaf<ValueType> {
    return new StateLeaf<ValueType>(
      Object,
      options as StateLeafOptions<ValueType>,
    );
  }

  // Private methods

  private bound(this: StateLeaf<ValueType>): Binding {
    if (this.binding === null) {
      throw new Error(
        "[Aspen] Leaf is not bound to a tree. Build the tree with create().",
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

  private static requireLeaf(self: unknown, method: string): void {
    if (self instanceof StateLeaf === false) {
      throw new Error(
        `[Aspen] ${method}() was called without its leaf as \`this\`. Call it as leaf.${method}(...) or wrap it in a function.`,
      );
    }
  }

  private static encodeMirror(value: unknown): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }
}

export type { StateLeafOptions };
export { StateLeaf };
