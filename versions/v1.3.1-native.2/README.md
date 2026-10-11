# Windows x64 对应源码与重建

本版本归档包含原版源码、实际修改补丁、来源修订、第三方版权文本、Sharp
源码与对应构建配方，以及独立的 LGPL 原生库重建入口。
原生源码身份与选项见 `native-build.json`；依赖来源见 `source-index.json`，
已安装依赖的配置／编译／安装命令事实见 `dependency-build.json`。

## 解压与准备

源码归档中的 `sources/` 是完整分发内容。仅克隆仓库时，需要另行下载该
标签的完整源码归档并解压到版本目录。`sources/mpv-patches/` 及
`vendor/mpv/patches/` 保存实际使用的三项补丁。

使用 Node.js 22 或更高版本、Git 和支持 gzip/xz 的 tar：

```powershell
node build-scripts/rebuild-libraries.mjs prepare --output D:/third-party-work
```

此命令从随附归档解压 mpv、FFmpeg、libarchive、libbluray 和 libudfread，
应用实际 mpv 修改，补充 FFmpeg 版本文件。重建入口不导入 WWPlayer 私有模块。
解压后可以修改库源码；后续编译保留该工作目录中的用户修改。

## 工具链与依赖

Windows 重建入口使用 MinGW x64 GCC／MSYS2、Meson、Ninja、CMake、pkgconf、
make 和 NASM。`--toolchain` 指向包含 `msys64/usr/bin/bash.exe`、
`install/bin/x86_64-w64-mingw32-gcc` 等工具的根目录。
Meson 可安装在该工具链的 `meson-1.11-venv/bin`，或提供在 MSYS2 PATH 中。

`--dependency-prefix` 指向这些开源依赖安装后的前缀。依赖源归档、版本和
补丁全部列在 `source-index.json`。`dependency-build.json` 记录当前 x64
配置实际使用的命令参数与依赖顺序；其中 `{sources}`、`{build}`、
`{prefix}`、`{compiler}` 为本机目录占位符，`{wrapper}` 表示使用文件内
记录的 MinGW 编译与 pkg-config 环境运行后续命令。
构建过程中产生的目录连接应在本机重建；不使用原开发机器的绝对路径。

来源记录中可能同时有上游基础修订、构建补丁生成的修订和工作区补丁。
按基础归档加对应补丁可恢复实际使用的源代码。已初始化的子模块源码也
随归档提供，未使用的可选组件不作为程序分发内容。

通用工具链的来源参考为 `dependency-build.json` 中的公开构建工具地址。
本归档使用 WWPlayer 自行编写的独立库重建脚本和构建参数记录，
不依赖那份工具的私有目录布局。

## 重建 LGPL 原生库

准备相同版本的依赖前缀，以及启用 HTTP/2 的 curl 8.22 开源构建前缀后：
如果 nghttp2 的 pkg-config 文件在独立前缀，可显式使用 `--http2-prefix` 指定。

```powershell
node build-scripts/rebuild-libraries.mjs all `
  --output D:/third-party-work `
  --toolchain D:/mingw-toolchain `
  --dependency-prefix D:/dependencies/x86_64-w64-mingw32 `
  --curl-prefix D:/curl-sdk
```

可使用 `ffmpeg`、`mpv`、`disc` 单独重建对应组件。已有当前 LGPL FFmpeg SDK
时，`mpv` 支持 `--ffmpeg-sdk D:/lgpl-ffmpeg-sdk`。
此 SDK 仅作为已编译的开源依赖使用，不需要 WWPlayer 自有程序源码。
输出目录为 `sdk/`、`libmpv-2.dll` 和 `disc-sdk/bin/`。

入口生成自己的 MinGW CMake／Meson 交叉配置；libarchive 使用
`-DENABLE_LZO=OFF`，pkg-config 绑定该独立静态归档，FFmpeg 绑定 SDK 的
共享 import library。编译阶段检查 libmpv 的链接清单不再引用 LZO。
实际源代码、工具链和编译设置决定结果，重建不以原 DLL 字节身份限制用户
对兼容库的修改与调试。

`build-lgpl-runtime.mjs` 和 `build-disc-reader.mjs` 同时保留原生产步骤供审阅，
重建库时使用这里的独立入口，而不构建它们提及的 WWPlayer 私有辅助程序。

## Sharp 与其他组件

Sharp 各库版本见 `sharp-library-versions.json`，原始源码与构建配方见
`sharp-source-index.json`。`sharp-libvips-build` 归档内包含完整构建脚本、
精确版本表及下载规则，其提交与实际安装的 Sharp 0.35.4 Windows 包匹配。

其他组件保留各自许可，不因同处源码归档而改变许可证。
修改库与重新组合的使用权及源码获取承诺见 `THIRD-PARTY-RIGHTS.md`
和 `SOURCE-OFFER.md`。
