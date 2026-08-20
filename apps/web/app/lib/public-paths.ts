const PUBLIC_PATHS = ["/login", "/auth/accept-invite", "/auth/reset", "/privacidade", "/termos"];

/** Public pages except login do not need a session lookup before rendering. */
export function shouldBypassSessionCheck(pathname: string): boolean {
  return pathname !== "/login" && PUBLIC_PATHS.includes(pathname);
}
