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

const validators = [
  validateString,
  validateNumber,
  validateBoolean,
  validateArray,
  validateObject,
] as const;

export function validatorFor(sample: unknown): (value: unknown) => boolean {
  for (const validate of validators) {
    if (validate(sample) === true) return validate;
  }
  throw new Error(
    "[Aspen] Key default must be a string, number, boolean, array or object",
  );
}

export function describeType(value: unknown): string {
  if (Array.isArray(value) === true) return "array";
  if (value === null) return "null";
  return typeof value;
}
