import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    // TODO: New React Compiler rules enabled by eslint-config-next 16.
    // Disabled to keep the dependency upgrade behavior-neutral; address the
    // flagged setState-in-effect / impure-render patterns in a follow-up.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default eslintConfig;
