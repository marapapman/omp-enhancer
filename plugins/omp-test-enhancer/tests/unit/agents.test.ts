import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

async function agentSource(name: string): Promise<string> {
  return readFile(join(process.cwd(), 'agents', `${name}.md`), 'utf8')
}

function frontmatterTools(source: string): string[] {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  const block = frontmatter.match(/^tools:\s*\n((?:\s+-\s*[^\n]+\n?)*)/m)?.[1] ?? ''
  return [...block.matchAll(/^\s*-\s*([^\s]+)\s*$/gm)].map(match => match[1] ?? '')
}

describe('packaged testing agents', () => {
  it('keeps planning read-only and hands off a concrete evidence plan', async () => {
    const source = await agentSource('test-planner')
    const tools = frontmatterTools(source)

    expect(tools).toEqual(expect.arrayContaining(['read', 'search', 'find', 'omp_test_analyze', 'omp_test_context']))
    expect(tools).not.toEqual(expect.arrayContaining(['edit', 'write', 'bash', 'omp_test_browser_check', 'omp_test_gate']))
    expect(source).toMatch(/model:\s*\n\s*-\s*pi\/plan\s*\n\s*-\s*pi\/slow/)
    expect(source).toMatch(/target-to-behavior matrix/i)
    expect(source).toMatch(/TEST_PLAN/)
    expect(source).toMatch(/do not edit or[\s\S]*do not run shell/i)
  })

  it('limits execution to authorized tests, fixtures, commands, and fresh evidence', async () => {
    const source = await agentSource('test-executor')
    const tools = frontmatterTools(source)

    expect(tools).toEqual(expect.arrayContaining(['read', 'edit', 'write', 'bash', 'omp_test_browser_check']))
    expect(tools).not.toEqual(expect.arrayContaining(['omp_test_gate', 'omp_test_report']))
    expect(source).toMatch(/Modify only test files and fixtures/i)
    expect(source).toMatch(/Do not modify production code/i)
    expect(source).toMatch(/host-authorized real test command/i)
    expect(source).toMatch(/TEST_EXECUTION/)
    expect(source).toMatch(/Never claim a command passed without current output/i)
  })

  it('keeps final review independent, read-only, and advisory', async () => {
    const source = await agentSource('test-reviewer')
    const tools = frontmatterTools(source)

    expect(tools).toEqual(expect.arrayContaining(['read', 'search', 'find', 'omp_test_gate', 'omp_test_report']))
    expect(tools).not.toEqual(expect.arrayContaining(['edit', 'write', 'bash', 'omp_test_browser_check']))
    expect(source).toMatch(/model:\s*\n\s*-\s*pi\/slow/)
    expect(source).toMatch(/Do not inherit the executor's conclusions/i)
    expect(source).toMatch(/does not execute a command or own workflow completion/i)
    expect(source).toMatch(/TEST_REVIEW/)
    expect(source).toMatch(/Do not fix findings or request a hidden retry/i)
  })

  it('never gives packaged agents lifecycle-control authority', async () => {
    const sources = await Promise.all([
      agentSource('test-planner'),
      agentSource('test-executor'),
      agentSource('test-reviewer'),
    ])

    expect(sources.join('\n')).not.toMatch(/block:\s*true|continue:\s*true/i)
  })
})
