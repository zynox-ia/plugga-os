import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function buildFlaggedTestEnvironment(flag, sourceEnvironment = process.env) {
  const localTestServices =
    sourceEnvironment.CI === "true"
      ? {}
      : {
          DATABASE_URL:
            "postgresql://plugga_os_test:local_test_only_change_me@127.0.0.1:55433/plugga_os_test?schema=public",
          REDIS_URL: "redis://127.0.0.1:56380",
        };

  return {
    ...sourceEnvironment,
    ...localTestServices,
    ...(flag === "RUN_STORAGE_INTEGRATION_TESTS"
      ? {
          STORAGE_ENDPOINT: "http://127.0.0.1:59002",
          STORAGE_ACCESS_KEY: "plugga_os_test",
          STORAGE_SECRET_KEY: "local_test_storage_only_change_me",
        }
      : {}),
    [flag]: "true",
  };
}

function main() {
  const [flag, ...testFiles] = process.argv.slice(2);

  if (!/^RUN_[A-Z_]+_INTEGRATION_TESTS$/.test(flag ?? "") || testFiles.length === 0) {
    console.error(
      "Usage: node scripts/run-flagged-test.mjs RUN_<NAME>_INTEGRATION_TESTS <test-file> [...test-files]",
    );
    return 2;
  }

  if (!process.env.npm_execpath) {
    console.error("This script must be invoked through pnpm.");
    return 2;
  }

  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, "exec", "vitest", "run", ...testFiles],
    {
      cwd: process.cwd(),
      env: buildFlaggedTestEnvironment(flag),
      stdio: "inherit",
      shell: false,
    },
  );

  if (result.error) throw result.error;
  return result.status ?? 1;
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  process.exitCode = main();
}
