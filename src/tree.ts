import { StateLeaf } from "./leaf.ts";
import { Remote } from "./remote.ts";
import { IndexedDBBackend } from "./storage.ts";

type TreeSelf = Pick<StateTree, keyof StateTree>;

type TreeClass = abstract new (...args: never[]) => StateTree;

export abstract class StateTree {
  abstract readonly namespace: string;
  readonly persistenceUrl: string | null;

  private readonly ephemeralStore: Map<string, unknown> = new Map();

  private static creating = false;
  // Namespace -> the tree class that claimed it on this page. A tree removes
  // orphans under its own prefix, so two trees whose prefixes contain each
  // other would delete each other's leaves.
  private static readonly claimed = new Map<string, TreeClass>();
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

  /** Throws if importPersistent(data) would reject any value; writes nothing. */
  public checkImport(this: TreeSelf, data: Record<string, unknown>): void {
    StateTree.requireTree(this, "checkImport");
    StateTree.planImport(this, data);
  }

  public async importPersistent(
    this: TreeSelf,
    data: Record<string, unknown>,
  ): Promise<void> {
    StateTree.requireTree(this, "importPersistent");
    const writes: Promise<void>[] = [];
    for (const [leaf, value] of StateTree.planImport(this, data)) {
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

    // Claim the namespace before touching storage: a tree removes orphans
    // under its own prefix, so overlapping prefixes would delete each other.
    const treeClass = tree.constructor as TreeClass;
    if (tree.namespace === "") {
      throw new Error(
        `[Aspen] ${treeClass.name} has an empty namespace. Every tree needs its own prefix; an empty one would claim every key in storage.`,
      );
    }
    for (const [namespace, owner] of StateTree.claimed) {
      if (namespace === tree.namespace && owner === treeClass) continue;
      if (
        namespace.startsWith(tree.namespace) === true ||
        tree.namespace.startsWith(namespace) === true
      ) {
        throw new Error(
          `[Aspen] Namespace "${tree.namespace}" of ${treeClass.name} overlaps "${namespace}" of ${owner.name}. Trees need prefixes that don't contain each other.`,
        );
      }
    }
    StateTree.claimed.set(tree.namespace, treeClass);

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

    await tree.validateStorage();

    return tree as unknown as Readonly<Tree>;
  }

  // Private static methods

  /**
   * Pairs every importable entry with its leaf, checking every value first so
   * a bad entry rejects the whole import before anything is written.
   */
  private static planImport(
    tree: TreeSelf,
    data: Record<string, unknown>,
  ): [StateLeaf, unknown][] {
    const plan: [StateLeaf, unknown][] = [];
    const rejected: string[] = [];
    for (const leaf of StateTree.ownLeavesOf(tree)) {
      if (Object.hasOwn(data, leaf.storageKey) === false) continue;
      if (IndexedDBBackend.gateway.hasItem(leaf.storageKey) === false) continue;
      const value = data[leaf.storageKey];
      if (leaf.accepts(value) === false) {
        rejected.push(leaf.storageKey);
        continue;
      }
      plan.push([leaf, value]);
    }
    if (rejected.length > 0) {
      throw new Error(
        `[Aspen] Import rejected; invalid values for: ${rejected.join(", ")}. Nothing was written.`,
      );
    }
    return plan;
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
