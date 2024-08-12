import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts", "cli.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});