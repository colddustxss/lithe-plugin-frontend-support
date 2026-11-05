# CI 本地检查记录

日期：2026-11-05；项目版本：0.2.0。未推送源码、标签或触发云端发布。

## 修复

- `volar-service-emmet` 间接依赖的 CSS parser 原锁定为 GitHub SSH 地址。改为同一提交 `370c480ac103bd17c7bcfb34bf5d577dc40d3660` 的 HTTPS 归档，附带 npm integrity；解析器入口与原安装文件的 SHA-256 一致。
- npm 包归档改用官方 registry.npmjs.org 地址，保留版本与 integrity。
- CI 与 Release 使用共享校验脚本，校验索引和真实归档；固定官方 Lithe Store 提交 `722a1c28b4dedd0fcd450e636b183a81aff093ca`，通过 checkout 动作获取，移除内联 JavaScript 和直接 git clone。
- Release 打包同时核对版本标签和 GitHub 仓库名，错误仓库名的拒绝路径有测试覆盖。

## 复现结果

- actionlint 1.7.12 检查 CI/Release 工作流，通过。
- 两份独立源码快照，分别使用 Node.js 20.20.2 与 22.13.0；macOS。
- 每份快照使用独立空 npm 缓存；清除用户 npm/git 配置，禁用 Git SSH，执行 `npm ci --ignore-scripts`，通过。
- 两份快照均通过 24 项测试、构建、归档与契约校验、固定官方市场校验；生成的索引和语法文件与快照基线无差异。
- 两份归档 SHA-256 相同，并与当前工作区构建一致：`c888676f502eb0888eb0ef76dd20f468c830f88636b92ebd9d662507ff36914a`。

Linux runner 和 GitHub Actions 的实际执行仍需推送后确认。本地复现不等同于云端矩阵已通过。Release 发布动作未执行。
