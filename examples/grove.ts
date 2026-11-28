import { StateGrove } from "aspen";
import { ActivityTree, SettingsTree, UserTree } from "./trees.ts";

// A grove's fields hold tree classes, not built trees. create() builds each
// one, checks their namespaces don't overlap, validates storage for all of
// them, and replaces every field with its built tree.
export class DemoGrove extends StateGrove {
  settings = SettingsTree;
  activity = ActivityTree;
  user = UserTree;
}

export const grove = await DemoGrove.create();
