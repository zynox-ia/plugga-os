import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = path.join(root, "compose.test.yaml");
const action = process.argv[2];
const validActions = new Set(["up", "down", "reset", "migrate-from-zero"]);

function run(command, args, env = process.env) {
  const usesPnpmCli = command === "pnpm" && env.npm_execpath;
  const executable = usesPnpmCli ? process.execPath : command;
  const executableArgs = usesPnpmCli ? [env.npm_execpath, ...args] : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new CommandFailure(result.status ?? 1);
  }
}

export class CommandFailure extends Error {
  constructor(exitCode) {
    super(`Command failed with exit code ${exitCode}`);
    this.exitCode = exitCode;
  }
}

export class DockerTargetSafetyError extends Error {}

function sanitizedDockerEnvironment(sourceEnvironment) {
  const composeEnvironment = { ...sourceEnvironment };
  delete composeEnvironment.COMPOSE_PROJECT_NAME;
  delete composeEnvironment.DOCKER_CONTEXT;
  delete composeEnvironment.DOCKER_HOST;
  return composeEnvironment;
}

function inspectDockerMetadata(args, environment) {
  const result = spawnSync("docker", args, {
    cwd: root,
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  if (result.error || result.status !== 0) {
    throw new DockerTargetSafetyError(
      "Refusing LOCAL TEST: Docker context inspection failed",
    );
  }

  return result.stdout.trim();
}

export function inspectActiveDockerTarget(environment) {
  const contextName = inspectDockerMetadata(["context", "show"], environment);
  if (!contextName) {
    throw new DockerTargetSafetyError(
      "Refusing LOCAL TEST: active Docker context is empty",
    );
  }

  const endpoint = inspectDockerMetadata(
    [
      "context",
      "inspect",
      contextName,
      "--format",
      "{{.Endpoints.docker.Host}}",
    ],
    environment,
  );
  return { contextName, endpoint };
}

function assertLocalDockerEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.trim()) {
    throw new DockerTargetSafetyError(
      "Refusing LOCAL TEST: Docker context endpoint is empty",
    );
  }

  let url;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new DockerTargetSafetyError(
      "Refusing LOCAL TEST: Docker context endpoint is malformed",
    );
  }

  const localUnixSocket =
    url.protocol === "unix:" && url.hostname === "" && url.pathname.length > 1;
  const localNamedPipe =
    url.protocol === "npipe:" &&
    url.hostname === "" &&
    url.pathname.toLowerCase().startsWith("//pipe/") &&
    url.pathname.length > "//pipe/".length;

  if (!localUnixSocket && !localNamedPipe) {
    throw new DockerTargetSafetyError(
      "Refusing LOCAL TEST: Docker context must use a local unix:// or npipe:// endpoint",
    );
  }
}

export function assertSafeDockerTarget(
  sourceEnvironment = process.env,
  targetInspector = inspectActiveDockerTarget,
) {
  for (const variableName of ["DOCKER_HOST", "DOCKER_CONTEXT"]) {
    if (Object.hasOwn(sourceEnvironment, variableName)) {
      throw new DockerTargetSafetyError(
        `Refusing LOCAL TEST: explicit ${variableName} is not allowed`,
      );
    }
  }

  const inspectionEnvironment = sanitizedDockerEnvironment(sourceEnvironment);
  const target = targetInspector(inspectionEnvironment);
  if (
    !target ||
    typeof target.contextName !== "string" ||
    !target.contextName.trim()
  ) {
    throw new DockerTargetSafetyError(
      "Refusing LOCAL TEST: active Docker context is empty",
    );
  }

  const contextName = target.contextName.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(contextName)) {
    throw new DockerTargetSafetyError(
      "Refusing LOCAL TEST: active Docker context is malformed",
    );
  }

  assertLocalDockerEndpoint(target.endpoint);
  return {
    contextName,
    endpoint: target.endpoint.trim(),
    environment: sanitizedDockerEnvironment(inspectionEnvironment),
  };
}

export function buildLocalTestEnvironment(sourceEnvironment = process.env) {
  return {
    ...sourceEnvironment,
    NODE_ENV: "test",
    CI: sourceEnvironment.CI || "false",
    DATABASE_URL:
      "postgresql://plugga_os_test:local_test_only_change_me@127.0.0.1:55433/plugga_os_test?schema=public",
    REDIS_URL: "redis://127.0.0.1:56380",
    DEV_AUTH_ENABLED: "true",
    AUTH_SESSION_SECRET: "local_test_only_session_secret_change_me_please",
    EMAIL_PROVIDER: "noop",
    SEED_ADMIN_EMAIL: "admin@plugga.test",
    SEED_ADMIN_PASSWORD: "local_test_only_seed_password_change_me",
    SEED_SAMPLE_TEAM: "false",
  };
}

export function runLocalTestAction(
  requestedAction,
  commandRunner = run,
  targetInspector = inspectActiveDockerTarget,
  sourceEnvironment = process.env,
) {
  if (!validActions.has(requestedAction)) {
    console.error(
      "Usage: node scripts/local-test.mjs <up|down|reset|migrate-from-zero>",
    );
    throw new CommandFailure(2);
  }

  const dockerTarget = assertSafeDockerTarget(sourceEnvironment, targetInspector);
  const testEnvironment = buildLocalTestEnvironment(sourceEnvironment);

  function compose(...args) {
    commandRunner(
      "docker",
      [
        "--context",
        dockerTarget.contextName,
        "compose",
        "--project-name",
        "plugga-os-local-test",
        "-f",
        composeFile,
        ...args,
      ],
      dockerTarget.environment,
    );
  }

  function down() {
    compose("down", "--volumes", "--remove-orphans");
  }

  function up() {
    compose(
      "up",
      "-d",
      "--wait",
      "postgres-test",
      "redis-test",
      "seaweedfs-test",
    );
    compose("run", "--rm", "seaweedfs-test-provision");
  }

  function migrate() {
    commandRunner(
      "pnpm",
      ["--filter", "@plugga/api", "db:migrate:deploy"],
      testEnvironment,
    );
  }

  switch (requestedAction) {
    case "up":
      up();
      break;
    case "down":
      down();
      break;
    case "reset":
      down();
      up();
      migrate();
      break;
    case "migrate-from-zero": {
      let failure;

      try {
        down();
        up();
        migrate();
        commandRunner(
          "pnpm",
          ["--filter", "@plugga/api", "db:seed"],
          testEnvironment,
        );
        commandRunner("pnpm", ["test:db"], testEnvironment);
      } catch (error) {
        failure = error;
      } finally {
        try {
          down();
        } catch (cleanupError) {
          failure ??= cleanupError;
        }
      }

      if (failure) throw failure;
      break;
    }
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  try {
    runLocalTestAction(action);
  } catch (error) {
    if (error instanceof CommandFailure) {
      process.exitCode = error.exitCode;
    } else if (error instanceof DockerTargetSafetyError) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
