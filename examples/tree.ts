import { AspenKey, StateTree } from "../src/index.ts";
import { renderCounters } from "./features/counters.ts";
import { renderProfile } from "./features/profile.ts";
import { renderTheme } from "./features/theme.ts";
import type { Notification, Profile, Theme } from "./types.ts";

export class DemoTree extends StateTree {
  namespace = "demo:";

  theme = new AspenKey<Theme>({
    bootMirror: true,
    default: "light",
    allowed: ["light", "dark"],
    onUpdate: [renderTheme],
  });

  persistCount = new AspenKey<number>({
    default: 0,
    onUpdate: [renderCounters],
  });

  sessionCount = new AspenKey<number>({
    persistent: false,
    default: 0,
    onUpdate: [renderCounters],
  });

  profile = new AspenKey<Profile>({
    default: {
      name: "Ada Lovelace",
      bio: "Mathematician and writer.",
      tags: ["math", "computing"],
    },
    onUpdate: [renderProfile],
  });

  // Not rendered by a fixed callback: toasts and the poller attach with listen().
  notification = new AspenKey<Notification>({
    persistent: false,
    default: { id: "", message: "", level: "info" },
  });
}

// The feature modules import this back for their render functions. That cycle is
// safe: they only read `state` when called, after this module has finished.
export const state = await DemoTree.create();
