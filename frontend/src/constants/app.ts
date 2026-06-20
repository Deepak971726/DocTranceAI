import { resolveApiBaseUrl } from "@/api/baseUrl";

export const appName = "DocTraceAI";
export const appTagline = "Document intelligence for teams that need grounded answers.";
export const apiBaseUrl = resolveApiBaseUrl();

export const themeOptions = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;
