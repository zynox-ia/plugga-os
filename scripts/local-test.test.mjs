import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildFlaggedTestEnvironment } from "../apps/api/scripts/run-flagged-test.mjs";
import {
  CommandFailure,
  DockerTargetSafetyError,
  runLocalTestAction,
} from "./local-test.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const localDockerTarget = () => ({
  contextName: "desktop-linux",
  endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
});

function createRunner(fail) {
  const calls = [];
  const runner = (command, args, env) => {
    const call = { command, args, env };
    calls.push(call);
    const exitCode = fail?.(call, calls.length);
    if (exitCode) throw new CommandFailure(exitCode);
  };

  return { calls, runner };
}

function isComposeDown(call) {
  return (
    call.command === "docker" &&
    call.args.at(-3) === "down" &&
    call.args.at(-2) === "--volumes" &&
    call.args.at(-1) === "--remove-orphans"
  );
}

test("Local Dev Compose defaults avoid the known production tunnel ports", () => {
  const compose = readFileSync(path.join(root, "compose.yaml"), "utf8");

  assert.match(compose, /\$\{POSTGRES_PORT:-55432\}:5432/);
  assert.match(compose, /\$\{REDIS_PORT:-56379\}:6379/);
  assert.match(compose, /\$\{STORAGE_PORT:-\$\{MINIO_PORT:-59000\}\}:8333/);
  assert.match(
    compose,
    /\$\{STORAGE_ADMIN_PORT:-\$\{MINIO_CONSOLE_PORT:-59001\}\}:23646/,
  );
});

test("migrate-from-zero removes the dedicated stack and volumes after success", () => {
  const { calls, runner } = createRunner();

  runLocalTestAction("migrate-from-zero", runner, localDockerTarget);

  assert.equal(isComposeDown(calls[0]), true);
  assert.equal(isComposeDown(calls.at(-1)), true);
  assert.match(calls.at(-1).args[6], /compose\.test\.yaml$/);
  assert.match(
    readFileSync(path.join(root, "compose.test.yaml"), "utf8"),
    /^name: plugga-os-local-test$/m,
  );
});

test("migrate-from-zero cleans up after failure and preserves the first exit code", () => {
  let downCount = 0;
  const { calls, runner } = createRunner((call) => {
    if (isComposeDown(call)) {
      downCount += 1;
      return downCount === 2 ? 41 : undefined;
    }

    return call.args.includes("db:seed") ? 37 : undefined;
  });

  assert.throws(
    () => runLocalTestAction("migrate-from-zero", runner, localDockerTarget),
    (error) => error instanceof CommandFailure && error.exitCode === 37,
  );
  assert.equal(isComposeDown(calls.at(-1)), true);
});

test("Compose commands ignore a hostile project name and stay bound to Local Test", () => {
  const { calls, runner } = createRunner();
  const inspector = (environment) => {
    assert.equal("COMPOSE_PROJECT_NAME" in environment, false);
    assert.equal("DOCKER_CONTEXT" in environment, false);
    assert.equal("DOCKER_HOST" in environment, false);
    environment.COMPOSE_PROJECT_NAME = "reintroduced-project";
    environment.DOCKER_CONTEXT = "reintroduced-context";
    environment.DOCKER_HOST = "tcp://production.example.invalid:2375";
    return localDockerTarget();
  };

  runLocalTestAction("down", runner, inspector, {
    COMPOSE_PROJECT_NAME: "production-stack",
  });

  assert.deepEqual(calls[0].args, [
    "--context",
    "desktop-linux",
    "compose",
    "--project-name",
    "plugga-os-local-test",
    "-f",
    path.join(root, "compose.test.yaml"),
    "down",
    "--volumes",
    "--remove-orphans",
  ]);
  assert.equal("COMPOSE_PROJECT_NAME" in calls[0].env, false);
  assert.equal("DOCKER_CONTEXT" in calls[0].env, false);
  assert.equal("DOCKER_HOST" in calls[0].env, false);
});

test("local npipe and unix Docker endpoints are accepted", () => {
  for (const endpoint of [
    "npipe:////./pipe/dockerDesktopLinuxEngine",
    "unix:///var/run/docker.sock",
  ]) {
    const { calls, runner } = createRunner();
    runLocalTestAction(
      "down",
      runner,
      () => ({ contextName: "local-test", endpoint }),
      {},
    );
    assert.equal(calls.length, 1);
  }
});

test("remote, empty, and malformed Docker endpoints fail before any command", () => {
  for (const endpoint of [
    "tcp://127.0.0.1:2375",
    "ssh://production.example.invalid",
    "unix://remote.example.invalid/var/run/docker.sock",
    "not-a-docker-endpoint",
    "",
  ]) {
    const { calls, runner } = createRunner();
    assert.throws(
      () =>
        runLocalTestAction(
          "down",
          runner,
          () => ({ contextName: "unsafe", endpoint }),
          {},
        ),
      DockerTargetSafetyError,
    );
    assert.equal(calls.length, 0);
  }
});

test("failed Docker context inspection stops before any command", () => {
  const { calls, runner } = createRunner();
  assert.throws(
    () =>
      runLocalTestAction(
        "down",
        runner,
        () => {
          throw new DockerTargetSafetyError("inspection failed");
        },
        {},
      ),
    /inspection failed/,
  );
  assert.equal(calls.length, 0);
});

test("empty Docker context inspection stops before any command", () => {
  const { calls, runner } = createRunner();
  assert.throws(
    () =>
      runLocalTestAction(
        "down",
        runner,
        () => ({ contextName: "", endpoint: "unix:///var/run/docker.sock" }),
        {},
      ),
    /context is empty/,
  );
  assert.equal(calls.length, 0);
});

test("explicit Docker host or context overrides stop before inspection and commands", () => {
  for (const [name, value] of [
    ["DOCKER_HOST", "tcp://production.example.invalid:2375"],
    ["DOCKER_CONTEXT", "production"],
  ]) {
    const { calls, runner } = createRunner();
    let inspected = false;
    assert.throws(
      () =>
        runLocalTestAction(
          "down",
          runner,
          () => {
            inspected = true;
            return localDockerTarget();
          },
          { [name]: value },
        ),
      new RegExp(name),
    );
    assert.equal(inspected, false);
    assert.equal(calls.length, 0);
  }
});

test("migrate-from-zero pins test-only seed settings over hostile ambient values", () => {
  const { calls, runner } = createRunner();
  runLocalTestAction("migrate-from-zero", runner, localDockerTarget, {
    SEED_ADMIN_EMAIL: "production-admin@example.com",
    SEED_ADMIN_PASSWORD: "production-password",
    SEED_SAMPLE_TEAM: "true",
  });

  const seedCall = calls.find((call) => call.args.includes("db:seed"));
  assert.equal(seedCall.env.SEED_ADMIN_EMAIL, "admin@plugga.test");
  assert.equal(
    seedCall.env.SEED_ADMIN_PASSWORD,
    "local_test_only_seed_password_change_me",
  );
  assert.equal(seedCall.env.SEED_SAMPLE_TEAM, "false");
});

test("storage integration overrides developer targets with dedicated test values", () => {
  const environment = buildFlaggedTestEnvironment(
    "RUN_STORAGE_INTEGRATION_TESTS",
    {
      DATABASE_URL: "postgresql://production-tunnel@127.0.0.1:5432/plugga_os",
      REDIS_URL: "redis://127.0.0.1:6379",
      STORAGE_ENDPOINT: "http://127.0.0.1:9000",
      STORAGE_BUCKET: "production-bucket",
      STORAGE_ACCESS_KEY: "developer-key",
      STORAGE_SECRET_KEY: "developer-secret",
    },
  );

  assert.match(environment.DATABASE_URL, /127\.0\.0\.1:55433\/plugga_os_test/);
  assert.equal(environment.REDIS_URL, "redis://127.0.0.1:56380");
  assert.equal(environment.STORAGE_ENDPOINT, "http://127.0.0.1:59002");
  assert.equal(environment.STORAGE_BUCKET, "plugga-faturas-test");
  assert.equal(environment.STORAGE_ACCESS_KEY, "plugga_os_test");
  assert.equal(
    environment.STORAGE_SECRET_KEY,
    "local_test_storage_only_change_me",
  );
  assert.equal(environment.RUN_STORAGE_INTEGRATION_TESTS, "true");
});

test("jobs integration forces the Local Test database and Redis targets", () => {
  const environment = buildFlaggedTestEnvironment("RUN_JOBS_INTEGRATION_TESTS", {
    DATABASE_URL: "postgresql://production-tunnel@127.0.0.1:5432/plugga_os",
    REDIS_URL: "redis://127.0.0.1:6379",
  });

  assert.match(environment.DATABASE_URL, /127\.0\.0\.1:55433\/plugga_os_test/);
  assert.equal(environment.REDIS_URL, "redis://127.0.0.1:56380");
  assert.equal(environment.RUN_JOBS_INTEGRATION_TESTS, "true");
});

test("CI keeps its explicit ephemeral service targets for separate validation", () => {
  const ciDatabaseUrl =
    "postgresql://plugga_os_test:ci_only@127.0.0.1:55432/plugga_os_test";
  const environment = buildFlaggedTestEnvironment("RUN_DATABASE_INTEGRATION_TESTS", {
    CI: "true",
    DATABASE_URL: ciDatabaseUrl,
    REDIS_URL: "redis://127.0.0.1:56380",
  });

  assert.equal(environment.DATABASE_URL, ciDatabaseUrl);
  assert.equal(environment.REDIS_URL, "redis://127.0.0.1:56380");
});
