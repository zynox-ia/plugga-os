process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
  "postgresql://plugga_os:local_only_change_me@localhost:5432/plugga_os?schema=public";
process.env.DEV_AUTH_ENABLED = "true";
process.env.LOG_LEVEL = "silent";
process.env.AUTH_SESSION_SECRET ??= "test_only_session_secret_change_me_please";
