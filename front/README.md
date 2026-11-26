# GitCheck 前端

在 front 目录运行 `npm ci`、`npm run dev`，打开终端显示的地址。运行 `npm run build` 进行类型检查并生成 dist。

在「体验示例」中选择公开仓库（`https://github.com/example/agent-starter`），选择分支再扫描。其余选项模拟仓库非公开、无法访问、查询限流及网络失败。

| 分支 | 模拟结果 |
| --- | --- |
| main | Node.js，含 README、平台、路径及敏感信息风险 |
| release/clean | Python，无风险 |
| audit/partial | 部分覆盖、未知项目类型、分数暂定 |
| java/demo | Java，无风险 |
| deleted/demo | 分支已删除 |
| error/tree | 文件树读取失败 |

后四个分支可通过「加载更多」查看。报告记录在页面会话中保留。所有凭据示例均为虚构且脱敏。

`src/api.ts` 定义仓库公开性查询、分页分支查询和扫描进度及报告契约，`src/mock.ts` 提供实现。Vite 将 /api 转发到 localhost:3000。后端当前提供 GET /api/health，仓库查询、分支分页、扫描进度和 commit 报告的 HTTP 路径与数据结构留待联调。
