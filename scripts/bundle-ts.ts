const packageJson = await Bun.file("package.json").json();

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
 * @commit ${(await Bun.$`git rev-parse --short HEAD`.text()).trim()}
 */

${stripImports(await Bun.file("src/types.ts").text())}

${stripImports(await Bun.file("src/storage.ts").text())}

${stripImports(await Bun.file("src/seralize.ts").text())}

${stripImports(await Bun.file("src/validation.ts").text())}

${stripImports(await Bun.file("src/stateTree.ts").text())}
`;

await Bun.write("dist/aspen.ts", BUNDLE);
console.log("dist/aspen.ts written");
