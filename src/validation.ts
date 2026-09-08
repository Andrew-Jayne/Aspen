// ---- Built-in Validators ----------------------------------------------------
import type { AspenType } from "./types";

export const validators: Record<AspenType, (value: unknown) => boolean> = {
  string(value: unknown): boolean {
    return typeof value === "string";
  },
  number(value: unknown): boolean {
    return typeof value === "number" && Number.isNaN(value) === false;
  },
  boolean(value: unknown): boolean {
    return typeof value === "boolean";
  },
  list(value: unknown): boolean {
    return Array.isArray(value) === true;
  },
  dict(value: unknown): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      Array.isArray(value) === false
    );
  },
  json(value: unknown): boolean {
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  },
};
