# Frontend Support · 前端支持

为 **Lithe** 提供前端开发支持，现已支持 **Vue**。集成智能补全、代码片段、悬浮说明、快速修复、跳转定义、重命名、自动导入和语法高亮，帮助阅读和编写 Vue 模板、脚本与样式。

当前版本 **0.2.0**，支持 macOS，作者 **colddustxss**，许可证 **Apache-2.0**。基于 [官方 Lua 模板](https://github.com/Lithe-IDEA/lithe-plugin-lua) 开发。

## 功能

| 功能 | 范围 |
| --- | --- |
| 标签与属性补全 | HTML 标签、原生属性，以及项目可解析的 Vue 组件属性与事件 |
| CSS 补全 | Vue style 区块中的 CSS/SCSS/Less 属性与取值 |
| Vue 指令补全 | v-if、v-for、v-model、绑定、事件等 |
| 代码片段 | vue3-setup-ts、vue3-setup、vfor、vif、vmodel、vref、vcomputed、vwatch |
| 悬浮说明 | 模板表达式类型、脚本符号、HTML/CSS 用法 |
| 快速修复 | 语言服务提供的 TypeScript/Vue 修复，例如缺失导入 |
| 跳转定义 | 模板事件到脚本声明、组件到源文件、可解析的跨文件符号 |
| 重命名 | 语言服务可追踪的模板、脚本和文件间引用 |
| 自动导入 | 选择补全候选时，通过候选解析附加 import 编辑；由编辑器应用 |
| 阅读辅助 | Vue 基础语法高亮、官方服务提供的结构、折叠和格式化 |

脚本片段 vref/vcomputed/vwatch 假设对应 Vue API 已导入，缺失时可使用快速修复。项目依赖、tsconfig/jsconfig 的 include、paths 和 Vue 类型决定组件信息与跨文件分析的范围。Element Plus 等组件库需要项目本身安装并正确配置类型。

## 安装与使用

1. 准备支持 API 3、languages 2、languageServers 1 和 serverProcess 1 的 Lithe；目标为 macOS Lithe 0.6.7。Windows 尚未验收，发布包只声明 macOS。
2. 安装 Node.js 20+，在 Vue 项目中按项目要求安装依赖；推荐提供包含 `.vue` 的 tsconfig.json 或 jsconfig.json。
3. 本地构建后，在 Lithe 设置 → 插件 → 从磁盘安装插件中选择 `dist/frontend-support-0.2.0-darwin.zip`。
4. 在项目根目录打开工作区，再打开 `.vue` 文件。使用编辑器补全、悬浮、跳转定义、重命名和快速修复入口。自动导入需选中补全候选。

本插件独占 Vue 服务；与另一插件同时注册 Vue 服务器会冲突。当前功能范围以本 README 为准。

服务器和 TypeScript 标准库随包提供，安装后无需在插件目录安装依赖。代码片段需要宿主支持 LSP snippets；快速修复及自动导入依赖宿主应用 WorkspaceEdit 和 completionItem/resolve 的附加编辑。验证范围见 [VALIDATION.md](VALIDATION.md)。

## 开发

```sh
npm ci --ignore-scripts
npm run verify
```

`src/server.cjs` 接入 Vue 官方独立服务，`src/snippets.cjs` 提供片段，`src/grammar.mjs` 提供基础高亮。`language-server.json` 和 `package-lock.json` 固定上游工具与依赖。构建保留官方 Node 模块布局和 TypeScript lib 资源；CI 检查安装包、能力表及摘要。

## 发布

仓库：[colddustxss/lithe-plugin-frontend-support](https://github.com/colddustxss/lithe-plugin-frontend-support)。推送 `v0.2.0` 标签会触发模板式 Release 工作流；源码推送只触发 CI。发布前完成原生安装验收，再提交社区收录。根目录索引的远程下载地址只有正式 Release 发布后才可用。

[模板对应关系和上游说明](docs/template.md)。原创集成代码使用 [Apache-2.0](LICENSE)，第三方代码保留各自许可与版权声明，见 [NOTICE](NOTICE)。
