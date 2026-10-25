import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const toolchain = process.env.WWPLAYER_DISC_TOOLCHAIN || "E:/codexwork/.toolchains/mpv-win64";
const sources = process.env.WWPLAYER_DISC_SOURCES || path.join(toolchain, "configure-sources");
const output = path.resolve(process.env.WWPLAYER_DISC_READER_BUILD
  || path.join(root, "build/disc-reader"));
const bash = path.join(toolchain, "msys64/usr/bin/bash.exe");
const cross = path.join(toolchain, "configure-check/meson_cross.txt");
const sdk = path.join(output, "sdk");
const dependencies = path.join(output, "dependencies");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "vendor/disc-reader/source-manifest.json"), "utf8"));
const executable = path.join(output, "WWPlayerDiscReader.exe");
const posix = (value) => value.replaceAll("\\", "/").replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const quote = (value) => `'${posix(value).replaceAll("'", "'\\''")}'`;

if (!fs.existsSync(bash) || !fs.existsSync(cross)) {
  throw new Error("Set WWPLAYER_DISC_TOOLCHAIN to the existing MinGW/MSYS2 toolchain and cross file.");
}
fs.mkdirSync(dependencies, { recursive: true });
const environment = `export PATH=${quote(path.join(toolchain, "meson-1.11-venv/bin"))}:${quote(path.join(toolchain, "install/bin"))}:$PATH; export PKG_CONFIG_LIBDIR=${quote(path.join(sdk, "lib/pkgconfig"))}`;
const exportedSources = {};
for (const [library, fixed] of Object.entries(manifest).filter(([, value]) => value?.commit)) {
  const source = path.join(sources, library);
  const commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
  if (commit !== fixed.commit) throw new Error(`${library} source does not match the disc-reader manifest.`);
  // Export the selected Git tree, not a possibly modified development checkout
  // or an unproved library with the same version in the old shared SDK.
  const exported = path.join(dependencies, `${library}-${fixed.commit}`);
  const archive = `${exported}.tar`;
  fs.mkdirSync(exported, { recursive: true });
  execFileSync("git", ["-c", "core.autocrlf=false", "-C", source, "archive", "--format=tar", "-o", archive, fixed.commit],
    { stdio: "inherit", windowsHide: true });
  execFileSync(bash, ["-lc", `tar -xf ${quote(archive)} -C ${quote(exported)}`],
    { stdio: "inherit", windowsHide: true });
  if (!fs.existsSync(path.join(exported, "COPYING"))) throw new Error(`${library} distribution license is missing.`);
  exportedSources[library] = exported;
}
for (const library of ["libudfread", "libbluray"]) {
  const build = path.join(dependencies, `${library}-build-${manifest[library].commit}`);
  const reconfigure = fs.existsSync(path.join(build, "meson-private/coredata.dat")) ? "--reconfigure" : "";
  const options = library === "libbluray"
    ? "-Denable_tools=false -Denable_examples=false -Denable_devtools=false -Dbdj_jar=disabled -Dfreetype=disabled -Dfontconfig=disabled -Dlibxml2=disabled" : "";
  const setup = `meson setup ${reconfigure} ${quote(build)} ${quote(exportedSources[library])} --prefix=${quote(sdk)} --libdir=lib --cross-file=${quote(cross)} --buildtype=release --default-library=shared --wrap-mode=nodownload ${options}`;
  execFileSync(bash, ["-lc", `${environment}; ${setup} && ninja -C ${quote(build)} && ninja -C ${quote(build)} install`],
    { stdio: "inherit", windowsHide: true });
}
for (const library of ["libbluray", "libudfread"]) {
  const version = execFileSync(bash, ["-lc", `${environment}; x86_64-w64-mingw32-pkg-config --modversion ${library}`],
    { encoding: "utf8", windowsHide: true }).trim();
  if (version !== manifest[library].version) throw new Error(`${library} SDK version does not match the fixed manifest.`);
}
const compile = [
  "x86_64-w64-mingw32-g++ -std=c++17 -O2 -s -Wall -Wextra -Werror",
  "-ffunction-sections -fdata-sections -Wl,--gc-sections -static-libgcc -static-libstdc++ -pthread",
  quote(path.join(root, "tools/DiscReader/main.cpp")), "-o", quote(executable),
  "$(x86_64-w64-mingw32-pkg-config --cflags --libs libbluray libudfread)",
  "-Wl,-Bstatic -lwinpthread -Wl,-Bdynamic",
].join(" ");
execFileSync(bash, ["-lc", `${environment}; ${compile}`], { stdio: "inherit", windowsHide: true });
const libraries = fs.readdirSync(path.join(sdk, "bin")).filter((name) => /\.dll$/i.test(name));
if (!libraries.some((name) => /bluray/i.test(name)) || !libraries.some((name) => /udfread/i.test(name))) {
  throw new Error("Disc reader must provide replaceable LGPL shared libraries.");
}
for (const name of libraries) fs.copyFileSync(path.join(sdk, "bin", name), path.join(output, name));
const imports = execFileSync(bash, ["-lc", `set -o pipefail; /usr/bin/objdump -p ${quote(executable)} | sed -n '/DLL Name:/p'`],
  { encoding: "utf8", windowsHide: true });
for (const library of ["bluray", "udfread"]) {
  if (!new RegExp(`DLL Name:.*${library}`, "i").test(imports)) throw new Error(`Disc reader statically links ${library}.`);
}
const identity = JSON.parse(execFileSync(executable, ["--version"], { encoding: "utf8", windowsHide: true }));
if (identity.protocolVersion !== manifest.protocolVersion
  || identity.libbluray !== manifest.libbluray.version || identity.libudfread !== manifest.libudfread.version) {
  throw new Error("The built disc reader does not contain the selected library versions.");
}
for (const library of ["libbluray", "libudfread"]) {
  fs.copyFileSync(path.join(exportedSources[library], "COPYING"), path.join(output, `COPYING.${library}`));
}
fs.writeFileSync(path.join(output, "runtime.json"), `${JSON.stringify({ ...identity,
  executable: path.basename(executable), linking: "shared", libraries,
  sources: manifest }, null, 2)}\n`);
console.log(`Disc reader built: ${executable}`);
