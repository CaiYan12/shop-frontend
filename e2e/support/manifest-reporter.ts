/**
 * 固定 manifest reporter（E1）。
 *
 * 每轮写 <runDir>/manifest.json：把六条业务 spec 与 theme.spec.ts 分开统计，
 * 记录实际浏览器版本（globalSetup 写入 browser.json）、提交 SHA、逐条状态、
 * 失败原因与 trace / 截图附件路径。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'
import { resolveRunContext } from './run-context.mjs'

type SuiteKey = 'business' | 'theme' | 'other'

interface ManifestAttachment {
  readonly name: string
  readonly contentType: string
  readonly path: string | null
}

interface ManifestTest {
  readonly file: string
  readonly title: string
  readonly status: TestResult['status']
  readonly durationMs: number
  readonly retry: number
  readonly error: string | null
  readonly attachments: ManifestAttachment[]
}

interface SuiteSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  tests: ManifestTest[]
}

function emptySuite (): SuiteSummary {
  return { total: 0, passed: 0, failed: 0, skipped: 0, tests: [] }
}

function suiteKeyOf (file: string): SuiteKey {
  const normalized = file.split('\\').join('/')
  if (normalized.endsWith('theme.spec.ts')) return 'theme'
  if (normalized.endsWith('.spec.ts')) return 'business'
  return 'other'
}

function readCommit (): { sha: string | null, branch: string | null } {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
    return { sha, branch: branch === '' ? null : branch }
  } catch {
    return { sha: null, branch: null }
  }
}

function readBrowserInfo (runDir: string): Record<string, unknown> {
  const path = join(runDir, 'browser.json')
  if (!existsSync(path)) {
    return { name: 'chromium', version: null, error: 'browser.json 缺失（globalSetup 未完成或失败）' }
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch (error) {
    return { name: 'chromium', version: null, error: 'browser.json 无法解析：' + (error instanceof Error ? error.message : String(error)) }
  }
}

class ManifestReporter implements Reporter {
  private readonly startedAt = new Date().toISOString()
  private config: FullConfig | null = null
  private expected = 0
  private readonly suites: Record<SuiteKey, SuiteSummary> = {
    business: emptySuite(),
    theme: emptySuite(),
    other: emptySuite(),
  }

  printsToStdio (): boolean {
    return false
  }

  onBegin (config: FullConfig, suite: Suite): void {
    this.config = config
    this.expected = suite.allTests().length
  }

  onTestEnd (test: TestCase, result: TestResult): void {
    const file = relative(process.cwd(), test.location.file).split('\\').join('/')
    const key = suiteKeyOf(file)
    const suite = this.suites[key]
    const row: ManifestTest = {
      file,
      title: test.title,
      status: result.status,
      durationMs: result.duration,
      retry: result.retry,
      error: result.error?.message ?? null,
      attachments: result.attachments.map((attachment) => ({
        name: attachment.name,
        contentType: attachment.contentType,
        path: attachment.path ?? null,
      })),
    }
    suite.tests.push(row)
    suite.total += 1
    if (result.status === 'passed') suite.passed += 1
    else if (result.status === 'skipped') suite.skipped += 1
    else suite.failed += 1
  }

  onEnd (result: FullResult): void {
    const { runId, runDir } = resolveRunContext()
    const commit = readCommit()
    const browser = readBrowserInfo(runDir)
    const project = this.config?.projects[0]
    const baseURL = String(project?.use?.baseURL ?? '')
    const failures = Object.values(this.suites)
      .flatMap((suite) => suite.tests)
      .filter((test) => test.error !== null)
      .map((test) => ({ file: test.file, title: test.title, error: test.error }))

    const manifest = {
      schema: 'shop-frontend-e2e-manifest/v1',
      runId,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: result.duration,
      status: result.status,
      command: 'pnpm verify:e2e',
      commit,
      environment: {
        node: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        baseURL,
      },
      browser,
      backend: {
        head: process.env.E2E_BACKEND_HEAD?.trim() || null,
        worktree: process.env.E2E_BACKEND_WORKTREE?.trim() || null,
      },
      config: {
        workers: this.config?.workers ?? null,
        retries: this.config?.projects[0]?.retries ?? null,
        trace: 'retain-on-failure',
        projects: this.config?.projects.map((item) => item.name) ?? [],
      },
      expectedTests: this.expected,
      suites: this.suites,
      failures,
      artifacts: {
        manifest: 'manifest.json',
        browser: 'browser.json',
        runDir,
      },
    }

    const path = join(runDir, 'manifest.json')
    writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    console.log('[e2e] 固定 manifest（业务 ' + this.suites.business.passed + '/' + this.suites.business.total +
      '，theme ' + this.suites.theme.passed + '/' + this.suites.theme.total + '）-> ' + path)
  }
}

export default ManifestReporter
