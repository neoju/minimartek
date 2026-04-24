/** @type {import('jest').Config} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^bullmq$": "<rootDir>/__mocks__/bullmq.ts",
    "^@/(.*)\\.js$": "<rootDir>/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@repo/dto$": "<rootDir>/../../packages/dto/src/index.ts",
    "^@repo/utils$": "<rootDir>/../../packages/utils/src/index.ts",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "ESNext",
          target: "ES2022",
          moduleResolution: "Bundler",
          esModuleInterop: true,
          strict: true,
          types: ["node", "jest"],
        },
      },
    ],
  },
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/index.ts"],
};
