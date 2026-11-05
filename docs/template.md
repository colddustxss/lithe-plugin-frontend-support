# 模板与实现来源

模板：https://github.com/Lithe-IDEA/lithe-plugin-lua

固定提交：`72b8df0e634005892ac7cb6f62b2ae560016bd13`（Apache-2.0）。

项目从该模板的文件树重新创建，保留单插件 ID 目录、plugin.json、bin/、language-server.json、scripts/package.mjs 和 CI/标签发布结构。Vue 接入、代码片段、基础高亮、构建校验及集成测试均在本次开发中编写。

LuaLS 原生归档替换为 npm 锁定的 Vue/Volar/TypeScript 运行包；安装后不执行 npm install，也不下载依赖。使用静态高亮资源，需要 API 3 / languages 2；只声明 Vue 语言服务器，不声明 Lua 运行器和宿主内置的 Node 模块。

Vue 官方语言工具：https://github.com/vuejs/language-tools/tree/v2.2.12

固定 Vue Language Server 2.2.12 / TypeScript 5.8.3，是因为该版本提供独立完整模式；新版混合模式依赖编辑器的 TypeScript 插件桥接。本项目不假设 Lithe 提供 VS Code 的桥接接口。

`contracts/ORIGIN.json` 记录 Lithe 0.6.7 契约副本的官方地址、构建提交和 SHA-256，`contracts/LICENSE` 保留上游许可。

部分上游包没有随 npm 归档提供 LICENSE：`vendor/licenses/ORIGIN.json` 区分上游原文与根据包内 MIT 声明补充的许可说明，保存来源与摘要；补充说明不冒充上游原文。
