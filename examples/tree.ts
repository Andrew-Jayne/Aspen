import { AspenKey, StateTree } from "../src/index.ts";
import { renderCounters } from "./features/counters.ts";
import { renderProfile } from "./features/profile.ts";
import { renderTheme } from "./features/theme.ts";
import type { Notification, Profile, Theme } from "./types.ts";

export class DemoTree extends StateTree {
  namespace = "demo:";

  theme = AspenKey.string<Theme>({
    bootMirror: true,
    default: "light",
    allowed: ["light", "dark"],
    onUpdate: [renderTheme],
  });

  persistCount = AspenKey.number({
    default: 0,
    onUpdate: [renderCounters],
  });

  sessionCount = AspenKey.number({
    persistent: false,
    default: 0,
    onUpdate: [renderCounters],
  });

  profile = AspenKey.object<Profile>({
    default: {
      name: "Ada Lovelace",
      bio: "Mathematician and writer.",
      tags: ["math", "computing"],
    },
    onUpdate: [renderProfile],
  });

  notification = AspenKey.object<Notification>({
    persistent: false,
    default: { id: "", message: "", level: "info" },
  });
}

export const state = await DemoTree.create();
