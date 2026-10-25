import type { AspenType } from "./types";

function validateString(value: unknown): boolean {
  return typeof value === "string";
}

function validateNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isNaN(value) === false;
}

function validateBoolean(value: unknown): boolean {
  return typeof value === "boolean";
}

function validateArray(value: unknown): boolean {
  return Array.isArray(value) === true;
}

function validateObject(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(value) === false
  );
}

export const validators: ReadonlyMap<AspenType, (value: unknown) => boolean> =
  new Map<AspenType, (value: unknown) => boolean>([
    [String, validateString],
    [Number, validateNumber],
    [Boolean, validateBoolean],
    [Array, validateArray],
    [Object, validateObject],
  ]);
