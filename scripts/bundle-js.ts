const packageJson = await Bun.file("package.json").json();
const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  minify: true,
});

const banner = `/**
  Aspen: Application State Persistence Event Network @ ${packageJson.version}
 * @source ${packageJson.repository.url}
 * @license ${packageJson.license}
 * @commit ${(await Bun.$`git rev-parse --short HEAD`.text()).trim()}
 */`;

if (result.outputs[0] !== undefined) {
  await Bun.write(
    "dist/aspen.min.js",
    `${banner}\n${await result.outputs[0].text()}`,
  );
  console.log("dist/aspen.min.js written");
} else {
  console.error("Bun failed to build");
}
