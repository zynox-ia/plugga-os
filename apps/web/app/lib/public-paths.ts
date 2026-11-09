const PUBLIC_PATHS = ["/login", "/auth/accept-invite", "/auth/reset", "/privacidade", "/termos"];

/** Public background assets and pages except login do not need a session lookup. */
export function shouldBypassSessionCheck(pathname: string): boolean {
  return pathname.startsWith("/backgrounds/") || (pathname !== "/login" && PUBLIC_PATHS.includes(pathname));
}
