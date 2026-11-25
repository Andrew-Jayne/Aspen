export interface KeyOptions<ValueType> {
  persistent?: boolean | null;
  default: NoInfer<ValueType>;
  bootMirror?: boolean | null;
  allowed?: readonly NoInfer<ValueType>[] | null;
  aliases?: readonly string[] | null;
  onUpdate?: readonly (() => void)[] | null;
}

export interface KeyDef<ValueType> {
  validate: (value: unknown) => boolean;
  persistent: boolean;
  default: ValueType;
  bootMirror: boolean | null;
  allowed: readonly ValueType[] | null;
  aliases: readonly string[] | null;
  onUpdate: readonly (() => void)[] | null;
}
;
