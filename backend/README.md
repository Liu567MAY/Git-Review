# GitCheck 后端接口

运行 `npm ci` 后可用 `npm run dev` 开发，或用 `npm run build` 和 `npm start` 启动编译产物。默认端口 3000，可设置 `PORT`。部署时先构建前端，Express 会从同一项目的 `front/dist/` 提供页面。可选的 `GITHUB_TOKEN` 由服务端进程读取。GitHub 请求固定发往 `https://api.github.com`，单次请求含响应读取最多等待 8 秒。

## 仓库校验

发布启动和端口、反向代理、健康检查配置见 [根 README](../README.md)。

`POST /api/repositories/resolve` 接收 JSON（`Content-Type: application/json`）。

```json
{"url":"https://github.com/octocat/Hello-World.git/"}
```

HTTP 200 示例。仓库名称使用 GitHub 元数据中的规范写法。

```json
{"name":"octocat/Hello-World","defaultBranch":"master"}
```

## 分支分页

`GET /api/repositories/:owner/:repo/branches?page=1`。将上一步的 `name` 按斜杠拆成 owner 和 repo。页码从 1 开始，省略时为 1，每页最多 30 条。

```json
{"names":["feature/demo"],"next":"2","defaultBranch":"main"}
```

每页请求前重新确认仓库公开性。默认分支来自仓库元数据，可能未出现在当前页。GitHub 标记还有下一页时返回字符串 `next`，前端将它作为下一次请求的 `page`。末页省略 `next`。

## 分支版本

后端调用 `resolveBranchVersion(owner, repo, branch)` 可获得 commit SHA。扫描入口复用同一分支解析逻辑，重新校验公开性。

## 真实扫描

`POST /api/repositories/:owner/:repo/scan` 接收 JSON `{"branch":"feature/demo"}`。传入完整分支名。成功时返回 HTTP 200，包含以下字段。

| 字段 | 内容 |
| --- | --- |
| `repository`、`branch`、`commit`、`scannedAt` | 仓库、分支、40 位 commit SHA 和 ISO 时间 |
| `read`、`skipped`、`failed` | 成功解码的文本数、跳过数、已请求但读取失败数 |
| `partial`、`limits` | 是否为部分扫描及覆盖原因。文件树截断时计数仅基于已返回条目 |
| `score`、`risks`、`checks` | 0–100 分、按严重程度排序的风险与扣分，以及四类检查明细 |

后端用 commit SHA 读取提交的树 SHA，再从递归文件树取得 blob SHA。只请求 GitHub API，不执行仓库代码。每次最多读取 24 个候选 blob，每个最多 64 KiB。优先读取 README、依赖清单和启动配置，同优先级按路径排序。单次请求限时 8 秒。从请求提交对象起，树与内容读取共用 25 秒时限，内容请求最多四个并发。跳过二进制、非 UTF-8 文件、符号链接及子模块。覆盖受限时分数暂定。

接入资料 40 分，按 README 及其安装、启动说明最多扣 20 分，缺少锁文件对应清单扣 10 分，缺少启动入口扣 10 分。可移植性 30 分，Windows 脚本和硬编码路径各扣 15 分。敏感信息 30 分，跟踪的 `.env` 扣 10 分，四类疑似凭据各扣 5 分。每条规则保留首个代表位置并扣分一次。依赖清单和启动检查覆盖 Node.js、Python、Java。未知项目类型或证据不足时相应检查标为「无法判断」。疑似凭据报告仅给出匹配类型和位置。

可运行 `npm run build` 和 `node --test test/scan.test.mjs` 验证受控扫描样例。

## 错误响应

```json
{"error":{"code":"REPOSITORY_UNAVAILABLE","message":"无法访问该仓库，请检查链接并确认仓库已公开"}}
```

| HTTP | code | 条件 |
| --- | --- | --- |
| 400 | `REPOSITORY_URL_REQUIRED` | 缺少链接 |
| 400 | `INVALID_REPOSITORY_URL` | 链接格式无效 |
| 400 | `INVALID_REPOSITORY`、`INVALID_PAGE`、`INVALID_REQUEST` | 仓库名、页码或请求格式无效 |
| 403 | `REPOSITORY_NOT_PUBLIC` | 元数据确认仓库私有或内部可见 |
| 404 | `REPOSITORY_UNAVAILABLE` | 无法访问仓库，包含 GitHub 返回 404 的情况 |
| 404 | `BRANCH_NOT_FOUND` | 版本解析时分支不存在，提示刷新列表 |
| 429 | `GITHUB_RATE_LIMITED` | GitHub 请求限流 |
| 502 | `GITHUB_NETWORK_ERROR` | GitHub 网络连接失败 |
| 502 | `GITHUB_UPSTREAM_ERROR` | GitHub 响应异常 |
| 502 | `TREE_UNAVAILABLE` | 无法读取选定版本的提交对象或文件树 |
| 504 | `GITHUB_TIMEOUT` | GitHub 请求超时 |
| 500 | `INTERNAL_ERROR` | 服务处理异常 |

版本解析参数缺少有效分支名时抛出 `INVALID_BRANCH`。健康检查仍为 `GET /api/health`。

当 GitHub 提供有效的 `Retry-After` 或已耗尽配额的重置时间时，后端在 HTTP 429 中返回 `Retry-After`（秒），并在等待窗口内直接返回限流响应。前端显示可重试时间。若限流发生在文件读取阶段，已读取的结果会以部分扫描返回。
