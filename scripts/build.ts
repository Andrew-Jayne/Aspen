const gitSha = (await Bun.$`git rev-parse --short HEAD`.text()).trim();

const packageJson = await Bun.file("package.json").json();
const version = packageJson.version;
const license = packageJson.license;
const repository = packageJson.repository.url;

const banner = `/**
 * Aspen v${version}
 * ${repository}
 * @license ${license}
 * @commit ${gitSha}
 */`;

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  minify: true,
});

const minified = await result.outputs[0].text();
await Bun.write("dist/aspen.min.js", `${banner}\n${minified}`);
console.log("dist/aspen.min.js written");
