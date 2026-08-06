import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const commonIgnores = [
  "**/.next/**",
  "**/coverage/**",
  "**/dist/**",
  "**/next-env.d.ts",
  "**/node_modules/**",
];

function boundaryPattern(layer) {
  if (layer === "web") {
    return String.raw`(^@plugga/api(?:/|$))|(?:^|/)apps/api(?:/|$)|^(?:\.\./)+api(?:/|$)`;
  }

  if (layer === "api") {
    return String.raw`(^@plugga/web(?:/|$))|(?:^|/)apps/web(?:/|$)|^(?:\.\./)+web(?:/|$)`;
  }

  return String.raw`(^@plugga/(?:api|web)(?:/|$))|(?:^|/)apps/(?:api|web)(?:/|$)`;
}

const monorepoBoundaryMessage =
  "Respect ADR-0001: applications communicate through HTTP and @plugga/shared; packages never import applications.";

const prismaServiceBoundary = {
  regex: String.raw`(?:^|/)(?:prisma/)?prisma\.service(?:\.[cm]?[jt]s)?$`,
  message:
    "Respect ADR-0002: only repository implementations may import PrismaService; inject a module public interface elsewhere.",
};

function restrictedImportPatterns(layer) {
  return [
    {
      regex: boundaryPattern(layer),
      message: monorepoBoundaryMessage,
    },
  ];
}

function createConfig(layer, environment) {
  return tseslint.config(
    { ignores: commonIgnores },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
      files: ["**/*.{js,mjs,cjs,ts,tsx}"],
      languageOptions: {
        globals: environment === "browser"
          ? { ...globals.browser, ...globals.es2024, ...globals.node }
          : { ...globals.es2024, ...globals.node },
      },
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: restrictedImportPatterns(layer),
          },
        ],
      },
    },
  );
}

export function createAppConfig({ app }) {
  const config = createConfig(app, app === "web" ? "browser" : "node");

  if (app !== "api") {
    return config;
  }

  return tseslint.config(
    ...config,
    {
      files: ["src/**/*.{ts,tsx}"],
      ignores: [
        "src/**/*repository*.{ts,tsx}",
        "src/prisma/prisma.module.ts",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ...restrictedImportPatterns(app),
              prismaServiceBoundary,
            ],
          },
        ],
      },
    },
  );
}

export function createPackageConfig() {
  return createConfig("package", "node");
}
