import { afterEach, describe, expect, test } from "bun:test";
import { StateTree } from "../src/index";

interface RecordedFetchCall {
  url: string;
  init: RequestInit | undefined;
}

const realFetch = globalThis.fetch;
let fetchCalls: RecordedFetchCall[] = [];

function installFetchMock(makeResponse: () => Response): void {
  fetchCalls = [];
  const fakeFetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    fetchCalls.push({ url: String(url), init });
    return makeResponse();
  };
  globalThis.fetch = fakeFetch as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

function makeTree(persistenceUrl: string | null = null) {
  return new StateTree(
    "app.",
    {
      theme: { type: "string", persistent: true, default: "light" },
      size: { type: "number", persistent: true, default: 16 },
      modal: { type: "boolean", persistent: false, default: false },
    },
    localStorage,
    persistenceUrl,
  );
}

describe("pushPersistent", () => {
  test("PUTs exported persistent state as JSON", async () => {
    installFetchMock(() => new Response("{}", { status: 200 }));

    const state = makeTree("/api/state/42");
    state.set("theme", "dark");
    state.set("size", 24);
    state.set("modal", true);
    await state.pushPersistent();

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.url).toBe("/api/state/42");
    expect(fetchCalls[0]?.init?.method).toBe("PUT");
    expect(JSON.parse(String(fetchCalls[0]?.init?.body))).toEqual({
      "app.theme": "dark",
      "app.size": "24",
    });
  });

  test("throws on non-2xx response", async () => {
    installFetchMock(() => new Response("nope", { status: 500 }));

    const state = makeTree("/api/state/42");
    await expect(state.pushPersistent()).rejects.toThrow("HTTP 500");
  });

  test("throws when no persistence URL is configured", async () => {
    const state = makeTree();
    await expect(state.pushPersistent()).rejects.toThrow("No persistence URL");
  });

  test("per-call URL overrides the configured one", async () => {
    installFetchMock(() => new Response("{}", { status: 200 }));

    const state = makeTree("/api/state/42");
    await state.pushPersistent("/api/state/other");

    expect(fetchCalls[0]?.url).toBe("/api/state/other");
  });
});

describe("pullPersistent", () => {
  test("GETs state, imports it, and fires onUpdate", async () => {
    installFetchMock(() => {
      return new Response(
        JSON.stringify({ "app.theme": "dark", "app.size": "24" }),
        { status: 200 },
      );
    });

    let themeCalls = 0;
    function countTheme() {
      themeCalls++;
    }
    const state = new StateTree(
      "app.",
      {
        theme: {
          type: "string",
          persistent: true,
          default: "light",
          onUpdate: [countTheme],
        },
        size: { type: "number", persistent: true, default: 16 },
      },
      localStorage,
      "/api/state/42",
    );

    const imported = await state.pullPersistent();

    expect(imported).toBe(true);
    expect(fetchCalls[0]?.url).toBe("/api/state/42");
    expect(state.get("theme")).toBe("dark");
    expect(state.get("size")).toBe(24);
    expect(themeCalls).toBe(1);
  });

  test("returns false when the server has no saved state", async () => {
    installFetchMock(() => new Response("not found", { status: 404 }));

    const state = makeTree("/api/state/42");
    const imported = await state.pullPersistent();

    expect(imported).toBe(false);
    expect(state.get("theme")).toBe("light");
  });

  test("throws on non-2xx, non-404 response", async () => {
    installFetchMock(() => new Response("nope", { status: 500 }));

    const state = makeTree("/api/state/42");
    await expect(state.pullPersistent()).rejects.toThrow("HTTP 500");
  });

  test("throws on malformed (non-object) JSON payload", async () => {
    installFetchMock(() => new Response('["not", "a", "dict"]'));

    const state = makeTree("/api/state/42");
    await expect(state.pullPersistent()).rejects.toThrow("malformed state");
  });

  test("round-trips through push then pull", async () => {
    let savedBody = "{}";
    installFetchMock(() => new Response(savedBody, { status: 200 }));

    const source = makeTree("/api/state/42");
    source.set("theme", "dark");
    source.set("size", 32);
    await source.pushPersistent();
    savedBody = String(fetchCalls[0]?.init?.body);

    localStorage.clear();

    const target = makeTree("/api/state/42");
    expect(target.get("theme")).toBe("light");
    await target.pullPersistent();
    expect(target.get("theme")).toBe("dark");
    expect(target.get("size")).toBe(32);
  });
});
