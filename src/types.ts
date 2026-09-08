// ---- Public Types -----------------------------------------------------------

export type TypeMap = {
  string: string;
  number: number;
  boolean: boolean;
  list: unknown[];
  dict: Record<string, unknown>;
  json: unknown;
};

export type AspenType = keyof TypeMap;

/**
 * Enum-style map of a schema's key names to themselves, exposed as
 * `StateTree.keys` so call sites can write `State.get(State.keys.theme)`
 * instead of repeating the string `"theme"`.
 */
export type KeyNames<Schema> = {
  readonly [Key in string & keyof Schema]: Key;
};

export interface KeyDef {
  type: AspenType;
  persistent: boolean;
  default: unknown;
  allowed?: unknown[];
  aliases?: string[];
  onUpdate?: readonly (() => void)[];
  serialize?: (value: unknown) => string;
  deserialize?: (raw: string) => unknown;
}

// ---- Internal Types ---------------------------------------------------------

export interface ResolvedKey {
  storageKey: string;
  type: AspenType;
  persistent: boolean;
  default: unknown;
  allowed: unknown[] | null;
  aliases: string[] | null;
  onUpdate: readonly (() => void)[];
  serialize: (value: unknown) => string;
  deserialize: (raw: string) => unknown;
  validate: (value: unknown) => boolean;
}
