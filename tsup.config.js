import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.tsx", "src/admin.tsx", "src/home.ts"],
  format: ["esm"],
  platform: "browser",
  target: "esnext",
  clean: true,
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
  })
});
