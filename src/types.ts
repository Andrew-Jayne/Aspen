export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

type TypeTable =
  | { type: StringConstructor; value: string; widen: string }
  | { type: NumberConstructor; value: number; widen: number }
  | { type: BooleanConstructor; value: boolean; widen: boolean }
  | { type: ArrayConstructor; value: Json[]; widen: never }
  | { type: ObjectConstructor; value: { [key: string]: Json }; widen: never };

export type AspenType = TypeTable["type"];

type Row<Type extends AspenType> = Extract<TypeTable, { type: Type }>;

export type ValueOf<Type extends AspenType> = Row<Type>["value"];

export type WidenOf<Type extends AspenType> = Row<Type>["widen"];

export interface KeyOptions<Type extends AspenType, Value> {
  type: Type;
  persistent: boolean;
  default: Value;
  bootMirror: boolean | null;
  allowed: readonly Value[] | null;
  aliases: readonly string[] | null;
  onUpdate: readonly (() => void)[] | null;
  serialize: ((value: Value) => string) | null;
  deserialize: ((raw: string) => Value) | null;
}

export interface KeyDef<Type extends AspenType, Value> {
  type: Type;
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
