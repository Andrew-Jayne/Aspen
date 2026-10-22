import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const result = await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  write: false,
});

const banner = `/**
  Aspen: Application State Persistence Event Network @ ${packageJson.version}
 * @source ${packageJson.repository.url}
 * @license ${packageJson.license}
 * @commit ${execSync("git rev-parse --short HEAD").toString().trim()}
 */`;

if (result.outputFiles[0] !== undefined) {
  writeFileSync("dist/aspen.min.js", `${banner}\n${result.outputFiles[0].text}`);
  console.log("dist/aspen.min.js written");
} else {
  console.error("esbuild failed to build");
}
