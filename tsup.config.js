import { defineConfig } from "tsup";

const SUPABASE_URL_FALLBACK = "https://lhkgnirolvbmomeduoaj.supabase.co";
const SUPABASE_ANON_KEY_FALLBACK =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxoa2duaXJvbHZibW9tZWR1b2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NjE2NDYsImV4cCI6MjA2MzMzNzY0Nn0.aSBMJMT8TiAqvdO_Z9D_oINLaQrFMZIK5IEQJG6KaOI";

function viteEnvDefines() {
	const json = (value) => JSON.stringify(value || "");
	return {
		"import.meta.env.DEV": "false",
		"import.meta.env.PROD": "true",
		"import.meta.env.MODE": '"production"',
		"import.meta.env.SSR": "false",
		"import.meta.env.VITE_SUPABASE_URL": json(
			process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || SUPABASE_URL_FALLBACK,
		),
		"import.meta.env.VITE_SUPABASE_ANON_KEY": json(
			process.env.VITE_SUPABASE_ANON_KEY ||
				process.env.SUPABASE_ANON_KEY ||
				SUPABASE_ANON_KEY_FALLBACK,
		),
		"import.meta.env.VITE_OMAFIT_APP_URL": json(
			process.env.VITE_OMAFIT_APP_URL ||
				process.env.NUVEMSHOP_APP_URL ||
				process.env.OMAFIT_APP_URL ||
				"",
		),
		"import.meta.env.VITE_OMAFIT_WIDGET_HMAC_SECRET": json(
			process.env.VITE_OMAFIT_WIDGET_HMAC_SECRET ||
				process.env.OMAFIT_WIDGET_HMAC_SECRET ||
				"",
		),
		"import.meta.env.VITE_WIDGET_CATALOG_HMAC_SECRET": json(
			process.env.VITE_WIDGET_CATALOG_HMAC_SECRET ||
				process.env.WIDGET_CATALOG_HMAC_SECRET ||
				"",
		),
	};
}

const shared = {
  platform: "browser",
  target: "esnext",
  minify: true,
  bundle: true,
  injectStyle: true,
  noExternal: [/.*/],
  sourcemap: false,
  splitting: false,
  skipNodeModulesBundle: false,
  esbuildOptions(options) {
    options.alias = {
      "@tiendanube/nube-sdk-jsx/dist/jsx-runtime": "@tiendanube/nube-sdk-jsx/jsx-runtime",
    };
    options.loader = {
      ...options.loader,
      ".css": "css",
    };
    options.define = {
      ...options.define,
      ...viteEnvDefines(),
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
    entry: ["src/main.tsx", "src/admin.tsx", "src/home.ts", "src/widget.tsx", "src/widget-footwear.tsx"],
    format: ["esm"],
    clean: false,
  },
]);
