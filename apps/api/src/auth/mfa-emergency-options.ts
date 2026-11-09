export function parseEmergencyMfaArgs(args: string[]): { userId: string; reason: string; authorization: string } {
  const options = new Map<string, string>();
  const allowed = new Set(["--user", "--reason", "--authorization"]);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]!, value = args[index + 1];
    if (!allowed.has(key) || options.has(key) || !value) throw new Error("Parâmetros de emergência inválidos.");
    options.set(key, value);
  }
  const userId = options.get("--user"), reason = options.get("--reason")?.trim(), authorization = options.get("--authorization");
  if (!userId || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(userId) || !reason || reason.length < 10 || reason.length > 500 || authorization !== "AUTORIZADO_PELO_ANDRE") throw new Error("Autorização operacional e parâmetros válidos são necessários.");
  return { userId, reason, authorization };
}
