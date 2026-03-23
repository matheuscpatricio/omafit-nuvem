import { defineConfig } from "tsup";

const shared = {
  platform: "browser",
  target: "esnext",
  minify: true,
  bundle: true,
  noExternal: [/.*/],
  sourcemap: false,
  splitting: false,
  skipNodeModulesBundle: false,
  esbuildOptions(options) {
    options.alias = {
      "@tiendanube/nube-sdk-jsx/dist/jsx-runtime": "@tiendanube/nube-sdk-jsx/jsx-runtime",
    };
    options.packages = "bundle";
  },
  outExtension: ({ options }) => ({
    js: options.minify ? ".min.js" : ".js"
  }),
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main.tsx", "src/admin.tsx", "src/home.ts", "src/widget.tsx"],
    format: ["esm"],
    clean: true,
  },
  {
    ...shared,
    entry: ["src/storefront-legacy.ts"],
    format: ["iife"],
    globalName: "OmafitLegacyStorefront",
    clean: false,
  },
]);
