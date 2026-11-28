import { Remote } from "./remote.ts";
import { IndexedDBBackend } from "./storage.ts";
import { StateTree } from "./tree.ts";

type GroveSelf = Pick<StateGrove, keyof StateGrove>;

interface TreeClass {
  build(persistenceUrl: string | null): Promise<Readonly<StateTree>>;
}

type Planted<GroveType> = {
  readonly [Field in keyof GroveType]: GroveType[Field] extends abstract new (
    ...args: never[]
  ) => infer Instance
    ? Instance extends StateTree
      ? Readonly<Instance>
      : GroveType[Field]
    : GroveType[Field];
};

export abstract class StateGrove {
  readonly persistenceUrl: string | null;

  private static creating = false;
  private static readonly treeCache = new WeakMap<object, StateTree[]>();
  private static readonly RESERVED_FIELDS: ReadonlySet<string> = new Set([
    "persistenceUrl",
  ]);

  public constructor(persistenceUrl: string | null = null) {
    if (StateGrove.creating === false) {
      throw new Error(
        `[Aspen] ${new.target.name} cannot be built with new. Use await ${new.target.name}.create() so its trees are built and storage is open.`,
      );
    }
    StateGrove.creating = false;
    this.persistenceUrl = persistenceUrl;
  }

  // Public methods

  public bootstrap(this: GroveSelf): void {
    StateGrove.requireGrove(this, "bootstrap");
    for (const tree of StateGrove.treesOf(this)) {
      tree.bootstrap();
    }
  }

  public exportPersistent(this: GroveSelf): Record<string, unknown> {
    StateGrove.requireGrove(this, "exportPersistent");
    const out: Record<string, unknown> = {};
    for (const tree of StateGrove.treesOf(this)) {
      Object.assign(out, tree.exportPersistent());
    }
    return out;
  }

  public async importPersistent(
    this: GroveSelf,
    data: Record<string, unknown>,
  ): Promise<void> {
    StateGrove.requireGrove(this, "importPersistent");
    const imports: Promise<void>[] = [];
    for (const tree of StateGrove.treesOf(this)) {
      imports.push(tree.importPersistent(data));
    }
    await Promise.all(imports);
  }

  public async pushPersistent(
    this: GroveSelf,
    urlOverride: string | null = null,
  ): Promise<void> {
    StateGrove.requireGrove(this, "pushPersistent");
    await Remote.push(
      this.persistenceUrl,
      urlOverride,
      this.exportPersistent(),
    );
  }

  public async pullPersistent(
    this: GroveSelf,
    urlOverride: string | null = null,
  ): Promise<boolean> {
    StateGrove.requireGrove(this, "pullPersistent");
    const data = await Remote.pull(this.persistenceUrl, urlOverride);
    if (data === null) {
      return false;
    }
    await this.importPersistent(data);
    return true;
  }

  public async close(this: GroveSelf): Promise<void> {
    StateGrove.requireGrove(this, "close");
    await IndexedDBBackend.gateway.close();
  }

  // Public static methods

  public static async create<GroveType extends StateGrove>(
    this: new (
      persistenceUrl: string | null,
    ) => GroveType,
    persistenceUrl: string | null = null,
  ): Promise<Planted<GroveType>> {
    await IndexedDBBackend.connect();
    const storage = IndexedDBBackend.gateway;

    StateGrove.creating = true;
    let grove: GroveType;
    try {
      grove = new this(persistenceUrl);
    } finally {
      StateGrove.creating = false;
    }

    const planted = new Map<string, Readonly<StateTree>>();
    for (const [name, field] of Object.entries(grove) as [string, unknown][]) {
      if (field instanceof StateTree === true) {
        throw new Error(
          `[Aspen] Grove field "${name}" holds a built tree. Assign the tree class instead (${name} = ${field.constructor.name}).`,
        );
      }
      if (typeof field !== "function") continue;
      if (field.prototype instanceof StateTree === false) continue;
      if (name in StateGrove.prototype === true) {
        throw new Error(
          `[Aspen] Tree name "${name}" collides with a StateGrove method`,
        );
      }
      if (StateGrove.RESERVED_FIELDS.has(name) === true) {
        throw new Error(
          `[Aspen] Tree name "${name}" collides with a StateGrove field`,
        );
      }

      planted.set(name, await (field as unknown as TreeClass).build(null));
    }

    const entries = [...planted];
    for (const [index, [nameA, treeA]] of entries.entries()) {
      if (treeA.namespace === "") {
        throw new Error(
          `[Aspen] Tree "${nameA}" has an empty namespace. Every tree in a grove needs its own prefix.`,
        );
      }
      for (const [nameB, treeB] of entries.slice(index + 1)) {
        if (
          treeA.namespace.startsWith(treeB.namespace) === true ||
          treeB.namespace.startsWith(treeA.namespace) === true
        ) {
          throw new Error(
            `[Aspen] Namespaces of "${nameA}" ("${treeA.namespace}") and "${nameB}" ("${treeB.namespace}") overlap. Trees in a grove need prefixes that don't contain each other.`,
          );
        }
      }
    }

    const validations: Promise<void>[] = [];
    for (const tree of planted.values()) {
      validations.push(tree.validateStorage());
    }
    await Promise.all(validations);

    const orphaned: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const storedKey = storage.key(index);
      if (storedKey === null) continue;
      let owned = false;
      for (const tree of planted.values()) {
        if (storedKey.startsWith(tree.namespace) === true) {
          owned = true;
        }
      }
      if (owned === false) {
        orphaned.push(storedKey);
      }
    }
    const removals: Promise<void>[] = [];
    for (const storedKey of orphaned) {
      console.warn(
        `[Aspen] Removing key outside every grove namespace: ${storedKey}`,
      );
      removals.push(storage.removeItem(storedKey));
    }
    await Promise.all(removals);

    for (const [name, tree] of planted) {
      Object.defineProperty(grove, name, {
        value: tree,
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }

    return grove as unknown as Planted<GroveType>;
  }

  // Private static methods

  private static requireGrove(self: unknown, method: string): void {
    if (self instanceof StateGrove === false) {
      throw new Error(
        `[Aspen] ${method}() was called without its grove as \`this\`. Call it as grove.${method}(...) or wrap it in a function.`,
      );
    }
  }

  private static treesOf(grove: GroveSelf): StateTree[] {
    const trees = StateGrove.treeCache.get(grove);
    if (trees === undefined) {
      const found: StateTree[] = [];
      for (const value of Object.values(grove) as unknown[]) {
        if (value instanceof StateTree) found.push(value);
      }
      StateGrove.treeCache.set(grove, found);
      return found;
    }
    return trees;
  }
}
