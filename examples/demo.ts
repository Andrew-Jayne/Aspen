import { initCounters } from "./features/counters.ts";
import { initNotifications } from "./features/notifications.ts";
import { initPolling } from "./features/polling.ts";
import { initProfile } from "./features/profile.ts";
import { initTheme } from "./features/theme.ts";
import { state } from "./tree.ts";

initTheme();
initCounters();
initProfile();
initNotifications();
initPolling();

state.bootstrap();
