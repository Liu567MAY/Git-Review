type Category = 'integrity' | 'platform' | 'path' | 'security'
type Level = 'HIGH' | 'MED' | 'LOW'
type Check = { name: string; status: string; evidence: string }
type Risk = {
  category: Category; level: Level; rule: string; title: string; location: string
  evidence: string; advice: string; deduction: number
}

const readmePattern = /(?:^|\/)readme(?:\.[^/]+)?$/i
const manifestPattern = /(?:^|\/)(package\.json|requirements(?:-[^/]+)?\.txt|pyproject\.toml|pipfile|setup\.py|pom\.xml|build\.gradle(?:\.kts)?)$/i
const configPattern = /(?:^|\/)(?:procfile|dockerfile|compose\.ya?ml|docker-compose\.ya?ml)$/i
const windowsPattern = /\.(?:bat|cmd|ps1|vbs)$/i
const secretPatterns = [
  { rule: 'SEC_SK', label: 'sk- 格式凭据', pattern: /\bsk-[a-z0-9_-]{12,}/i },
  { rule: 'SEC_AKID', label: 'AKID 格式凭据', pattern: /\b(?:AKID[A-Z0-9]{8,}|AKIA[A-Z0-9]{16})\b/i },
  { rule: 'SEC_BEARER', label: 'Bearer 凭据', pattern: /\bBearer[ \t]+[a-z0-9._~+\/=-]{8,}/i },
  { rule: 'SEC_KEY', label: '私钥标记', pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/ },
]
const pathPattern = /(?:\b[A-Z]:(?:\\{1,2}|\/)[^\s"'<>\\/]|\/(?:Users|home)\/[^\s"'<>/])/i
const installPattern = /\b(?:npm\s+(?:ci|i|install)|(?:pnpm|yarn|uv|poetry)\s+(?:install|sync)|pip3?\s+install|mvnw?\s+(?:install|package)|gradlew?\s+build)\b/i
const runPattern = /\b(?:npm\s+(?:start|run\s+(?:dev|start|serve))|(?:node|python3?|java)\s+(?:-m\s+|-jar\s+)?[\w./-]+|(?:uvicorn|flask\s+run|gunicorn|mvnw?\s+spring-boot:run|gradlew?\s+(?:bootRun|run)))\b/i

export function redact(value: string) {
  for (const { pattern } of secretPatterns) value = value.replace(new RegExp(pattern.source, pattern.flags + 'g'), '[已脱敏]')
  const token = process.env.GITHUB_TOKEN?.trim()
  return token ? value.replaceAll(token, '[已脱敏]') : value
}

export function priority(path: string) {
  if (readmePattern.test(path)) return path.includes('/') ? 2 : 0
  if (manifestPattern.test(path) || configPattern.test(path)) return path.includes('/') ? 3 : 1
  return 4
}

function startupDeclaration(path: string, text: string) {
  if (/(?:^|\/)package\.json$/i.test(path)) {
    try {
      const pkg = JSON.parse(text)
      return ['start', 'dev', 'serve'].some(key => typeof pkg?.scripts?.[key] === 'string' && pkg.scripts[key].trim())
        || typeof pkg?.bin === 'string' || Boolean(pkg?.bin && Object.keys(pkg.bin).length)
    } catch { return false }
  }
  if (/(?:^|\/)pyproject\.toml$/i.test(path)) return /^\s*\[(?:project\.scripts|tool\.poetry\.scripts)\][^\S\r\n]*\r?\n(?:[ \t]*(?:#.*)?\r?\n)*[ \t]*[\w.-]+\s*=/m.test(text)
  if (/(?:^|\/)setup\.py$/i.test(path)) return /\bconsole_scripts\b/.test(text)
  if (/(?:^|\/)pom\.xml$/i.test(path)) return /<artifactId>\s*spring-boot-maven-plugin\s*<\/artifactId>|<mainClass>\s*[^<\s]/.test(text)
  if (/(?:^|\/)build\.gradle(?:\.kts)?$/i.test(path)) return /\bmainClass\b|org\.springframework\.boot/.test(text)
  return configPattern.test(path) && (/^\s*(?:CMD|ENTRYPOINT)\s+\S/m.test(text) || /^\s*(?:command|entrypoint|web|worker):\s*\S/m.test(text))
}

export function analyze(paths: string[], texts: Map<string, string>, truncated: boolean, partial: boolean) {
  const checks: Record<Category, Check[]> = { integrity: [], platform: [], path: [], security: [] }
  const findings = new Map<string, Risk>()
  const add = (category: Category, level: Level, rule: string, title: string, location: string, evidence: string, advice: string, deduction: number) => {
    if (!findings.has(rule)) findings.set(rule, { category, level, rule, title, location: redact(location), evidence, advice, deduction })
  }
  const docs = paths.filter(path => readmePattern.test(path))
  const manifests = paths.filter(path => manifestPattern.test(path))
  const readme = docs.find(path => !path.includes('/')) ?? docs[0]
  const documentation = readme ? texts.get(readme) : undefined
  const hasInstall = documentation !== undefined && installPattern.test(documentation)
  const hasRun = documentation !== undefined && runPattern.test(documentation)
  const issue = !readme ? '缺少 README' : !hasInstall && !hasRun ? 'README 缺少安装和启动说明' : !hasInstall ? 'README 缺少安装说明' : 'README 缺少启动说明'
  const readmeUnknown = readme ? documentation === undefined : truncated
  if (!readmeUnknown && (!hasInstall || !hasRun)) {
    add('integrity', 'MED', 'DOC_README', issue, readme ?? '仓库', '未识别到相应文件或常见命令', '补充 README 和可复现的安装、启动命令。', !readme ? 20 : Number(!hasInstall) * 10 + Number(!hasRun) * 10)
  }
  checks.integrity.push({
    name: 'README', status: readmeUnknown ? '无法判断' : hasInstall && hasRun ? '通过' : '需补充',
    evidence: readmeUnknown ? (readme ? redact(readme) + ' 未读取' : '文件树截断') : hasInstall && hasRun ? redact(readme!) : issue,
  })
  const languages = new Set(manifests.map(path => {
    if (/(?:^|\/)package\.json$/i.test(path)) return 'Node.js'
    return /(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?)$/i.test(path) ? 'Java' : 'Python'
  }))
  const orphanLock = paths.find(path => {
    const match = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|uv\.lock)$/i.exec(path)
    if (!match) return false
    const directory = path.slice(0, match.index + match[1].length)
    const manifest = /^(?:poetry|uv)\./i.test(match[2]) ? 'pyproject.toml' : 'package.json'
    return !paths.some(item => item.toLowerCase() === (directory + manifest).toLowerCase())
  })
  if (orphanLock && !truncated) add('integrity', 'MED', 'DOC_MANIFEST', '锁文件缺少对应依赖清单',
    orphanLock, '同目录未发现对应的依赖清单', '补齐依赖清单并同步重新生成锁文件。', 10)
  checks.integrity.push({
    name: '依赖清单', status: orphanLock ? (truncated ? '无法判断' : '需补充') : manifests.length ? '通过' : '无法判断',
    evidence: orphanLock ? redact(orphanLock) + ' 的对应清单未在文件树中出现'
      : manifests.length ? [...languages].join(' / ') + ' · ' + manifests.slice(0, 3).map(redact).join('、') : '未识别到支持的项目类型或依赖清单',
  })
  const declared = [...texts].find(([path, text]) => startupDeclaration(path, text))
  const entry = declared?.[0] ?? (hasRun ? readme : undefined)
  const entryUnknown = !entry && (!manifests.length || truncated || paths.some(path =>
    (readmePattern.test(path) || manifestPattern.test(path) || configPattern.test(path)) && !texts.has(path)))
  checks.integrity.push({
    name: '启动入口', status: entry ? '通过' : entryUnknown ? '无法判断' : '需补充',
    evidence: entry ? redact(entry) + ' 中识别到启动声明' : entryUnknown ? '项目类型未识别或启动相关文件读取不完整' : '未识别到启动声明',
  })
  if (!entry && !entryUnknown) add('integrity', 'MED', 'DOC_ENTRY', '缺少启动入口', manifests[0], '未识别到启动声明', '补充启动脚本或在 README 记录启动命令。', 10)

  const windows = paths.find(path => windowsPattern.test(path))
  if (windows) {
    const mentioned = docs.find(path => texts.get(path)?.includes(windows.split('/').at(-1)!))
    add('platform', 'MED', 'WIN_SCRIPT', '发现 Windows 脚本', windows,
      mentioned ? 'README 提到了此脚本 · ' + redact(mentioned) : '文件扩展名属于 Windows 脚本',
      '确认接入流程是否依赖 Windows，必要时提供跨平台入口。', 15)
  }
  const env = paths.find(path => /(?:^|\/)\.env$/.test(path))
  if (env) add('security', 'HIGH', 'SEC_ENV', '.env 已入库', env, '版本文件树包含 .env', '移除真实环境配置并核实是否需要轮换凭据。', 10)

  for (const [path, text] of texts) {
    for (const [index, line] of text.split(/\r\n|\n|\r/).entries()) {
      const location = path + ':' + (index + 1)
      if (pathPattern.test(line)) add('path', 'MED', 'ABS_PATH', '发现硬编码绝对路径', location,
        '匹配到盘符路径或用户主目录路径', '使用相对路径或通过配置传入路径。', 15)
      for (const { rule, label, pattern } of secretPatterns) {
        if (pattern.test(line)) add('security', 'HIGH', rule, '疑似' + label, location,
          label, '核实是否为真实凭据，如有泄露请轮换并移除。', 5)
      }
    }
  }
  for (const [category, name, incomplete] of [
    ['platform', 'Windows 脚本', truncated],
    ['path', '硬编码路径', partial],
    ['security', '敏感信息', partial],
  ] as const) {
    const matches = [...findings.values()].filter(risk => risk.category === category)
    checks[category] = matches.length
      ? matches.map(risk => ({ name: risk.title, status: '发现', evidence: risk.location }))
      : [{ name, status: incomplete ? '无法判断' : '未发现', evidence: incomplete ? '扫描覆盖不足' : '覆盖范围内未命中' }]
  }
  const rank = { HIGH: 0, MED: 1, LOW: 2 }
  const risks = [...findings.values()].sort((a, b) => rank[a.level] - rank[b.level])
  return { risks, checks, score: 100 - risks.reduce((total, risk) => total + risk.deduction, 0) }
}
