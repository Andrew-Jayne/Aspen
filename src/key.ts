import { encodeMirror, getStorage } from "./storage.ts";
// biome-ignore format: because the bundler import striper is too dumb to handle multi line
import type {KeyDef, KeyOptions,} from "./types.ts";
import { describeType, validatorFor } from "./validation.ts";

interface Binding {
  name: string;
  storageKey: string;
  ephemeralStore: Map<string, unknown>;
  onUpdate: readonly (() => void)[];
}

function isolate<ValueType>(value: ValueType): ValueType {
  if (typeof value === "object" && value !== null) {
    return structuredClone(value);
  }
  return value;
}

function requireKey(self: unknown, method: string): void {
  if (self instanceof AspenKey === false) {
    throw new Error(
      `[Aspen] ${method}() was called without its key as \`this\`. Call it as key.${method}(...) or wrap it in a function.`,
    );
  }
}

function orNull<ValueType>(value: ValueType | null = null): ValueType | null {
  return value;
}

export class AspenKey<ValueType = unknown> {
  readonly definition: KeyDef<ValueType>;
  private binding: Binding | null;
  private dynamicCallbacks: Map<number, (() => void)[]> = new Map<
    number,
    (() => void)[]
  >();

  constructor(
    declared: unknown extends ValueType
      ? "AspenKey requires a declared type: new AspenKey<YourType>({ ... })"
      : KeyOptions<ValueType>,
  ) {
    const options = declared as KeyOptions<ValueType>;
    let persistent = true;
    if (options.persistent === false) {
      persistent = false;
    }
    this.definition = {
      validate: validatorFor(options.default),
      persistent,
      default: options.default,
      bootMirror: orNull(options.bootMirror),
      allowed: orNull(options.allowed),
      aliases: orNull(options.aliases),
      onUpdate: orNull(options.onUpdate),
    };
    this.binding = null;
  }

  get storageKey(): string {
    return this.bound().storageKey;
  }

  bind(
    this: AspenKey<ValueType>,
    name: string,
    namespace: string,
    ephemeralStore: Map<string, unknown>,
  ): void {
    requireKey(this, "bind");
    const validate = this.definition.validate;

    if (this.definition.allowed !== null) {
      for (const entry of this.definition.allowed) {
        if (validate(entry) === false) {
          throw new Error(
            `[Aspen] Allowed value ${JSON.stringify(entry)} for "${name}" is not of the same type (${describeType(this.definition.default)}) as its default`,
          );
        }
      }
    }

    if (
      this.definition.allowed !== null &&
      this.definition.allowed.includes(this.definition.default) === false
    ) {
      throw new Error(
        `[Aspen] Default value for "${name}" is not in the allowed list`,
      );
    }

    if (
      this.definition.bootMirror === true &&
      this.definition.persistent === false
    ) {
      throw new Error(
        `[Aspen] bootMirror on "${name}" requires persistent: true`,
      );
    }

    let onUpdate: readonly (() => void)[] = [];
    if (this.definition.onUpdate !== null) {
      const callbacks = this.definition.onUpdate as unknown;
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
      ephemeralStore,
      onUpdate,
    };
  }

  get value(): ValueType {
    const binding = this.bound();

    if (this.definition.persistent === true) {
      if (getStorage().hasItem(binding.storageKey) === true) {
        return isolate(getStorage().getItem(binding.storageKey)) as ValueType;
      }
      return this.definition.default;
    }

    if (binding.ephemeralStore.has(binding.name) === true) {
      return binding.ephemeralStore.get(binding.name) as ValueType;
    }
    return this.definition.default;
  }

  update(this: AspenKey<ValueType>, value: ValueType): Promise<void> {
    requireKey(this, "update");
    const binding = this.bound();

    if (this.definition.validate(value) === false) {
      throw new Error(
        `[Aspen] Type error on "${binding.name}": expected ${describeType(this.definition.default)}, got ${describeType(value)}`,
      );
    }

    if (this.accepts(value) === false) {
      throw new Error(
        `[Aspen] ValueType ${JSON.stringify(value)} is not allowed for "${binding.name}". Allowed: ${JSON.stringify(this.definition.allowed)}`,
      );
    }

    let pending: Promise<void> = Promise.resolve();
    if (this.definition.persistent === true) {
      const stored = isolate(value);
      if (this.definition.bootMirror === true) {
        localStorage.setItem(binding.storageKey, encodeMirror(stored));
      }
      pending = getStorage().setItem(binding.storageKey, stored);
    } else {
      binding.ephemeralStore.set(binding.name, value);
    }

    this.notify();
    return pending;
  }

  toggle(this: AspenKey<boolean>): Promise<void> {
    requireKey(this, "toggle");
    if (typeof this.definition.default !== "boolean") {
      throw new Error(
        `[Aspen] toggle() requires a boolean key; "${this.storageKey}" is ${describeType(this.definition.default)}`,
      );
    }
    return this.update(this.value === false);
  }

  listen(
    this: AspenKey<ValueType>,
    callback: unknown,
    syncWave: number | null = null,
  ): (() => void) & Disposable {
    requireKey(this, "listen");
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

  notify(this: AspenKey<ValueType>): void {
    requireKey(this, "notify");
    for (const fn of this.bound().onUpdate) {
      fn();
    }
    for (const [, callbacks] of this.dynamicCallbacks) {
      for (const fn of [...callbacks]) {
        fn();
      }
    }
  }

  accepts(this: AspenKey<ValueType>, value: unknown): boolean {
    requireKey(this, "accepts");
    if (this.definition.validate(value) === false) return false;
    if (this.definition.allowed === null) return true;
    return (this.definition.allowed as readonly unknown[]).includes(value);
  }

  private bound(this: AspenKey<ValueType>): Binding {
    if (this.binding === null) {
      throw new Error(
        "[Aspen] Key is not bound to a tree. Build the tree with create().",
      );
    }
    return this.binding;
  }
}
