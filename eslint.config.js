import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: { globals: globals.browser },
    rules: {
      // Prosedürel dokular tohumlu RNG kullanır; her açılışta aynı görünür.
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "scene/textures.ts içindeki mulberry32 kullan." },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["info", "warn", "error"] }],
    },
  },
);
