const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

function parseUrl(rawUrl: string | undefined, variableName: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    throw new Error(`LOCAL TEST requires a valid ${variableName}`);
  }
}

export function assertSafeTestDatabaseUrl(rawUrl: string, ci = false): void {
  const url = parseUrl(rawUrl, "DATABASE_URL");

  const port = url.port || "5432";
  const allowedPorts = ci ? new Set(["55432", "55433"]) : new Set(["55433"]);

  if (
    url.protocol !== "postgresql:" ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.pathname !== "/plugga_os_test" ||
    !allowedPorts.has(port)
  ) {
    throw new Error(
      "Refusing database-backed test: LOCAL TEST must use plugga_os_test on loopback port 55433 (CI may use 55432)",
    );
  }
}

export function assertSafeTestRedisUrl(rawUrl: string | undefined): void {
  const url = parseUrl(rawUrl, "REDIS_URL");

  if (
    !["redis:", "rediss:"].includes(url.protocol) ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    (url.port || "6379") !== "56380"
  ) {
    throw new Error(
      "Refusing Redis-backed test: LOCAL TEST must use Redis on loopback port 56380",
    );
  }
}

export function assertSafeTestStorageEndpoint(rawUrl: string | undefined): void {
  const url = parseUrl(rawUrl, "STORAGE_ENDPOINT");

  if (
    !["http:", "https:"].includes(url.protocol) ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.port !== "59002"
  ) {
    throw new Error(
      "Refusing storage-backed test: LOCAL TEST must use the isolated storage on loopback port 59002",
    );
  }
}
