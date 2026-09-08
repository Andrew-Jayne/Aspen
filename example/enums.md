# Enums instead of magic strings

[← README](../README.md)

Magic strings are the easiest way to introduce a bug that no linter catches, so Aspen encourages enums at both ends of the API.

**Key names** come for free: every tree exposes `State.keys`, a frozen enum of its own schema keys. Prefer `State.get(State.keys.theme)` over `State.get("theme")` throughout a codebase, and treat a string-literal key outside the schema as a code smell.

**Values** are yours to define. Use a frozen object + `Object.values()` for the `allowed` list, and reference the enum from both the schema and the call sites:

```js
const Theme = { LIGHT: "light", DARK: "dark" };

const State = new StateTree("app.", {
  theme: {
    type: "string",
    persistent: true,
    default: Theme.LIGHT,
    allowed: Object.values(Theme),
    onUpdate: [renderTheme],
  },
});

function toggleTheme() {
  if (State.get(State.keys.theme) === Theme.LIGHT) {
    State.set(State.keys.theme, Theme.DARK);
  } else {
    State.set(State.keys.theme, Theme.LIGHT);
  }
}
```
