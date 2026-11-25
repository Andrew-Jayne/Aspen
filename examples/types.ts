export type Theme = "light" | "dark";

export type Profile = {
  name: string;
  bio: string;
  tags: string[];
};

export const LEVELS = ["info", "warn", "error"] as const;
export type Level = (typeof LEVELS)[number];

export type Notification = {
  id: string;
  message: string;
  level: Level;
};
