# Dynamic Callback Registration with Sync Waves

## Overview

Extend `AspenKey` to support runtime callback registration with ordered execution via "sync waves" — enabling both static schema-defined reactions and dynamic component-scoped reactions without introducing a separate pub/sub system.

## Problem Statement

Currently, Aspen callbacks are static (defined in key schema at construction time). This works for permanent UI reactions but breaks for:
- Components that mount/unmount and only care about state conditionally
- Temporary listeners that need cleanup
- Scoped state subscriptions

A separate pub/sub layer duplicates callback logic. We consolidate by making onUpdate itself support dynamic registration.

## Design Philosophy

### Leverage Browser Rendering

Aspen treats the DOM as a frame buffer and the browser as a GPU. Callbacks submit complete state-derived DOM updates; the browser's native rendering engine (C++/Rust) handles all reconciliation, reflow, and repainting. No virtual DOM, no JS-based diffing—we offload optimization work to the browser where it's implemented efficiently.

This follows the immediate-mode GUI pattern (like Dear ImGui): callbacks read current state and deterministically recompute the DOM output. The rendering engine then reconciles this against the previous frame, reflows only affected subtrees, and repaints only changed pixels. We don't try to out-optimize C++.

## Design

### Unified Callback System

Both static and dynamic callbacks use the same mechanism: an array fired on key update. They differ only in lifecycle:

- **Static callbacks** (`definition.onUpdate`): Declared in schema, frozen at construction, always run
- **Dynamic callbacks** (`addOnUpdate()`): Added at runtime, can be removed, organized by sync wave

### Sync Waves

Inspired by ArgoCD's sync wave concept. Each callback belongs to a numbered wave (0–255):

- **Wave ordering:** 0, 1, 2, ... 255 (lowest to highest)
- **Within a wave:** FIFO (insertion order)
- **Static callbacks:** Always execute first (before any dynamic waves)
- **Default wave:** 0 (when not specified)
- **Enforcement:** Reject wave numbers outside 0–255 range

Rationale: Familiar mental model for frontend devs (like CSS z-index). Prevents callback ordering from becoming unmaintainable.

### API

#### Add Dynamic Callback

```typescript
const unsub = key.addOnUpdate(renderComponent, syncWave?: number): () => void
```

- `renderComponent`: Named, zero-argument function
- `syncWave`: Optional number, default 0, range 0–255
- Returns: Unsubscribe function (removes callback)

**Example:**
```typescript
function openModal() {
  const unsubs = [
    state.$.user.addOnUpdate(updateUserForm),
    state.$.theme.addOnUpdate(applyModalTheme, 1),  // runs after wave 0
  ];

  modal.onClose = () => unsubs.forEach(fn => fn());
}
```

### Validation

All callbacks must pass these checks (same as static onUpdate in v2):

1. **Is a function:** Reject non-functions (no inline arrows, computed results)
2. **Named:** `fn.name !== ""`
3. **Zero-argument:** `fn.length === 0`
4. **Sync wave in range:** `0 <= syncWave <= 255`

Error messages should match existing Aspen style:
```
[Aspen] addOnUpdate callback must be a named function.
[Aspen] addOnUpdate callback "foo" declares parameters. Render functions take no arguments...
[Aspen] syncWave must be 0-255, got 256
```

### Notification Order

When `notify()` executes:

1. Fire all static callbacks (`definition.onUpdate`)
2. Fire dynamic callbacks by wave:
   - Wave 0, then wave 1, then wave 2, etc.
   - Within each wave, FIFO order
3. Stop (no exceptions propagate)

```typescript
notify() {
  // Static callbacks first (schema-defined, intentional ordering)
  for (const fn of this.definition.onUpdate) {
    fn();
  }

  // Dynamic callbacks by sync wave
  for (let wave = 0; wave <= 255; wave++) {
    const callbacks = this.dynamicCallbacks.get(wave);
    if (callbacks) {
      for (const fn of callbacks) {
        fn();
      }
    }
  }
}
```

### Internal Structure

```typescript
class AspenKey<Type, Value> {
  readonly definition: KeyDef<Type, Value>;
  private dynamicCallbacks: Map<number, (() => void)[]> = new Map();

  addOnUpdate(fn: unknown, syncWave: number = 0): () => void {
    // Validate fn (named, zero-arg)
    // Validate syncWave (0-255)
    // Add to this.dynamicCallbacks[syncWave]
    // Return unsubscribe function
  }

  notify(): void {
    // Fire static callbacks
    // Fire dynamic callbacks by wave order
  }
}
```

## Use Cases

### Permanent Reactions (Static onUpdate)

```typescript
class AppState extends StateTree {
  namespace = "app:";

  theme = new AspenKey({
    type: String,
    persistent: true,
    default: "light",
    onUpdate: [applyTheme],  // always runs when theme changes
  });
}
```

### Temporary Reactions (Dynamic addOnUpdate)

```typescript
function openUserPanel() {
  const panel = document.querySelector("#user-panel");

  const unsubs = [
    state.$.user.addOnUpdate(updatePanelContent),
    state.$.notifications.addOnUpdate(updateNotificationBell, 1),
  ];

  panel.querySelector(".close").addEventListener("click", () => {
    unsubs.forEach(fn => fn());
    panel.remove();
  });
}
```

If user data changes while panel is open, `updatePanelContent` runs. When panel closes, the subscription is cleaned up.

## Testing Checklist

- [ ] `addOnUpdate()` accepts named zero-arg functions
- [ ] `addOnUpdate()` rejects anonymous functions
- [ ] `addOnUpdate()` rejects functions with parameters
- [ ] `addOnUpdate()` rejects syncWave < 0 or > 255
- [ ] Unsubscribe function removes callback from registry
- [ ] Static callbacks fire before any dynamic callbacks
- [ ] Dynamic callbacks fire in wave order (0, 1, 2, ...)
- [ ] Within same wave, callbacks fire in FIFO order
- [ ] Multiple callbacks in same wave and same key work
- [ ] Removing callback mid-wave doesn't affect current notification
- [ ] Type safety: TypeScript knows callbacks are `() => void`

## Non-Goals

- Async callback support (keep synchronous)
- Callback parameters (state is read-only via key properties)
- Callback priorities within a wave (use separate waves instead)
- Error recovery (let exceptions bubble, don't suppress)
- Batching/debouncing (Aspen is synchronous, batch at call site if needed)
