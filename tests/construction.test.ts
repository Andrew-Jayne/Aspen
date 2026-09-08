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

describe("keys enum", () => {
  test("maps every schema key to its own name", () => {
    const state = new StateTree("app.", {
      theme: { type: "string", persistent: true, default: "light" },
      count: { type: "number", persistent: false, default: 0 },
    });
    expect(state.keys).toEqual({ theme: "theme", count: "count" });
  });

  test("is frozen", () => {
    const state = new StateTree("app.", {
      theme: { type: "string", persistent: true, default: "light" },
    });
    expect(Object.isFrozen(state.keys)).toBe(true);
  });

  test("works as the key argument to get and set", () => {
    const state = new StateTree("app.", {
      count: { type: "number", persistent: false, default: 0 },
    });
    state.set(state.keys.count, state.get(state.keys.count) + 1);
    expect(state.get(state.keys.count)).toBe(1);
  });

  test("a misspelled key is undefined and rejected by get", () => {
    const state = new StateTree("app.", {
      count: { type: "number", persistent: false, default: 0 },
    });
    const misspelled = (state.keys as Record<string, string>)["cuont"];
    expect(misspelled).toBeUndefined();
    expect(() => {
      state.get(misspelled as never);
    }).toThrow("[Aspen] Key not registered");
  });
});
