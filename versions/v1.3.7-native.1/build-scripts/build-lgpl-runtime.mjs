import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const appRoot = path.resolve(import.meta.dirname, "..");
const nativeRoot = path.resolve(appRoot, "../../WWPlayer-workspace/native");

const ffmpegLibraries = [
  "vapoursynth", "libass", "libbluray", "libfreetype", "libfribidi",
  "libfontconfig", "libharfbuzz", "libmodplug", "libopenmpt", "libmp3lame",
  "lcms2", "libopus", "libsoxr", "libspeex", "libvorbis", "libbs2b",
  "libvpx", "libwebp", "libsvtav1", "libdav1d", "libuavs3d", "libzimg",
  "openssl", "libxml2", "libmysofa", "libssh", "libsrt", "libvpl",
  "libjxl", "libplacebo", "libzvbi", "libaribcaption",
];

const posix = (value) => value.replaceAll("\\", "/").replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const shellPath = (value) => quote(posix(value));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", windowsHide: true, ...options });
}

export function exportSource({ repository, commit, destination, archive, patches = [], version }) {
  const identity = {
    commit,
    patches: patches.map((file) => ({
      file: path.relative(appRoot, file).replaceAll("\\", "/"),
      content: fs.readFileSync(file, "utf8"),
    })),
  };
  const identityFile = path.join(destination, ".wwplayer-build-inputs.json");
  if (fs.existsSync(destination)) {
    if (!fs.existsSync(identityFile)
        || JSON.stringify(readJson(identityFile)) !== JSON.stringify(identity)) {
      throw new Error(`Source inputs changed. Use a new WWPLAYER_LGPL_BUILD directory: ${destination}`);
    }
    if (version) fs.writeFileSync(path.join(destination, "VERSION"), `${version}\n`);
    return;
  }
  fs.mkdirSync(destination, { recursive: true });
  // git archive applies checkout conversion. The source tree must retain its
  // committed LF bytes, regardless of the developer's Windows autocrlf setting.
  run("git", ["-c", "core.autocrlf=false", "-C", repository, "archive", "--format=tar", "-o", archive, commit]);
  run("tar", ["-xf", archive, "-C", destination]);
  for (const file of patches) {
    run("git", ["-c", "core.autocrlf=false", "apply", "--check", file], { cwd: destination });
    run("git", ["-c", "core.autocrlf=false", "apply", file], { cwd: destination });
  }
  fs.writeFileSync(identityFile, `${JSON.stringify(identity, null, 2)}\n`);
  if (version) fs.writeFileSync(path.join(destination, "VERSION"), `${version}\n`);
}

export function assertLgplFfmpeg({ license, configuration }) {
  if (!/GNU Lesser General Public License|LGPL version (?:2\.1|3) or later/.test(String(license))) {
    throw new Error("The FFmpeg runtime must be LGPL; GPL/nonfree builds are not accepted.");
  }
  if (/(?:^|\s)--enable-(?:gpl|nonfree)(?:\s|$)/.test(String(configuration))) {
    throw new Error("The FFmpeg runtime enables GPL/nonfree components.");
  }
}

export function bindFfmpegSharedLibraries(sdk) {
  // Other dependencies add the old toolchain's -L directory before FFmpeg's.
  // Bare -lav* names can therefore select an unrelated GPL archive. Bind the
  // SDK's pkg-config records to their own shared import libraries instead.
  for (const name of ["avcodec", "avformat", "avfilter", "avutil", "avdevice", "swresample", "swscale"]) {
    const file = path.join(sdk, "lib/pkgconfig", `lib${name}.pc`);
    const library = path.join(sdk, "lib", `lib${name}.dll.a`);
    if (!fs.existsSync(library)) throw new Error(`Shared FFmpeg import library is missing: ${library}`);
    const content = fs.readFileSync(file, "utf8");
    const bound = content.replace(new RegExp(`-l${name}(?=\\s|$)`, "g"), `\${libdir}/lib${name}.dll.a`);
    fs.writeFileSync(file, bound);
  }
}

export function buildLgplArchive({ toolchain, buildRoot, bash, environment }) {
  const repository = path.join(toolchain, "configure-sources/libarchive");
  const commit = fs.readFileSync(path.join(toolchain,
    "configure-check/packages/libarchive-prefix/src/libarchive-stamp/HEAD"), "utf8").trim();
  const source = path.join(buildRoot, "sources/libarchive");
  exportSource({ repository, commit, destination: source,
    archive: path.join(buildRoot, "sources/libarchive-upstream.tar") });
  const prefix = path.join(buildRoot, "dependency-sdk");
  const build = path.join(buildRoot, "libarchive-build");
  const oldPrefix = path.join(toolchain, "install/x86_64-w64-mingw32");
  const options = [
    "-DBUILD_SHARED_LIBS=OFF", "-DENABLE_LZO=OFF", "-DENABLE_ZLIB=ON", "-DENABLE_ZSTD=ON",
    "-DENABLE_OPENSSL=ON", "-DENABLE_BZip2=ON", "-DENABLE_ICONV=ON", "-DENABLE_LIBXML2=ON",
    "-DENABLE_EXPAT=ON", "-DENABLE_LZMA=ON", "-DENABLE_CPIO=OFF", "-DENABLE_CAT=OFF",
    "-DENABLE_TAR=OFF", "-DENABLE_WERROR=OFF", "-DBUILD_TESTING=OFF", "-DENABLE_TEST=OFF",
  ];
  run(bash, ["-lc", `${environment}; cmake -S ${shellPath(source)} -B ${shellPath(build)} -G Ninja`
    + ` -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=${shellPath(path.join(toolchain, "configure-check/toolchain.cmake"))}`
    + ` -DCMAKE_INSTALL_PREFIX=${shellPath(prefix)} -DCMAKE_FIND_ROOT_PATH=${shellPath(oldPrefix)}`
    + ` -DCMAKE_INSTALL_LIBDIR=lib -DCMAKE_POLICY_VERSION_MINIMUM=3.5 ${options.join(" ")}`
    + ` && cmake --build ${shellPath(build)} -j 6 && cmake --install ${shellPath(build)}`]);
  const pkg = path.join(prefix, "lib/pkgconfig/libarchive.pc");
  const content = fs.readFileSync(pkg, "utf8");
  if (/\blzo2?\b/i.test(content)) throw new Error("The isolated libarchive still requires GPL LZO.");
  // A bare -larchive could select the older LZO-enabled toolchain archive.
  fs.writeFileSync(pkg, content.replace(/-larchive(?=\s|$)/g, "${libdir}/libarchive.a"));
  return { commit, options, lzo: false, prefix };
}

export function buildLgplRuntime() {
  const toolchain = path.resolve(process.env.WWPLAYER_FFMPEG_TOOLCHAIN || "E:/codexwork/.toolchains/mpv-win64");
  const buildRoot = path.resolve(process.env.WWPLAYER_LGPL_BUILD || path.join(nativeRoot, "current-lgpl-iso"));
  const sdk = path.join(buildRoot, "sdk");
  const sources = path.join(buildRoot, "sources");
  const ffmpegSource = path.join(sources, "ffmpeg");
  const mpvSource = path.join(sources, "mpv");
  const ffmpegBuild = path.join(buildRoot, "ffmpeg-build");
  const mpvBuild = path.join(buildRoot, "mpv-build");
  const bash = path.join(toolchain, "msys64/usr/bin/bash.exe");
  const oldPrefix = path.join(toolchain, "install/x86_64-w64-mingw32");
  const ffmpegManifest = readJson(path.join(appRoot, "vendor/thumbnail-worker/source-manifest.json"));
  const ffmpegPatches = (ffmpegManifest.ffmpeg.patches || [])
    .map((file) => path.join(appRoot, "vendor/thumbnail-worker", file));
  const mpvManifest = readJson(path.join(appRoot, "vendor/mpv/source-manifest.json"));
  const ffmpegRepository = path.resolve(process.env.WWPLAYER_FFMPEG_SOURCE || path.join(toolchain, "configure-sources/ffmpeg"));
  const mpvRepository = path.resolve(process.env.WWPLAYER_TEST_MPV_SOURCE || path.join(nativeRoot, "dual-subtitles-src"));
  const jobs = Math.max(1, Math.min(6, os.availableParallelism()));
  if (!fs.existsSync(bash)) throw new Error(`The existing MSYS2 toolchain is missing: ${bash}`);
  for (const directory of [buildRoot, sources, sdk, ffmpegBuild]) fs.mkdirSync(directory, { recursive: true });

  exportSource({
    repository: ffmpegRepository, commit: ffmpegManifest.ffmpeg.commit,
    destination: ffmpegSource, archive: path.join(sources, "ffmpeg-upstream.tar"),
    patches: ffmpegPatches,
    version: ffmpegManifest.ffmpeg.version,
  });
  exportSource({
    repository: mpvRepository, commit: mpvManifest.mpv.commit,
    destination: mpvSource, archive: path.join(sources, "mpv-upstream.tar"),
    patches: mpvManifest.mpv.patches.map((file) => path.join(appRoot, "vendor/mpv", file)),
  });

  const pkgDirectories = [
    path.join(buildRoot, "dependency-sdk/lib/pkgconfig"),
    path.join(sdk, "lib/pkgconfig"),
    path.join(nativeRoot, "dual-subtitles-curl-sdk/lib/pkgconfig"),
    path.join(toolchain, "curl-8.22-install/lib/pkgconfig"),
    path.join(oldPrefix, "lib/pkgconfig"),
  ];
  const environment = [
    `export PATH=${shellPath(path.join(toolchain, "meson-1.11-venv/bin"))}:${shellPath(path.join(toolchain, "install/bin"))}:$PATH`,
    `export PKG_CONFIG_LIBDIR=${quote(pkgDirectories.map(posix).join(":"))}`,
    "export PKG_CONFIG_PATH=",
  ].join("; ");
  const libarchive = buildLgplArchive({ toolchain, buildRoot, bash, environment });
  const configure = [
    `--prefix=${posix(sdk)}`, "--cross-prefix=x86_64-w64-mingw32-",
    "--arch=x86_64", "--target-os=mingw32", "--enable-cross-compile",
    "--pkg-config-flags=--static", "--enable-runtime-cpudetect",
    "--disable-gpl", "--disable-nonfree", "--enable-version3",
    "--enable-static", "--enable-shared", "--disable-autodetect",
    "--disable-doc", "--disable-ffplay", "--disable-ffmpeg", "--enable-ffprobe",
    "--enable-cuvid", "--enable-nvdec", "--enable-nvenc", "--enable-amf",
    "--enable-ffnvcodec", "--enable-dxva2", "--enable-d3d11va", "--enable-d3d12va",
    "--enable-mediafoundation", "--enable-zlib", "--enable-bzlib", "--enable-lzma", "--enable-iconv",
    "--enable-openal", "--enable-opengl", "--enable-vaapi",
    "--disable-vdpau", "--disable-videotoolbox",
    "--extra-cflags=-Wno-error=int-conversion",
    "--extra-ldflags=-static-libgcc",
    "--extra-libs=-Wl,-Bstatic -lstdc++ -lwinpthread -Wl,-Bdynamic",
    ...ffmpegLibraries.map((name) => `--enable-${name}`),
  ];
  const configureRecord = path.join(buildRoot, "ffmpeg-configure.json");
  const configureNeeded = !fs.existsSync(path.join(ffmpegBuild, "ffbuild/config.mak"))
    || !fs.existsSync(configureRecord)
    || JSON.stringify(readJson(configureRecord)) !== JSON.stringify(configure);
  console.log(`Building isolated LGPL FFmpeg: ${ffmpegBuild}`);
  run(bash, ["-lc", `${environment}; cd ${shellPath(ffmpegBuild)};`
    + (configureNeeded
      ? ` ${shellPath(path.join(ffmpegSource, "configure"))} ${configure.map(quote).join(" ")} &&`
      : "")
    + ` make -j ${jobs} && make install`
    + ` && x86_64-w64-mingw32-strip --strip-all ${shellPath(path.join(sdk, "bin"))}/*.dll`]);
  fs.writeFileSync(configureRecord, `${JSON.stringify(configure, null, 2)}\n`);
  bindFfmpegSharedLibraries(sdk);
  const probe = path.join(sdk, "bin/ffprobe.exe");
  const configuration = execFileSync(probe, ["-version"], {
    encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  const license = execFileSync(probe, ["-L"], {
    encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  assertLgplFfmpeg({ license, configuration });
  fs.writeFileSync(path.join(buildRoot, "ffmpeg-version.txt"), configuration);

  console.log(`Building isolated LGPL libmpv: ${mpvBuild}`);
  const mpvOptions = [
    "-Dlibmpv=true", "-Dcplayer=false", "-Dtests=false", "-Dgpl=false",
    "-Drubberband=disabled", "-Dvulkan=disabled", "-Degl-angle=disabled",
    "-Dopenal=enabled", "-Dlibcurl=enabled", "-Dprefer_static=true",
  ];
  const setup = [
    "meson", "setup", ...(fs.existsSync(path.join(mpvBuild, "meson-private/coredata.dat")) ? ["--reconfigure", "--clearcache"] : []),
    posix(mpvBuild), posix(mpvSource),
    `--cross-file=${posix(path.join(toolchain, "configure-check/meson_cross.txt"))}`,
    `--prefix=${posix(sdk)}`, "--buildtype=release", "--wrap-mode=nodownload",
    `-Dpkg_config_path=${pkgDirectories.map(posix).join(",")}`, ...mpvOptions,
  ];
  run(bash, ["-lc", `${environment}; ${setup.map(quote).join(" ")} && ninja -j ${jobs} -C ${shellPath(mpvBuild)}`]);
  const linker = fs.readFileSync(path.join(mpvBuild, "build.ninja"), "utf8");
  if (/(?:liblzo2\.a|-llzo2\b)/.test(linker)) {
    throw new Error("libmpv still links the older GPL LZO dependency.");
  }
  const config = fs.readFileSync(path.join(mpvBuild, "config.h"), "utf8");
  for (const feature of ["GPL", "DVDNAV", "DVDA", "RUBBERBAND", "DIRECT3D"]) {
    if (!config.includes(`#define HAVE_${feature} 0`)) {
      throw new Error(`The LGPL candidate unexpectedly enables ${feature}.`);
    }
  }
  run(bash, ["-lc", `${environment}; x86_64-w64-mingw32-strip --strip-unneeded`
    + ` -o ${shellPath(path.join(sdk, "libmpv-2.dll"))} ${shellPath(path.join(mpvBuild, "libmpv-2.dll"))}`]);
  fs.cpSync(path.join(mpvSource, "include/mpv"), path.join(sdk, "include/mpv"), { recursive: true });
  for (const name of ["LICENSE.GPL", "LICENSE.LGPL", "Copyright"]) {
    fs.copyFileSync(path.join(mpvSource, name), path.join(sdk, name));
  }
  const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
  const runtimeBytes = fs.readFileSync(path.join(sdk, "libmpv-2.dll"));
  const libraries = fs.readdirSync(path.join(sdk, "bin")).filter((name) => /\.dll$/i.test(name));
  fs.writeFileSync(path.join(sdk, "runtime.json"), `${JSON.stringify({
    scope: "WWPlayer shared LGPL subtitle and disc runtime",
    license: "LGPL-3.0-or-later",
    mpvCommit: mpvManifest.mpv.commit,
    patches: mpvManifest.mpv.patches.map((file) => ({
      file: `vendor/mpv/${file}`,
      sha256: digest(fs.readFileSync(path.join(appRoot, "vendor/mpv", file))),
    })),
    runtime: { file: "libmpv-2.dll", size: runtimeBytes.length, sha256: digest(runtimeBytes), libraries },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(sdk, "wwplayer-lgpl-build.json"), `${JSON.stringify({
    schemaVersion: 1, license: "LGPL-3.0-or-later",
    mpvCommit: mpvManifest.mpv.commit, patches: mpvManifest.mpv.patches,
    ffmpegCommit: ffmpegManifest.ffmpeg.commit,
    ffmpegVersion: ffmpegManifest.ffmpeg.version,
    ffmpegPatches: ffmpegPatches.map((file) => ({
      file: path.relative(appRoot, file).replaceAll("\\", "/"),
      sha256: digest(fs.readFileSync(file)),
    })),
    ffmpegConfigure: configure, mpvOptions, libraries,
    ffmpegLinking: "shared-bound-imports",
    ffmpegLicense: "LGPL version 3 or later",
    libarchive: { commit: libarchive.commit, options: libarchive.options, lzo: false },
    sources: "../sources",
    omittedOptionalComponents: [
      "DVD/DVD-Audio navigation", "legacy Direct3D9 VO", "Rubber Band",
      "AviSynth", "libdavs2", "libx264", "libx265", "libxvid",
    ],
  }, null, 2)}\n`);
  console.log(`LGPL candidate SDK built; production runtimes were not replaced: ${sdk}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  buildLgplRuntime();
}
