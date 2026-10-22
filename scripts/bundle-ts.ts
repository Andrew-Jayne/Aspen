import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

function stripImports(source: string): string {
  // strip comments and import statements (only works for single line imports becasuse skill issue)
  return source
    .split("\n")
    .filter((line) => line.startsWith("import ") === false)
    .filter((line) => line.startsWith("// ") === false)
    .join("\n")
    .trim();
}

// this is an fstring build of the source without imports, kinda jank lol
const BUNDLE = `\
/**
  Aspen: Application State Persistence Event Network @ ${packageJson.version}
 * @source ${packageJson.repository.url}
 * @license ${packageJson.license}
 * @commit ${execSync("git rev-parse --short HEAD").toString().trim()}
 */

${stripImports(readFileSync("src/types.ts", "utf8"))}

${stripImports(readFileSync("src/storage.ts", "utf8"))}

${stripImports(readFileSync("src/seralize.ts", "utf8"))}

${stripImports(readFileSync("src/validation.ts", "utf8"))}

${stripImports(readFileSync("src/stateTree.ts", "utf8"))}
`;

writeFileSync("dist/aspen.ts", BUNDLE);
console.log("dist/aspen.ts written");
