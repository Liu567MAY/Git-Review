import type { Report, Risk, ScanApi } from './api'

export const examples = {
  'agent-starter': '公开仓库',
  'private': '非公开',
  'missing': '无法访问',
  'rate-limit': '限流',
  'offline': '网络失败',
}
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const findings: Risk[] = [
  { category: 'security', level: 'HIGH', rule: 'SEC-01', title: '疑似服务凭据', location: 'src/config.ts:12', evidence: 'API_KEY = "sk-••••DEMO"（虚构值）', advice: '检查配置来源，将凭据迁入环境变量。若确认真实泄露，撤销并轮换凭据。', deduction: 10 },
  { category: 'security', level: 'HIGH', rule: 'SEC-02', title: '已跟踪 .env 文件', location: '.env', evidence: '文件树包含 .env，内容已省略。', advice: '移除已跟踪的环境文件并提供 .env.example。', deduction: 8 },
  { category: 'platform', level: 'MED', rule: 'WIN-01', title: '启动依赖 PowerShell 脚本', location: 'scripts/setup.ps1', evidence: 'README.md 指向 scripts/setup.ps1', advice: '提供等效的跨平台启动命令。', deduction: 5 },
  { category: 'path', level: 'MED', rule: 'PATH-01', title: '代码依赖本机绝对路径', location: 'src/config.ts:8', evidence: 'C:\\Demo\\workspace', advice: '使用相对路径或可配置的工作目录。', deduction: 5 },
  { category: 'integrity', level: 'LOW', rule: 'DOC-01', title: 'README 缺少依赖安装说明', location: 'README.md', evidence: 'README 有启动命令，缺少安装步骤。', advice: '补充运行环境版本和依赖安装命令。', deduction: 4 },
]

const fixtures: Record<string, { sha: string; dependency?: string; entry?: string; partial?: boolean; risks: Risk[] }> = {
  main: { sha: '8f3a21c', dependency: 'package.json', entry: 'package.json → scripts.dev', risks: findings },
  'release/clean': { sha: 'b72d6e1', dependency: 'pyproject.toml', entry: 'pyproject.toml → project.scripts', risks: [] },
  'audit/partial': { sha: '71ae322', partial: true, risks: [findings[1]] },
  'java/demo': { sha: 'c4d9a70', dependency: 'pom.xml', entry: 'pom.xml → spring-boot-maven-plugin', risks: [] },
}

function createReport(repository: string, branch: string): Report {
  const fixture = fixtures[branch]
  const { risks, dependency, entry, partial } = fixture
  const readme = branch === 'main' ? '已发现 · 缺安装说明' : '已发现 · 含安装和启动说明'
  const check = (name: string, evidence?: string) => ({
    name, status: evidence ? '已识别' : '无法判断', evidence: evidence ?? '当前文件树中未识别受支持的项目类型。',
  })
  const riskCheck = (category: Risk['category']) => {
    const matches = risks.filter(risk => risk.category === category)
    return matches.length
      ? matches.map(risk => ({ name: risk.title, status: '有发现', evidence: risk.location }))
      : [{ name: '规则匹配', status: partial ? '无法判断' : '未发现', evidence: partial ? '文件树或内容读取覆盖不足。' : '已覆盖的文件未触发该类别规则。' }]
  }
  return {
    repository, branch, commit: fixture.sha, scannedAt: new Date().toISOString(),
    read: partial ? 12 : branch === 'main' ? 128 : 24,
    skipped: partial ? 15 : 2, failed: partial ? 3 : 0,
    limits: partial ? ['文件树截断', '有 15 个文件因大小或数量上限跳过', '有 3 个文本文件读取失败'] : ['跳过 2 个二进制文件'],
    score: 100 - risks.reduce((total, risk) => total + risk.deduction, 0), risks,
    checks: {
      integrity: [check('README', 'README.md · ' + readme), check('依赖清单', dependency), check('启动入口', entry)],
      platform: riskCheck('platform'), path: riskCheck('path'), security: riskCheck('security'),
    },
  }
}

export const api: ScanApi = {
  async repository(name) {
    await wait(240)
    if (name === 'example/private') throw new Error('该仓库为非公开仓库，请输入公开的 GitHub 仓库链接')
    if (name === 'example/rate-limit') throw new Error('查询达到限流上限，请稍后重试')
    if (name === 'example/offline') throw new Error('网络连接失败，请检查网络后重试')
    if (name !== 'example/agent-starter') throw new Error('无法访问该仓库，请检查链接并确认仓库已公开。Mock 模式仅提供示例仓库。')
    return { name, defaultBranch: 'main' }
  },
  async branches(_repo, cursor) {
    await wait(240)
    return cursor ? { names: ['audit/partial', 'java/demo', 'deleted/demo', 'error/tree'] }
      : { names: ['main', 'release/clean'], next: 'page-2' }
  },
  async scan(repo, branch, progress) {
    await api.repository(repo.name)
    if (branch === 'deleted/demo') throw new Error('所选分支已不存在，请刷新分支列表')
    for (let step = 1; step <= 6; step++) {
      await wait(160)
      if (branch === 'error/tree') throw new Error('文件树读取失败，请重试扫描')
      progress(Math.round(step * 100 / 6))
    }
    return createReport(repo.name, branch)
  },
}
