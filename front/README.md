# GitCheck 前端

在 `front/` 目录运行 `npm ci`、`npm run dev`，打开终端显示的地址。运行 `npm run build` 会检查类型并生成 `front/dist/`，由生产环境的 Express 同源提供。

发布启动命令见 [根 README](../README.md)。

真实仓库扫描需要先在 backend 目录启动后端（`npm ci`、`npm run dev`）。Vite 将相对路径 `/api` 转发到 `localhost:3000`，支持通过 `GITCHECK_API_TARGET` 覆盖目标。输入 `https://github.com/octocat/Hello-World`，查询后选择分支并点击「开始扫描」。等待结束后可在报告中核对分支、commit 和覆盖范围。分支已删除时可通过「刷新分支」重新加载。

`src/http.ts` 实现仓库校验、分支分页和扫描请求，`src/api.ts` 定义契约。真实扫描使用等待提示，最近 30 条成功查询与扫描报告保存在当前浏览器的 localStorage 中，刷新后可从报告记录打开。存储逻辑位于 `src/history/`。

扫描请求为 `POST /api/repositories/:owner/:repo/scan`，JSON 请求体为 `{"branch":"feature/demo"}`。报告使用后端返回的完整 commit SHA。后端返回 `partial: true` 时，界面将分数标为暂定并列出覆盖限制。若返回 `BRANCH_NOT_FOUND`，刷新分支列表后可重新选择。
