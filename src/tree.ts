import { StateLeaf } from "./leaf.ts";
import { Remote } from "./remote.ts";
import { IndexedDBBackend } from "./storage.ts";

type TreeSelf = Pick<StateTree, keyof StateTree>;

export abstract class StateTree {
  abstract readonly namespace: string;
  readonly persistenceUrl: string | null;

  private readonly ephemeralStore: Map<string, unknown> = new Map();

  private static creating = false;
  private static readonly leafCache = new WeakMap<object, StateLeaf[]>();
  private static readonly RESERVED_FIELDS: ReadonlySet<string> = new Set([
    "namespace",
    "persistenceUrl",
    "ephemeralStore",
  ]);

  public constructor(persistenceUrl: string | null = null) {
    if (StateTree.creating === false) {
      throw new Error(
        `[Aspen] ${new.target.name} cannot be built with new. Use await ${new.target.name}.create() so leaves are bound and storage is open.`,
      );
    }
    StateTree.creating = false;
    this.persistenceUrl = persistenceUrl;
  }

  // Public methods

  public bootstrap(this: TreeSelf): void {
    StateTree.requireTree(this, "bootstrap");
    for (const leaf of StateTree.ownLeavesOf(this)) {
      leaf.notify();
    }
  }

  public async validateStorage(this: TreeSelf): Promise<void> {
    StateTree.requireTree(this, "validateStorage");
    const storage = IndexedDBBackend.gateway;
    const writes: Promise<void>[] = [];
    const owned = new Set<string>();

    for (const leaf of StateTree.ownLeavesOf(this)) {
      owned.add(leaf.storageKey);
      writes.push(leaf.prepareStorage());
    }

    const orphaned: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const storedKey = storage.key(index);
      if (
        storedKey !== null &&
        storedKey.startsWith(this.namespace) === true &&
        owned.has(storedKey) === false
      ) {
        orphaned.push(storedKey);
      }
    }
    for (const storedKey of orphaned) {
      console.warn(`[Aspen] Removing orphaned key: ${storedKey}`);
      writes.push(storage.removeItem(storedKey));
    }

    const strayMirrors: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const storedKey = localStorage.key(index);
      if (
        storedKey !== null &&
        storedKey.startsWith(this.namespace) === true &&
        owned.has(storedKey) === false
      ) {
        strayMirrors.push(storedKey);
      }
    }
    for (const storedKey of strayMirrors) {
      localStorage.removeItem(storedKey);
    }

    await Promise.all(writes);
  }

  public exportPersistent(this: TreeSelf): Record<string, unknown> {
    StateTree.requireTree(this, "exportPersistent");
    const out: Record<string, unknown> = {};
    for (const leaf of StateTree.ownLeavesOf(this)) {
      if (IndexedDBBackend.gateway.hasItem(leaf.storageKey) === true) {
        out[leaf.storageKey] = IndexedDBBackend.gateway.getItem(
          leaf.storageKey,
        );
      }
    }
    return out;
  }

  public async importPersistent(
    this: TreeSelf,
    data: Record<string, unknown>,
  ): Promise<void> {
    StateTree.requireTree(this, "importPersistent");
    const writes: Promise<void>[] = [];
    for (const [storageKey, value] of Object.entries(data)) {
      if (storageKey.startsWith(this.namespace) === false) continue;

      const leaf = (this as unknown as Record<string, unknown>)[
        storageKey.slice(this.namespace.length)
      ];
      if (leaf instanceof StateLeaf === false) continue;
      if (IndexedDBBackend.gateway.hasItem(storageKey) === false) continue;

      writes.push(leaf.update(value));
    }
    await Promise.all(writes);
  }

  public async pushPersistent(
    this: TreeSelf,
    urlOverride: string | null = null,
  ): Promise<void> {
    StateTree.requireTree(this, "pushPersistent");
    await Remote.push(
      this.persistenceUrl,
      urlOverride,
      this.exportPersistent(),
    );
  }

  public async pullPersistent(
    this: TreeSelf,
    urlOverride: string | null = null,
  ): Promise<boolean> {
    StateTree.requireTree(this, "pullPersistent");
    const data = await Remote.pull(this.persistenceUrl, urlOverride);
    if (data === null) {
      return false;
    }
    await this.importPersistent(data);
    return true;
  }

  // Public static methods

  public static async create<Tree extends StateTree>(
    this: new (
      persistenceUrl: string | null,
    ) => Tree,
    persistenceUrl: string | null = null,
  ): Promise<Readonly<Tree>> {
    await IndexedDBBackend.connect();

    StateTree.creating = true;
    let tree: Tree;
    try {
      tree = new this(persistenceUrl);
    } finally {
      StateTree.creating = false;
    }

    StateTree.bindLeaves(tree);
    await tree.validateStorage();

    return tree as unknown as Readonly<Tree>;
  }
  
  public static async build<Tree extends StateTree>(
    this: new (
      persistenceUrl: string | null,
    ) => Tree,
    persistenceUrl: string | null = null,
  ): Promise<Readonly<Tree>> {
    await IndexedDBBackend.connect();

    StateTree.creating = true;
    let tree: Tree;
    try {
      tree = new this(persistenceUrl);
    } finally {
      StateTree.creating = false;
    }

    StateTree.bindLeaves(tree);

    return tree as unknown as Readonly<Tree>;
  }

  // Private static methods

  private static bindLeaves(tree: StateTree): void {
    for (const [name, field] of Object.entries(tree) as [string, unknown][]) {
      if (field instanceof StateLeaf === false) continue;
      if (name in StateTree.prototype === true) {
        throw new Error(
          `[Aspen] Leaf name "${name}" collides with a StateTree method`,
        );
      }
      if (StateTree.RESERVED_FIELDS.has(name) === true) {
        throw new Error(
          `[Aspen] Leaf name "${name}" collides with a StateTree field`,
        );
      }

      const leaf = field as StateLeaf;
      leaf.bind(name, tree.namespace, tree.ephemeralStore);
      Object.defineProperty(tree, name, {
        value: leaf,
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
  }

  private static requireTree(self: unknown, method: string): void {
    if (self instanceof StateTree === false) {
      throw new Error(
        `[Aspen] ${method}() was called without its tree as \`this\`. Call it as tree.${method}(...) or wrap it in a function.`,
      );
    }
  }

  private static ownLeavesOf(tree: TreeSelf): StateLeaf[] {
    const leaves = StateTree.leafCache.get(tree);
    if (leaves === undefined) {
      const found: StateLeaf[] = [];
      for (const value of Object.values(tree) as unknown[]) {
        if (value instanceof StateLeaf) found.push(value);
      }
      StateTree.leafCache.set(tree, found);
      return found;
    }
    return leaves;
  }
}
