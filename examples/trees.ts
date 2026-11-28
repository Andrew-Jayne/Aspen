import { StateLeaf, StateTree } from "aspen";
import { renderCounters } from "./features/counters.ts";
import { renderProfile } from "./features/profile.ts";
import { renderTheme } from "./features/theme.ts";
import type { Notification, Profile, Theme } from "./types.ts";

// Each tree owns one area of the app. A grove needs every tree's namespace to
// be distinct and not a prefix of another's, so they share "demo." but end in
// different segments.

export class SettingsTree extends StateTree {
  namespace = "demo.settings:";

  theme = StateLeaf.string<Theme>({
    bootMirror: true,
    default: "light",
    allowed: ["light", "dark"],
    onUpdate: [renderTheme],
  });
}

export class ActivityTree extends StateTree {
  namespace = "demo.activity:";

  persistCount = StateLeaf.number({
    default: 0,
    onUpdate: [renderCounters],
  });

  sessionCount = StateLeaf.number({
    persistent: false,
    default: 0,
    onUpdate: [renderCounters],
  });

  notification = StateLeaf.object<Notification>({
    persistent: false,
    default: { id: "", message: "", level: "info" },
  });
}

export class UserTree extends StateTree {
  namespace = "demo.user:";

  profile = StateLeaf.object<Profile>({
    default: {
      name: "Ada Lovelace",
      bio: "Mathematician and writer.",
      tags: ["math", "computing"],
    },
    onUpdate: [renderProfile],
  });
}
