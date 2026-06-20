const fallbackApiBaseUrl = "http://localhost:8000/api/v1";
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? fallbackApiBaseUrl;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function resolveApiBaseUrl() {
  if (typeof window === "undefined") {
    return configuredApiBaseUrl.replace(/\/$/, "");
  }

  const apiUrl = new URL(configuredApiBaseUrl, window.location.origin);
  const pageHost = window.location.hostname;

  if (loopbackHosts.has(apiUrl.hostname) && !loopbackHosts.has(pageHost)) {
    apiUrl.hostname = pageHost;
  }

  return apiUrl.toString().replace(/\/$/, "");
}
