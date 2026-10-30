import { createAppConfig } from "@plugga/config/eslint";

export default [
  { ignores: [".next/**", ".next-dev/**", ".next-ds/**", "dist/**", ".turbo/**"] },
  ...createAppConfig({ app: "web" }),
];
