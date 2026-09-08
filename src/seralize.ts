// ---- Built-in Serializers ---------------------------------------------------
import type { AspenType } from "./types";

// ---- Built-in Serializers ---------------------------------------------------
export const serializers: Record<AspenType, (value: unknown) => string> = {
  string(value: unknown): string {
    return value as string;
  },
  number(value: unknown): string {
    return String(value);
  },
  boolean(value: unknown): string {
    if (value === true) return "true";
    return "false";
  },
  list(value: unknown): string {
    return JSON.stringify(value);
  },
  dict(value: unknown): string {
    return JSON.stringify(value);
  },
  json(value: unknown): string {
    return JSON.stringify(value);
  },
};

// ---- Built-in Deserializers -------------------------------------------------

export const deserializers: Record<AspenType, (raw: string) => unknown> = {
  string(raw: string): unknown {
    return raw;
  },
  number(raw: string): unknown {
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed) === true) {
      throw new Error(`[Aspen] Cannot deserialize "${raw}" as number`);
    }
    return parsed;
  },
  boolean(raw: string): unknown {
    if (raw === "true") return true;
    if (raw === "false") return false;
    throw new Error(`[Aspen] Cannot deserialize "${raw}" as boolean`);
  },
  list(raw: string): unknown {
    return JSON.parse(raw) as unknown[];
  },
  dict(raw: string): unknown {
    return JSON.parse(raw) as Record<string, unknown>;
  },
  json(raw: string): unknown {
    return JSON.parse(raw) as unknown;
  },
};
