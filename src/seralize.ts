// ---- Built-in Serializers ---------------------------------------------------
import type { AspenType } from "./types";

// ---- Built-in Serializers ---------------------------------------------------
export const serializers: Record<AspenType, (value: unknown) => string> = {
  string: (value) => value as string,
  number: (value) => String(value),
  boolean: (value) => {
    if (value === true) return "true";
    return "false";
  },
  list: (value) => JSON.stringify(value),
  dict: (value) => JSON.stringify(value),
  json: (value) => JSON.stringify(value),
};

// ---- Built-in Deserializers -------------------------------------------------

export const deserializers: Record<AspenType, (raw: string) => unknown> = {
  string: (raw) => raw,
  number: (raw) => {
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed) === true) {
      throw new Error(`[Aspen] Cannot deserialize "${raw}" as number`);
    }
    return parsed;
  },
  boolean: (raw) => {
    if (raw === "true") return true;
    if (raw === "false") return false;
    throw new Error(`[Aspen] Cannot deserialize "${raw}" as boolean`);
  },
  list: (raw) => JSON.parse(raw) as unknown[],
  dict: (raw) => JSON.parse(raw) as Record<string, unknown>,
  json: (raw) => JSON.parse(raw) as unknown,
};
