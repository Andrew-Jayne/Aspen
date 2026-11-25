export type AspenType =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ArrayConstructor
  | ObjectConstructor;

export interface KeyOptions<ValueType> {
  persistent?: boolean | null;
  default: NoInfer<ValueType>;
  bootMirror?: boolean | null;
  allowed?: readonly NoInfer<ValueType>[] | null;
  aliases?: readonly string[] | null;
  onUpdate?: readonly (() => void)[] | null;
}

export interface KeyDef<ValueType> {
  type: AspenType;
  persistent: boolean;
  default: ValueType;
  bootMirror: boolean | null;
  allowed: readonly ValueType[] | null;
  aliases: readonly string[] | null;
  onUpdate: readonly (() => void)[] | null;
}

export type Live<Tree> = Readonly<Tree>;
