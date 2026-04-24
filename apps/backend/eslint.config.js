import { config as baseConfig } from "@repo/eslint-config/base";

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: ["dist", "coverage", "node_modules", "migrations/**", "seeds/**"],
  },
];
