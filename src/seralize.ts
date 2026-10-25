import type { AspenType } from "./types";

function serializeString(value: unknown): string {
  return value as string;
}

function serializeNumber(value: unknown): string {
  return String(value);
}

function serializeBoolean(value: unknown): string {
  if (value === true) return "true";
  return "false";
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value);
}

function deserializeString(raw: string): unknown {
  return raw;
}

function deserializeNumber(raw: string): unknown {
  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed) === true) {
    throw new Error(`[Aspen] Cannot deserialize "${raw}" as number`);
  }
  return parsed;
}

function deserializeBoolean(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`[Aspen] Cannot deserialize "${raw}" as boolean`);
}

function deserializeJson(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

export const serializers: ReadonlyMap<AspenType, (value: unknown) => string> =
  new Map<AspenType, (value: unknown) => string>([
    [String, serializeString],
    [Number, serializeNumber],
    [Boolean, serializeBoolean],
    [Array, serializeJson],
    [Object, serializeJson],
  ]);

export const deserializers: ReadonlyMap<AspenType, (raw: string) => unknown> =
  new Map<AspenType, (raw: string) => unknown>([
    [String, deserializeString],
    [Number, deserializeNumber],
    [Boolean, deserializeBoolean],
    [Array, deserializeJson],
    [Object, deserializeJson],
  ]);
