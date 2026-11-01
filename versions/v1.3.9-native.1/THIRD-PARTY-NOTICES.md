# WWPlayer 第三方许可与源码

WWPlayer 自有界面、业务代码和原生辅助程序并不因此变成开源软件。
本目录保存随当前发行版本分发的第三方版权、许可和准确的对应源码入口。

## 对应源码获取

`SOURCE-RELEASE.json` 给出当前 DLL 对应的 GitHub Release、完整源码归档下载
地址及 SHA-256。公开维护仓库为：
https://github.com/Carrottor/wwplayer-third-party

源码归档可免费获取，包含原版源码、修改补丁、锁定版本的依赖来源、构建
脚本与配置，不需要 WWPlayer 的私有界面、业务或辅助程序源码。
具体源码提供承诺与联系方式见 `SOURCE-OFFER.md`。
每个源码版本保持独立；不要用仓库最新分支代替当前发行版的对应源码。

## 播放、解码及 ISO

- 内置 libmpv 和 FFmpeg 使用 LGPL 构建，不启用 GPL/nonfree 组件。
- libmpv 的双字幕及 ISO EDL preroll 修改以原 LGPL 条件提供。
- 缩略图程序、ffprobe 与 ISO 读取器使用可替换的 DLL。
- `native-build.json` 保存源提交及实际配置；`source-index.json` 对应源码归档。
- 下载并解压对应源码归档后，`sources/` 提供 mpv、FFmpeg 及其依赖源码。
  mpv 基线先解压 `mpv-upstream.tar.gz`，按 `native-build.json` 的顺序应用
  `mpv-patches/`；FFmpeg 基线解压后把 `FFMPEG-VERSION` 保存为 `VERSION`，
  再按 `native-build.json` 的 `ffmpegPatches` 顺序应用 `ffmpeg-patches/`。
  原始 tar 仅作无损 gzip 压缩；已压缩的第三方源码归档保持原内容。
- `build-scripts/` 保存本版本独立构建脚本，`dependency-build.json` 保存依赖
  来源和实际编译命令。
  使用归档内的独立 `build-scripts/rebuild-libraries.mjs` 与构建说明重建库；
  SDK、缓存和编译输出应放在应用安装目录之外。
- libarchive 采用不含 LZO 的配置；打包准入同时检查对应源码版本和当前
  libmpv／FFmpeg DLL 身份，不复用含 GPL LZO 的旧工具链归档。
- 仅重建 LGPL 库无需 WWPlayer 的私有 C++/界面源码。
  libudfread 和 libbluray 可分别使用其源码中的 Meson 构建：
  `--default-library=shared --buildtype=release`；libbluray 禁用工具、
  examples、BD-J JAR、freetype、fontconfig 和 libxml2，与所附构建脚本一致。

## 修改库与重新组合

先关闭所属播放/读取进程，备份原 DLL，再替换为同名、接口兼容的修改库。
`bin/libmpv/shared/` 同时保存 Native Host、ffprobe、缩略图 worker 与一套
FFmpeg DLL；在该目录替换 libmpv／FFmpeg 即作用于三个辅助进程。
`runtime.json` 对应缩略图 worker，`ffprobe-runtime.json` 对应预加载 probe；
ISO 读取器目录替换 libbluray/libudfread DLL。
修改 FFmpeg 后清理原时间轴图片缓存，避免把旧解码结果作为新库结果。
构建时的来源核验不是程序运行时的库签名白名单。

MSIX 安装目录受 Windows 管理。需要重组时，把所属 helper 和全部依赖复制
到可写目录，使用应用已有的 helper 路径环境变量指定重组目录；也可在可写的
portable 副本中替换。不要修改 WindowsApps 权限或关闭系统签名检查。
库修改与调试权见 `THIRD-PARTY-RIGHTS.md`。
现有路径入口：`WWPLAYER_LIBMPV_HOST_STABLE`／`WWPLAYER_LIBMPV_HOST_BETA`
指定复制后的 Host；`WWPLAYER_FRAME_THUMBNAIL_RUNTIME` 指定包含 worker、
runtime.json 和 DLL 的目录；`WWPLAYER_FFPROBE_PATH` 指定重组后的 ffprobe；
`WWPLAYER_DISC_READER_EXE` 指定重组后的 ISO helper。

## 其他组件

- Electron/Chromium 的完整第三方文本随运行时的 `LICENSE`、
  `LICENSES.chromium.html` 分发；对应源码由该版本 Electron 的公开源提交、
  Chromium `DEPS` 及其第三方源版本确定。
- JavaScript/图像依赖的文本位于 `javascript/`，production node_modules
  同时保留各包自带的许可文件。
- Sharp 所含库的精确版本及其许可见 `sharp-library-versions.json`、
  `sharp-library-notices.md`；`sharp-source-index.json` 对应所附的 LGPL/MPL
  源码归档、Sharp 源码及该版本 sharp-libvips 构建配方。
- Streamline Core Free：作者 Streamline / Webalys，来源
  https://www.streamlinehq.com/，许可 CC BY 4.0。界面使用中进行了颜色适配、
  尺寸调整及部分操作图标改编；许可全文见 `CC-BY-4.0.txt`。
- Remix Icon v2.5.0：Apache-2.0，文字见 `REMIX-LICENSE.txt`。

这些源码和文本只针对实际包含的第三方组件，不授权 WWPlayer 商标、
账户凭据、用户媒体或与第三方库无关的自有程序代码。
