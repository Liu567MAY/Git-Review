# GitCheck 后端接口

运行 `npm ci` 后可用 `npm run dev` 开发，或用 `npm run build` 和 `npm start` 启动编译产物。默认端口 3000，可设置 `PORT`。可选的 `GITHUB_TOKEN` 由服务端进程读取。GitHub 请求固定发往 `https://api.github.com`，单次请求含响应读取最多等待 8 秒。

## 仓库校验

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

后端调用 `resolveBranchVersion(owner, repo, branch)`，传入完整的原始分支名，获得 commit SHA。函数每次重新验证公开性。此函数供后续扫描使用。

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
| 504 | `GITHUB_TIMEOUT` | GitHub 请求超时 |
| 500 | `INTERNAL_ERROR` | 服务处理异常 |

版本解析参数缺少有效分支名时抛出 `INVALID_BRANCH`。健康检查仍为 `GET /api/health`。
