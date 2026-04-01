import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  outExtension: () => ({ js: ".mjs" }),
  banner: { js: "#!/usr/bin/env node" },
  target: "node20",
  clean: true,
  splitting: false,
  // Don't bundle node_modules deps — they'll be installed by npm
  noExternal: [],
});
