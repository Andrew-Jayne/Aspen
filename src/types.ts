export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

type TypeTable =
  | { type: StringConstructor; value: string }
  | { type: NumberConstructor; value: number }
  | { type: BooleanConstructor; value: boolean }
  | { type: ArrayConstructor; value: Json[] }
  | { type: ObjectConstructor; value: { [key: string]: Json } };

export type AspenType = TypeTable["type"];

type Row<Type extends AspenType> = Extract<TypeTable, { type: Type }>;

export type ValueOf<Type extends AspenType> = Row<Type>["value"];

// The constructor a key must declare for the value type it stores. Wrapped in
// tuples so unions like "light" | "dark" or true | false map as a whole.
export type TypeFor<Value> = [Value] extends [string]
  ? StringConstructor
  : [Value] extends [number]
    ? NumberConstructor
    : [Value] extends [boolean]
      ? BooleanConstructor
      : [Value] extends [readonly unknown[]]
        ? ArrayConstructor
        : [Value] extends [object]
          ? ObjectConstructor
          : never;

export interface KeyOptions<Value> {
  type: TypeFor<Value>;
  persistent?: boolean;
  default: Value;
  bootMirror?: boolean | null;
  allowed?: readonly Value[] | null;
  aliases?: readonly string[] | null;
  onUpdate?: readonly (() => void)[] | null;
  serialize?: ((value: Value) => string) | null;
  deserialize?: ((raw: string) => Value) | null;
}

export interface KeyDef<Value> {
  type: TypeFor<Value>;
  persistent: boolean;
  default: Value;
  bootMirror: boolean | null;
  allowed: readonly Value[] | null;
  aliases: readonly string[] | null;
  onUpdate: readonly (() => void)[] | null;
  serialize: ((value: Value) => string) | null;
  deserialize: ((raw: string) => Value) | null;
}

type AnyKey = {
  readonly definition: { readonly type: AspenType; default: unknown };
};

type KeyNamesOf<Tree> = {
  [Name in keyof Tree]: Tree[Name] extends AnyKey ? Name : never;
}[keyof Tree];

type FieldNamesOf<Tree> = Exclude<keyof Tree, KeyNamesOf<Tree>>;

export type Live<Tree> = {
  readonly [Name in FieldNamesOf<Tree>]: Tree[Name];
} & {
  readonly [Name in KeyNamesOf<Tree>]: Tree[Name];
};
