# WWPlayer 第三方对应源码

本仓库维护 WWPlayer 实际分发的第三方组件源码版本、修改补丁、构建材料和许可。
WWPlayer 自有界面、业务与原生辅助程序代码保持独立。

当前 Windows x64 原生配置：`v1.3.7-native.1`。
完整对应源码归档位于该标签的 GitHub Release；下载无需登录或付费。

仓库保存可审阅的配置、补丁、重建脚本及版权文本；体积较大的原版源码归档
作为版本固定的 Release 资源提供。源码版本不跟随主分支漂移。

当前配置保留双字幕和未加密 Blu-ray ISO EDL preroll 修改；mpv／FFmpeg
不启用 GPL/nonfree 组件，FFmpeg 通过共享 DLL 使用。
libarchive 明确禁用 LZO，并将其静态归档绑定到独立依赖前缀，排除旧工具链
中 LZO 启用配置带来的传递依赖风险。

发行 DLL 已剥离调试节与 COFF 符号表，编译目录仍保留原始输出。

此版本增加 mpv 播放列表重定向后的地址基准修复，使相对媒体地址使用
重定向后的实际来源和目录。保留 FFmpeg 完整分块 HTTP 响应的 EOF 修复，
以及独立重建入口在其他 Git 仓库内应用补丁的行为。

先下载完整源码归档，再阅读其中的 `README.md`。
独立入口 `build-scripts/rebuild-libraries.mjs` 只重建第三方库，
不需要 WWPlayer 的私有源码目录。

各第三方组件继续适用自己的许可证。此仓库不将它们统一重新许可为 MIT：
`LICENSE-AUTOMATION.txt` 仅适用于 WWPlayer 自行编写的构建自动化。
mpv 修改按其 LGPL 条款提供；其他组件的版权与许可在版本目录及上游源码内。

源码获取及缺失材料请求可通过本仓库 Issues 提交。
已分发版本对应的源码、补丁和重建资料持续保留，具体承诺见各版本的
`SOURCE-OFFER.md`。
