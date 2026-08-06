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
            patterns: [{
              regex: boundaryPattern(layer),
              message: "Respect ADR-0001: applications communicate through HTTP and @plugga/shared; packages never import applications.",
            }],
          },
        ],
      },
    },
  );
}

export function createAppConfig({ app }) {
  return createConfig(app, app === "web" ? "browser" : "node");
}

export function createPackageConfig() {
  return createConfig("package", "node");
}
