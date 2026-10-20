// Copyright (c) 2026 WWPlayer contributors. SPDX-License-Identifier: MIT
// Standalone source-kit entry point: no private WWPlayer modules or helper code.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const argumentsList = process.argv.slice(2);
const action = argumentsList.shift() || "prepare";
const option = (name, fallback = "") => {
  const index = argumentsList.indexOf(`--${name}`);
  return index < 0 ? fallback : argumentsList[index + 1];
};
const root = path.resolve(option("root", path.join(import.meta.dirname, "..")));
const output = path.resolve(option("output", path.join(root, "work")));
const receipt = JSON.parse(fs.readFileSync(path.join(root, "native-build.json"), "utf8"));
const index = JSON.parse(fs.readFileSync(path.join(root, "source-index.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "vendor/mpv/source-manifest.json"), "utf8"));
const sources = path.join(output, "sources");
const sdk = path.resolve(option("ffmpeg-sdk", path.join(output, "sdk")));
const dependencySdk = path.join(output, "dependency-sdk");
const posix = (value) => value.replaceAll("\\", "/").replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const shellPath = (value) => quote(posix(value));
const run = (command, args, options = {}) => execFileSync(command, args, {
  stdio: "inherit", windowsHide: true, ...options,
});

function prepare(name) {
  const source = path.join(sources, name);
  if (fs.existsSync(source)) return source; // User edits to an extracted library are retained.
  const entry = index.entries.find((value) => value.name === name);
  if (!entry) throw new Error(`Missing corresponding source index: ${name}`);
  fs.mkdirSync(source, { recursive: true });
  run("tar", ["-xf", path.join(root, "sources", entry.archive), "-C", source]);
  const applyPatch = (patch) => {
    // An enclosing checkout must not make git apply skip library-relative paths.
    const options = { cwd: source,
      env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(source) } };
    run("git", ["-c", "core.autocrlf=false", "apply", "--check", patch], options);
    run("git", ["-c", "core.autocrlf=false", "apply", patch], options);
  };
  if (name === "ffmpeg") {
    fs.copyFileSync(path.join(root, "sources/FFMPEG-VERSION"), path.join(source, "VERSION"));
    for (const { file } of receipt.ffmpegPatches || []) {
      applyPatch(path.join(root, file));
    }
  }
  if (name === "mpv") {
    for (const patch of manifest.mpv.patches) {
      applyPatch(path.join(root, "vendor/mpv", patch));
    }
  } else if (entry.patch) {
    applyPatch(path.join(root, "sources", entry.patch));
  }
  return source;
}

fs.mkdirSync(sources, { recursive: true });
const components = action === "mpv" ? ["mpv", "libarchive"]
  : action === "ffmpeg" ? ["ffmpeg"] : action === "disc" ? ["libbluray", "libudfread"]
  : ["mpv", "ffmpeg", "libarchive", "libbluray", "libudfread"];
for (const name of components) prepare(name);
if (action === "prepare") {
  console.log(`Editable corresponding sources: ${sources}`);
  process.exit(0);
}
if (!["all", "ffmpeg", "mpv", "disc"].includes(action)) throw new Error("Use prepare, all, ffmpeg, mpv or disc.");
if (receipt.libarchive?.lzo !== false || !receipt.libarchive.options.includes("-DENABLE_LZO=OFF")) {
  throw new Error("This source kit must use the LZO-free libarchive profile.");
}
const toolchain = path.resolve(option("toolchain"));
const dependencyPrefix = path.resolve(option("dependency-prefix", path.join(toolchain, "install/x86_64-w64-mingw32")));
const curlPrefix = path.resolve(option("curl-prefix", dependencyPrefix));
const http2Prefix = path.resolve(option("http2-prefix", curlPrefix));
const bash = path.join(toolchain, "msys64/usr/bin/bash.exe");
if (!fs.existsSync(bash)) throw new Error("Supply --toolchain pointing to the MinGW/MSYS2 toolchain root.");
const compilerDirectory = path.join(toolchain, "install/bin");
const crossFile = path.join(output, "meson-cross.txt");
const tools = {
  c: "gcc", cpp: "g++", as: "gcc", ar: "ar", strip: "strip",
  windres: "windres", pkgconfig: "pkgconf", dlltool: "dlltool",
};
fs.writeFileSync(crossFile, "[binaries]\n"
  + Object.entries(tools).map(([key, name]) => `${key} = '${posix(path.join(compilerDirectory, `x86_64-w64-mingw32-${name}`))}'`).join("\n")
  + "\nnasm = 'nasm'\n\n[host_machine]\nsystem = 'windows'\ncpu_family = 'x86_64'\ncpu = 'x86_64'\nendian = 'little'\n");
const cmakeCross = path.join(output, "mingw-toolchain.cmake");
fs.writeFileSync(cmakeCross, [
  "set(CMAKE_SYSTEM_NAME Windows)", "set(CMAKE_SYSTEM_PROCESSOR x86_64)",
  `set(CMAKE_C_COMPILER "${posix(path.join(compilerDirectory, "x86_64-w64-mingw32-gcc"))}")`,
  `set(CMAKE_CXX_COMPILER "${posix(path.join(compilerDirectory, "x86_64-w64-mingw32-g++"))}")`,
  `set(CMAKE_RC_COMPILER "${posix(path.join(compilerDirectory, "x86_64-w64-mingw32-windres"))}")`,
  `set(CMAKE_FIND_ROOT_PATH "${posix(dependencyPrefix)}")`,
  "set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)", "set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)",
  "set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)", "",
].join("\n"));
const pkgDirectories = [
  path.join(dependencySdk, "lib/pkgconfig"), path.join(sdk, "lib/pkgconfig"),
  path.join(curlPrefix, "lib/pkgconfig"), path.join(dependencyPrefix, "lib/pkgconfig"),
  path.join(http2Prefix, "lib/pkgconfig"),
];
const environment = [
  `export PATH=${shellPath(path.join(toolchain, "meson-1.11-venv/bin"))}:${shellPath(compilerDirectory)}:$PATH`,
  `export PKG_CONFIG_LIBDIR=${quote(pkgDirectories.map(posix).join(":"))}`,
  "export PKG_CONFIG_PATH=",
].join("; ");
const shell = (command) => run(bash, ["-lc", `${environment}; ${command}`]);
const jobs = Math.max(1, Math.min(6, os.availableParallelism()));

function archive() {
  const build = path.join(output, "libarchive-build");
  shell(`cmake -S ${shellPath(prepare("libarchive"))} -B ${shellPath(build)} -G Ninja`
    + ` -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=${shellPath(cmakeCross)}`
    + ` -DCMAKE_INSTALL_PREFIX=${shellPath(dependencySdk)} -DCMAKE_INSTALL_LIBDIR=lib`
    + ` -DCMAKE_POLICY_VERSION_MINIMUM=3.5 ${receipt.libarchive.options.join(" ")}`
    + ` && cmake --build ${shellPath(build)} -j ${jobs} && cmake --install ${shellPath(build)}`);
  const pkg = path.join(dependencySdk, "lib/pkgconfig/libarchive.pc");
  const text = fs.readFileSync(pkg, "utf8");
  if (/\blzo2?\b/i.test(text)) throw new Error("libarchive still links GPL LZO.");
  fs.writeFileSync(pkg, text.replace(/-larchive(?=\s|$)/g, "${libdir}/libarchive.a"));
}

function ffmpeg() {
  const build = path.join(output, "ffmpeg-build");
  fs.mkdirSync(build, { recursive: true });
  const flags = receipt.ffmpegConfigure.map((value) => value.startsWith("--prefix=")
    ? `--prefix=${posix(sdk)}` : value);
  shell(`cd ${shellPath(build)} && ${shellPath(path.join(prepare("ffmpeg"), "configure"))}`
    + ` ${flags.map(quote).join(" ")} && make -j ${jobs} && make install`
    + ` && x86_64-w64-mingw32-strip --strip-all ${shellPath(path.join(sdk, "bin"))}/*.dll`);
}

function mpv() {
  archive();
  for (const name of ["avcodec", "avformat", "avfilter", "avutil", "avdevice", "swresample", "swscale"]) {
    const pkg = path.join(sdk, "lib/pkgconfig", `lib${name}.pc`);
    if (!fs.existsSync(path.join(sdk, "lib", `lib${name}.dll.a`))) throw new Error("Build LGPL FFmpeg first or supply --ffmpeg-sdk.");
    fs.writeFileSync(pkg, fs.readFileSync(pkg, "utf8").replace(new RegExp(`-l${name}(?=\\s|$)`, "g"), `\${libdir}/lib${name}.dll.a`));
  }
  const build = path.join(output, "mpv-build");
  const setup = ["meson", "setup", ...(fs.existsSync(path.join(build, "meson-private/coredata.dat")) ? ["--reconfigure"] : []),
    posix(build), posix(prepare("mpv")), `--cross-file=${posix(crossFile)}`, `--prefix=${posix(sdk)}`,
    "--buildtype=release", "--wrap-mode=nodownload", `-Dpkg_config_path=${pkgDirectories.map(posix).join(",")}`,
    ...receipt.mpvOptions];
  shell(`${setup.map(quote).join(" ")} && ninja -j ${jobs} -C ${shellPath(build)}`);
  const linker = fs.readFileSync(path.join(build, "build.ninja"), "utf8");
  if (/(?:liblzo2\.a|-llzo2\b)/.test(linker)) throw new Error("libmpv still links GPL LZO.");
  shell(`x86_64-w64-mingw32-strip --strip-unneeded -o ${shellPath(path.join(output, "libmpv-2.dll"))}`
    + ` ${shellPath(path.join(build, "libmpv-2.dll"))}`);
}

function disc() {
  const prefix = path.join(output, "disc-sdk");
  for (const name of ["libudfread", "libbluray"]) {
    const build = path.join(output, `${name}-build`);
    const options = name === "libbluray" ? [
      "-Denable_tools=false", "-Denable_examples=false", "-Denable_devtools=false",
      "-Dbdj_jar=disabled", "-Dfreetype=disabled", "-Dfontconfig=disabled", "-Dlibxml2=disabled",
    ] : [];
    const setup = ["meson", "setup", ...(fs.existsSync(path.join(build, "meson-private/coredata.dat")) ? ["--reconfigure"] : []),
      posix(build), posix(prepare(name)), `--prefix=${posix(prefix)}`, "--libdir=lib",
      `--cross-file=${posix(crossFile)}`, "--buildtype=release", "--default-library=shared", "--wrap-mode=nodownload", ...options];
    shell(`export PKG_CONFIG_LIBDIR=${shellPath(path.join(prefix, "lib/pkgconfig"))}; ${setup.map(quote).join(" ")}`
      + ` && ninja -j ${jobs} -C ${shellPath(build)} && ninja -C ${shellPath(build)} install`);
  }
}
if (action === "all" || action === "ffmpeg") ffmpeg();
if (action === "all" || action === "mpv") mpv();
if (action === "all" || action === "disc") disc();
console.log(`Rebuilt ${action} from public corresponding sources: ${output}`);
