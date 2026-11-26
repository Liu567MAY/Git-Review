# GitCheck · Git 仓库接入体检

GitCheck 面向需要接手公开 GitHub 仓库的开发者。体检报告按分支和 commit 标记版本，帮助定位接入资料缺失、Windows 脚本、硬编码路径和疑似敏感信息，并展示就绪度评分和主要风险。

## 当前进度

- 可在页面扫描公开 GitHub 仓库。后端先校验公开性并解析所选分支，再按固定的 commit SHA 读取文件树和限额内的文本。
- 报告展示四类检查、评分扣分、风险位置和读取覆盖。文件树截断、内容跳过或读取失败时显示暂定分数。扫描只读取 GitHub 数据。
- 最近 30 条查询与扫描记录保存在当前浏览器。AI 和自动更新跟踪尚未接入。

## 本地运行

使用 Node.js 22.18 或更高版本和 npm。在两个终端中分别运行以下命令。

后端

```sh
cd backend
npm ci
npm run dev
```

默认监听 3000，`GET /api/health` 可检查服务状态。通过 `PORT` 调整后端端口时，在前端进程设置 `GITCHECK_API_TARGET`（例如 `http://127.0.0.1:3001`）。服务端可通过 `GITHUB_TOKEN` 提供 GitHub 访问凭据。

前端

```sh
cd front
npm ci
npm run dev
```

打开 Vite 输出的地址，输入 `https://github.com/octocat/Hello-World` 并查询仓库。选择 `master` 或 `test` 后开始扫描，报告标题显示所选分支及完整 commit SHA。真实扫描期间页面显示等待状态。

## 构建与部署

从仓库根目录执行以下命令。Express 同源提供前端页面和 `/api`，部署时应保留 `backend/dist` 与 `front/dist` 的相对目录结构，并安装后端生产依赖。

```sh
npm --prefix front ci
npm --prefix front run build
npm --prefix backend ci
npm --prefix backend run build
npm --prefix backend start
```

部署平台可设置 `PORT`，并允许服务访问 `https://api.github.com`。可在服务端配置 `GITHUB_TOKEN` 来使用认证配额，公开性检查仍然生效。`GITCHECK_API_TARGET` 仅用于本地 Vite 代理。

启动后打开 `http://localhost:3000/`，健康检查路径为 `/api/health`。若通过反向代理部署，扫描请求的超时应留出至少 45 秒。

## 扫描范围与验收

真实扫描每次最多请求 24 个候选文件，每个文件最多 64 KiB，优先读取 README、依赖清单和启动配置。单次 GitHub 请求限时 8 秒，提交对象、文件树及文本读取共用 25 秒预算。二进制、非 UTF-8 文件、符号链接及子模块会跳过。每条规则展示首个代表位置，疑似凭据仅展示类型和位置。文件树截断时，计数仅基于 GitHub 已返回的条目。

构建后可在后端目录运行 `node --test test/scan.test.mjs` 核对固定版本、脱敏、覆盖和评分。评分和 API 见 [backend/README.md](backend/README.md)，AI 辅助开发复验记录见 [AI_USAGE.md](AI_USAGE.md)。

## 更新跟踪设计

1. **发现更新。** 以仓库和分支为单位保存最近一次成功报告对应的 commit SHA。重新检查时读取该分支当前 SHA，相同则复用报告。
2. **避免全量重算。** 对比旧 SHA 和目标 SHA，重扫新增和修改文件，移除已删除文件的发现，再重算仓库级检查和评分。差异不完整、规则变化或读取预算影响文件选择时，回退到受限的全量扫描。
3. **标记报告版本。** 一次扫描固定使用目标 SHA。报告同时展示仓库、分支、commit、扫描时间和覆盖范围。
4. **失败与限流。** 保留最后一份成功报告及其版本，显示本次更新失败或限流。更新跟踪接入后，可按服务端返回的重试时间重新尝试。当前由用户手动重试。初次扫描失败时展示错误。

更新跟踪当前为设计，完整需求与验收标准见 [SPEC.md](SPEC.md)。

## 提交前验收

- 前后端构建通过。Express 健康检查及前端静态入口返回成功。
- 后端执行 `node --test test/scan.test.mjs`，四项通过。同一固定提交重复扫描得到 55 分，风险、扣分和覆盖限制一致。
- Edge 受控验收覆盖分支切换、报告版本更新、非公开、无法访问、分支删除后刷新、限流重试和部分扫描。部分扫描展示覆盖原因及暂定分数。
- 此前真实联调已在 Edge 扫描 `octocat/Hello-World` 的 `master` 和 `test`。本轮复验时 GitHub 对后端匿名请求返回 HTTP 403，剩余额度为 0，页面显示限流提示。本轮真实双分支复扫待额度恢复或服务端配置 `GITHUB_TOKEN` 后补验。
