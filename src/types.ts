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
