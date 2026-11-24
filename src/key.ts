import { deserializers, serializers } from "./seralize.ts";
import type { IndexedDBBackend } from "./storage.ts";
// biome-ignore format: preserve formatting -  because the bundler import striper is too dumb to handle multi line
import type {AspenType, KeyDef, KeyOptions, TypeFor, ValueOf} from "./types.ts";
import { validators } from "./validation.ts";

function orNull<Value>(value: Value | null = null): Value | null {
  return value;
}

interface Binding {
  name: string;
  storageKey: string;
  storage: IndexedDBBackend;
  ephemeralStore: Map<string, unknown>;
  onUpdate: readonly (() => void)[];
  validate: (value: unknown) => boolean;
  serialize: (value: unknown) => string;
  deserialize: (raw: string) => unknown;
}

interface KeyFactory {
  make<Type extends AspenType>(
    type: Type,
    initial: ValueOf<Type>,
    persistent?: boolean,
    allowed?: readonly ValueOf<Type>[],
    onUpdate?: readonly (() => void)[],
  ): AspenKey<ValueOf<Type>>;
}

export class AspenKey<Value = unknown> {
  readonly definition: KeyDef<Value>;
  private binding: Binding | null;
  private dynamicCallbacks: Map<number, (() => void)[]> = new Map<
    number,
    (() => void)[]
  >();

  constructor(options: KeyOptions<Value>) {
    this.definition = {
      type: options.type,
      persistent: options.persistent ?? true,
      default: options.default,
      bootMirror: orNull(options.bootMirror),
      allowed: orNull(options.allowed),
      aliases: orNull(options.aliases),
      onUpdate: orNull(options.onUpdate),
      serialize: orNull(options.serialize),
      deserialize: orNull(options.deserialize),
    };
    this.binding = null;
  }

  get storageKey(): string {
    return this.bound().storageKey;
  }

  get value(): Value {
    return this.read();
  }

  bind(
    name: string,
    namespace: string,
    storage: IndexedDBBackend,
    ephemeralStore: Map<string, unknown>,
  ): void {
    const definition = this.definition;

    const type = definition.type as AspenType;
    const validate = validators.get(type);
    const serializeForType = serializers.get(type);
    const deserializeForType = deserializers.get(type);
    if (
      validate === undefined ||
      serializeForType === undefined ||
      deserializeForType === undefined
    ) {
      throw new Error(
        `[Aspen] Unknown type for key "${name}" Valid types: String, Number, Boolean, Array, Object`,
      );
    }

    if (validate(definition.default) === false) {
      throw new Error(
        `[Aspen] Default value for "${name}" does not match declared type "${type.name}"`,
      );
    }

    if (
      definition.allowed !== null &&
      definition.allowed.includes(definition.default) === false
    ) {
      throw new Error(
        `[Aspen] Default value for "${name}" is not in the allowed list`,
      );
    }

    if (definition.bootMirror === true && definition.persistent === false) {
      throw new Error(
        `[Aspen] bootMirror on "${name}" requires persistent: true`,
      );
    }

    let onUpdate: readonly (() => void)[] = [];
    if (definition.onUpdate !== null) {
      const callbacks = definition.onUpdate as unknown;
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

    let serialize = serializeForType;
    if (definition.serialize !== null) {
      serialize = definition.serialize as (value: unknown) => string;
    }

    let deserialize = deserializeForType;
    if (definition.deserialize !== null) {
      deserialize = definition.deserialize;
    }

    this.binding = {
      name,
      storageKey: namespace + name,
      storage,
      ephemeralStore,
      onUpdate,
      validate,
      serialize,
      deserialize,
    };
  }

  read(): Value {
    const binding = this.bound();

    if (this.definition.persistent === true) {
      const raw = binding.storage.getItem(binding.storageKey);
      if (raw !== null) {
        return binding.deserialize(raw) as Value;
      }
      return this.definition.default;
    }

    if (binding.ephemeralStore.has(binding.name) === true) {
      return binding.ephemeralStore.get(binding.name) as Value;
    }
    return this.definition.default;
  }

  update(value: Value): Promise<void> {
    const binding = this.bound();

    if (binding.validate(value) === false) {
      throw new Error(
        `[Aspen] Type error on "${binding.name}": expected ${(this.definition.type as AspenType).name}, got ${typeof value}`,
      );
    }

    if (this.accepts(value) === false) {
      throw new Error(
        `[Aspen] Value ${JSON.stringify(value)} is not allowed for "${binding.name}". Allowed: ${JSON.stringify(this.definition.allowed)}`,
      );
    }

    let pending: Promise<void> = Promise.resolve();
    if (this.definition.persistent === true) {
      const raw = binding.serialize(value);
      if (this.definition.bootMirror === true) {
        localStorage.setItem(binding.storageKey, raw);
      }
      pending = binding.storage.setItem(binding.storageKey, raw);
    } else {
      binding.ephemeralStore.set(binding.name, value);
    }

    this.notify();
    return pending;
  }

  toggle(this: AspenKey<boolean>): Promise<void> {
    return this.update(this.read() === false);
  }

  listen(
    callback: unknown,
    syncWave: number | null = null,
  ): (() => void) & Disposable {
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

  notify(): void {
    for (const fn of this.bound().onUpdate) {
      fn();
    }
    for (const [, callbacks] of this.dynamicCallbacks) {
      for (const fn of [...callbacks]) {
        fn();
      }
    }
  }

  accepts(value: unknown): boolean {
    if (this.bound().validate(value) === false) return false;
    if (this.definition.allowed === null) return true;
    return (this.definition.allowed as readonly unknown[]).includes(value);
  }

  serialize(value: unknown): string {
    return this.bound().serialize(value);
  }

  deserialize(raw: string): unknown {
    return this.bound().deserialize(raw);
  }

  private bound(): Binding {
    if (this.binding === null) {
      throw new Error(
        "[Aspen] Key is not bound to a tree. Build the tree with create().",
      );
    }
    return this.binding;
  }
}

class KeyFactoryImpl implements KeyFactory {
  make<Type extends AspenType>(
    type: Type,
    initial: ValueOf<Type>,
    persistent: boolean = true,
    allowed: readonly ValueOf<Type>[] | null = null,
    onUpdate: readonly (() => void)[] | null = null,
  ): AspenKey<ValueOf<Type>> {
    return new AspenKey<ValueOf<Type>>({
      type: type as unknown as TypeFor<ValueOf<Type>>,
      persistent,
      default: initial,
      bootMirror: null,
      allowed,
      aliases: null,
      onUpdate,
      serialize: null,
      deserialize: null,
    });
  }
}

export const keys: KeyFactory = new KeyFactoryImpl();
