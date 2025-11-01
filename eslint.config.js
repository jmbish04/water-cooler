import js from "@eslint/js";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

const tsconfigRootDir = new URL(".", import.meta.url).pathname;

const reactFlatConfigs = reactPlugin.configs?.flat ?? {};
const jsxA11yFlatConfigs = jsxA11yPlugin.flatConfigs ?? jsxA11yPlugin.configs?.flat ?? {};

const baseExtends = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  reactFlatConfigs.recommended,
  reactFlatConfigs["jsx-runtime"],
  jsxA11yFlatConfigs.recommended ?? jsxA11yFlatConfigs.strict,
].filter(Boolean);

const commonRules = {
  "no-console": ["warn", { allow: ["info", "warn", "error"] }],
  "@typescript-eslint/explicit-function-return-type": "off",
  "@typescript-eslint/no-misused-promises": "off",
  "@typescript-eslint/no-floating-promises": "off",
  "@typescript-eslint/prefer-nullish-coalescing": "off",
  "@typescript-eslint/ban-ts-comment": "off",
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/array-type": "off",
  "@typescript-eslint/no-inferrable-types": "off",
  "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  "@typescript-eslint/no-unnecessary-type-assertion": "off",
  "@typescript-eslint/no-unsafe-assignment": "off",
  "@typescript-eslint/no-unsafe-member-access": "off",
  "@typescript-eslint/no-unsafe-call": "off",
  "@typescript-eslint/no-unsafe-return": "off",
  "@typescript-eslint/no-unsafe-argument": "off",
  "@typescript-eslint/no-base-to-string": "off",
  "@typescript-eslint/restrict-template-expressions": "off",
  "prefer-const": "off",
  "@typescript-eslint/no-empty-function": "off",
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "warn",
  "react/react-in-jsx-scope": "off",
};

export default tseslint.config(
  {
    ignores: [
      "dist",
      "ui/dist",
      "node_modules",
      ".wrangler",
      "coverage",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}", "ui/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir,
        sourceType: "module",
        ecmaVersion: "latest",
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    extends: baseExtends,
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: commonRules,
  }
);
