export type TypeMap = {
  string: string;
  number: number;
  boolean: boolean;
  list: unknown[];
  dict: Record<string, unknown>;
  json: unknown;
};

export type AspenType = keyof TypeMap;

export type KeyNames<Schema> = {
  readonly [Key in string & keyof Schema]: Key;
};

export interface KeyDef {
  type: AspenType;
  persistent: boolean;
  default: unknown;
  allowed: unknown[] | null;
  aliases: string[] | null;
  onUpdate: readonly (() => void)[] | null;
  serialize: (value: unknown) => string | null;
  deserialize: (raw: string) => unknown | null;
}

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
