import eslint from "@eslint/js";

export default [
  { ignores: ["dist", "src/**/*.{ts,tsx}"] },
  eslint.configs.recommended,
];
