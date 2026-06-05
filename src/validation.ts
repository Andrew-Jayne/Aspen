// ---- Built-in Validators ----------------------------------------------------
import type { AspenType } from "./types";

export const validators: Record<AspenType, (value: unknown) => boolean> = {
  string: (value) => typeof value === "string",
  number: (value) => {
    return typeof value === "number" && Number.isNaN(value) === false;
  },
  boolean: (value) => typeof value === "boolean",
  list: (value) => Array.isArray(value) === true,
  dict: (value) => {
    return (
      typeof value === "object" &&
      value !== null &&
      Array.isArray(value) === false
    );
  },
  json: (value) => {
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  },
};
