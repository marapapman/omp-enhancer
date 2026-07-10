import { describe, expect, it } from 'vitest'
import { buildTestHelpText, parseTestCommandMode } from '../../../src/commands/testCommand.js'

describe('parseTestCommandMode', () => {
  it('runs the default workflow when no args are provided', () => {
    expect(parseTestCommandMode('')).toEqual({ kind: 'run', files: [] })
  })

  it('treats non-command args as target files', () => {
    expect(parseTestCommandMode('src/auth/parseToken.ts src/billing/invoice.ts')).toEqual({
      kind: 'run',
      files: ['src/auth/parseToken.ts', 'src/billing/invoice.ts']
    })
  })

  it('supports natural subcommands without dashes', () => {
    expect(parseTestCommandMode('help')).toEqual({ kind: 'help' })
    expect(parseTestCommandMode('check')).toEqual({ kind: 'check' })
    expect(parseTestCommandMode('report')).toEqual({ kind: 'report' })
    expect(parseTestCommandMode('init')).toEqual({ kind: 'init' })
  })

  it('normalizes unusual whitespace and keeps unknown words as target files', () => {
    expect(parseTestCommandMode(' \n src/a.ts\t src/b.ts  ')).toEqual({
      kind: 'run',
      files: ['src/a.ts', 'src/b.ts']
    })
    expect(parseTestCommandMode('unknown src/a.ts')).toEqual({
      kind: 'run',
      files: ['unknown', 'src/a.ts']
    })
  })

  it('rejects dashed flags and suggests the natural subcommand', () => {
    expect(parseTestCommandMode('--check')).toEqual({
      kind: 'invalid',
      message: '不支持 --check。请使用 /test check。'
    })
  })
})

describe('buildTestHelpText', () => {
  it('documents only /test commands without dashed variants', () => {
    const help = buildTestHelpText()

    expect(help).toContain('/test help')
    expect(help).toContain('/test check')
    expect(help).toContain('/test report')
    expect(help).toContain('/test init')
    expect(help).toContain('浏览器交互')
    expect(help).toContain('前端目标按 browserPlan 采集浏览器证据')
    expect(help).toContain('propertyPlan')
    expect(help).toContain('apiPlan')
    expect(help).toContain('coverage')
    expect(help).toContain('mutation')
    expect(help).toContain('不会执行测试命令')
    expect(help).toContain('宿主 shell')
    expect(help).not.toContain('--help')
    expect(help).not.toContain('--check')
    expect(help).not.toContain('--report')
    expect(help).not.toContain('--init')
  })
})
