import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

export interface RepoFile {
  path: string
  content: string
}

export async function readRepoFiles(cwd: string, files: string[]): Promise<RepoFile[]> {
  const safeCwd = await safeRealpath(cwd)
  const results: RepoFile[] = []

  for (const file of files) {
    if (!file || file.startsWith('/') || file.includes('\\')) continue
    const absolutePath = resolve(safeCwd, file)
    if (!isInsideDirectory(safeCwd, absolutePath)) continue

    try {
      const realPath = await realpath(absolutePath)
      if (!isInsideDirectory(safeCwd, realPath)) continue
      results.push({ path: file, content: await readFile(realPath, 'utf8') })
    } catch (error: unknown) {
      if (!isMissing(error)) throw error
    }
  }

  return results
}

export async function findRelatedTests(cwd: string, sourceFile: string): Promise<string[]> {
  const parsed = parseSourcePath(sourceFile)
  if (!parsed) return []

  const candidates = [
    ...testNameVariants(join(parsed.dir, parsed.base)),
    join(parsed.dir, '__tests__', `${parsed.base}.test.ts`),
    join(parsed.dir, '__tests__', `${parsed.base}.spec.ts`),
    join(parsed.dir, '__tests__', `${parsed.base}.test.tsx`),
    join(parsed.dir, '__tests__', `${parsed.base}.spec.tsx`),
    join('tests', parsed.dir, `${parsed.base}.test.ts`),
    join('tests', parsed.dir, `${parsed.base}.spec.ts`),
    ...browserTestNameVariants(join(parsed.dir, parsed.base)),
    ...browserTestNameVariants(join(parsed.dir, '__tests__', parsed.base)),
    ...browserTestNameVariants(join('tests', parsed.dir, parsed.base)),
    ...browserTestNameVariants(join('tests', 'e2e', parsed.dir, parsed.base)),
    ...browserTestNameVariants(join('tests', 'browser', parsed.dir, parsed.base)),
    ...browserTestNameVariants(join('e2e', parsed.dir, parsed.base)),
    ...browserTestNameVariants(join('playwright', parsed.dir, parsed.base)),
    ...routeRelatedTestCandidates(parsed)
  ].map(toPosix)

  return existingRelativePaths(cwd, candidates)
}

export async function findPublicEntryHints(cwd: string, sourceFile: string, symbolName: string): Promise<string[]> {
  const hints: string[] = []
  const parsed = parseSourcePath(sourceFile)

  if (parsed) {
    for (const indexFile of [join(parsed.dir, 'index.ts'), join(parsed.dir, 'index.tsx')].map(toPosix)) {
      const content = await readExistingText(cwd, indexFile)
      if (content && exportsSymbol(content, symbolName)) hints.push(`${indexFile}#${symbolName}`)
    }
  }

  if (isFrontendEntryFile(sourceFile)) hints.push(sourceFile)
  hints.push(...await findApiContextHints(cwd, sourceFile))

  const rootIndex = await readExistingText(cwd, 'src/index.ts')
  if (rootIndex && (exportsSymbol(rootIndex, symbolName) || rootIndex.includes(sourceFile.replace(/^src\//, './')) || rootIndex.includes(sourceFile))) {
    hints.push('src/index.ts')
  }

  const packageJson = await readExistingText(cwd, 'package.json')
  if (packageJson) {
    try {
      const parsedPackage = JSON.parse(packageJson) as Record<string, unknown>
      if (typeof parsedPackage.exports !== 'undefined') hints.push('package.json#exports')
    } catch {
      // Invalid package.json should not hide other hints.
    }
  }

  return hints
}

async function findApiContextHints(cwd: string, sourceFile: string): Promise<string[]> {
  if (!/\/(api|routes|controllers?)\//i.test(sourceFile) && !/(api|route|controller|client)/i.test(sourceFile)) return []

  const parsed = parseSourcePath(sourceFile)
  const base = parsed?.base
  const candidates: Array<readonly [string, 'contract' | 'msw']> = [
    ['openapi.yaml', 'contract'] as const,
    ['openapi.yml', 'contract'] as const,
    ['openapi.json', 'contract'] as const,
    ['swagger.json', 'contract'] as const,
    ['src/mocks/handlers.ts', 'msw'] as const,
    ['src/mocks/handlers.tsx', 'msw'] as const,
    ['tests/mocks/handlers.ts', 'msw'] as const,
    ...(base ? [
      [join('tests', 'contracts', `${base}.pact.ts`), 'contract'] as const,
      [join('tests', 'contracts', `${base}.contract.ts`), 'contract'] as const,
      [join('pact', `${base}.json`), 'contract'] as const
    ] : [])
  ].map(([path, kind]) => [toPosix(path), kind] as const)

  const hints: string[] = []
  for (const [path, kind] of candidates) {
    if (await exists(join(cwd, path))) hints.push(`${path}#${kind}`)
  }
  return hints
}

function testNameVariants(prefix: string): string[] {
  return ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.test.js', '.spec.js'].map(suffix => `${prefix}${suffix}`)
}

function browserTestNameVariants(prefix: string): string[] {
  return ['.browser.test.ts', '.browser.test.tsx', '.browser.spec.ts', '.browser.spec.tsx', '.e2e.test.ts', '.e2e.spec.ts'].map(suffix => `${prefix}${suffix}`)
}

function routeRelatedTestCandidates(parsed: { dir: string; base: string }): string[] {
  if (!/^(page|layout|template|loading|error|not-found)$/i.test(parsed.base)) return []
  const routeBase = parsed.dir.split('/').filter(Boolean).at(-1)
  if (!routeBase) return []
  return [
    ...browserTestNameVariants(join('tests', 'e2e', parsed.dir, routeBase)),
    ...browserTestNameVariants(join('tests', 'browser', parsed.dir, routeBase)),
    ...browserTestNameVariants(join('e2e', parsed.dir, routeBase)),
    ...browserTestNameVariants(join('playwright', parsed.dir, routeBase))
  ]
}

function isFrontendEntryFile(path: string): boolean {
  return /(^|\/)(app|pages|routes)\//i.test(path) || /(^|\/)(page|layout|template|loading|error|not-found|App|Root|main)\.[cm]?[tj]sx?$/.test(path)
}

async function existingRelativePaths(cwd: string, candidates: string[]): Promise<string[]> {
  const results: string[] = []
  for (const candidate of candidates) {
    if (await exists(join(cwd, candidate))) results.push(candidate)
  }
  return results
}

async function readExistingText(cwd: string, relativePath: string): Promise<string | undefined> {
  try {
    return await readFile(join(cwd, relativePath), 'utf8')
  } catch (error: unknown) {
    if (isMissing(error)) return undefined
    throw error
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error: unknown) {
    if (isMissing(error)) return false
    throw error
  }
}

async function safeRealpath(path: string): Promise<string> {
  try {
    return await realpath(resolve(path))
  } catch (error: unknown) {
    if (isMissing(error)) return resolve(path)
    throw error
  }
}

function parseSourcePath(sourceFile: string): { dir: string; base: string } | undefined {
  if (!sourceFile || sourceFile.startsWith('/') || sourceFile.includes('..')) return undefined
  const dir = toPosix(dirname(sourceFile))
  const fileName = sourceFile.split('/').at(-1)
  if (!fileName) return undefined
  const base = fileName.replace(/\.[^.]+$/, '')
  return { dir: dir === '.' ? '' : dir, base }
}

function exportsSymbol(content: string, symbolName: string): boolean {
  return new RegExp(`export\\s+(?:\\{[^}]*\\b${escapeRegExp(symbolName)}\\b|[^;]*\\b${escapeRegExp(symbolName)}\\b)`).test(content)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isInsideDirectory(cwd: string, absolutePath: string): boolean {
  const rel = relative(cwd, absolutePath)
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith('/')
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/')
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}
