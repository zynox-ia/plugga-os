import { createPackageConfig } from "@plugga/config/eslint";

export default [
  { ignores: ["referencia/**"] },
  ...createPackageConfig(),
];
