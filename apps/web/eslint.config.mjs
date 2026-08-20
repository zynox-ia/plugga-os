import { createAppConfig } from "@plugga/config/eslint";

export default [
  { ignores: [".next/**", ".next-dev/**", "dist/**", ".turbo/**"] },
  ...createAppConfig({ app: "web" }),
];
