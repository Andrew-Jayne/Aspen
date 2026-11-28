import { initBackup } from "./features/backup.ts";
import { initCounters } from "./features/counters.ts";
import { initNotifications } from "./features/notifications.ts";
import { initPolling } from "./features/polling.ts";
import { initProfile } from "./features/profile.ts";
import { initTheme } from "./features/theme.ts";
import { grove } from "./grove.ts";

initTheme();
initCounters();
initProfile();
initNotifications();
initPolling();
initBackup();

// Bootstraps every tree in the grove.
grove.bootstrap();
