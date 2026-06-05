const types = await Bun.file("src/types.ts").text();
const storage = await Bun.file("src/storage.ts").text();
const serialize = await Bun.file("src/seralize.ts").text();
const validation = await Bun.file("src/validation.ts").text();
const stateTree = await Bun.file("src/stateTree.ts").text();

function stripImports(source: string): string {
  return source
    .split("\n")
    .filter((line) => line.startsWith("import ") === false)
    .join("\n")
    .trim();
}

const bundle = `// Aspen — Application State Persistence Event Network
// Single-file TypeScript bundle — drop into your project and import directly.
// https://github.com/Andrew-Jayne/Aspen
// AGPL-3.0

${stripImports(types)}

${stripImports(storage)}

${stripImports(serialize)}

${stripImports(validation)}

${stripImports(stateTree)}
`;

await Bun.write("dist/aspen.ts", bundle);
console.log("dist/aspen.ts written");
