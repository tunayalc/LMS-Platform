module.exports = {
  root: true,
  ignorePatterns: [
    "node_modules",
    "dist",
    "build",
    ".next",
    "coverage",
    "android",
    "ios",
    ".expo",
    ".expo-shared"
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  env: {
    es2022: true,
    node: true
  },
  overrides: [
    {
      files: ["apps/web/**/*.{ts,tsx}", "apps/mobile/**/*.{ts,tsx}"],
      env: {
        browser: true
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    }
  ]
};
