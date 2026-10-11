import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: { "react-refresh/only-export-components": "warn" },
  },
);
