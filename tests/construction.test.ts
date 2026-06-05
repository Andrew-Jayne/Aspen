import { describe, expect, test } from "bun:test";
import { StateTree } from "../src/index";

describe("construction", () => {
  test("creates a tree from a valid schema", () => {
    const state = new StateTree("app.", {
      theme: { type: "string", persistent: true, default: "light" },
      count: { type: "number", persistent: false, default: 0 },
    });
    expect(state).toBeDefined();
  });

  test("rejects unknown type", () => {
    expect(() => {
      new StateTree("app.", {
        bad: {
          type: "banana" as "string",
          persistent: true,
          default: "yellow",
        },
      });
    }).toThrow("[Aspen] Unknown type");
  });

  test("rejects default that doesn't match declared type", () => {
    expect(() => {
      new StateTree("app.", {
        broken: { type: "number", persistent: true, default: "not a number" },
      });
    }).toThrow("does not match declared type");
  });

  test("rejects default not in allowed list", () => {
    expect(() => {
      new StateTree("app.", {
        mode: {
          type: "string",
          persistent: true,
          default: "maybe",
          allowed: ["yes", "no"],
        },
      });
    }).toThrow("not in the allowed list");
  });
});
