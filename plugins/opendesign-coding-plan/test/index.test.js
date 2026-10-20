import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'

import extension, {
  API_KEY_ENV_VARS,
  BASE_URL,
  FALLBACK_MODELS,
  PROVIDER_ID,
  PROVIDER_NAME,
  VELA_PACKAGE,
  buildProviderConfig,
  checkRuntimeKey,
  ensureVela,
  fetchUsageReport,
  loginOpenDesign,
  loginWithVela,
  mapBillingSummary,
  mapCodingPlanWindows,
  npmGlobalVelaPath,
  parseVelaLoginOutput,
  readDesktopProfile,
  resolveVelaPath,
} from '../index.js'

const VELA_LOGIN_OUTPUT = [
  'Open this URL to continue:',
  'https://open-design.ai/cloud/cli/activate?deviceId=fnqkjdjwju1o4yysklwf57b1&userCode=JSSR8K',
  '',
  'Code: JSSR8K',
  'Login successful for user@example.com.',
  '',
].join('\n')

const BILLING_SUMMARY = {
  balanceUsd: '1.5000',
  creditsPerUsd: 10000,
  balances: { subscriptionCredits: '10000', rechargeCredits: '5000', totalAvailableCredits: '15000' },
  totalAvailableCreditsUsd: '1.5000',
  membershipTier: 'go',
  billingInterval: 'monthly',
  subscriptionStatus: 'active',
  subscriptionCurrentPeriodEnd: '2026-11-17T16:35:05.000Z',
  todayConsumedUsd: '0.0000',
  totalConsumedUsd: '0.0000',
  usageCount: 30,
}

const PREFLIGHT = {
  workspaceId: 'ws-test',
  codingPlan: {
    eligible: true,
    windows: [
      {
        limitCredits: '1000',
        usedCredits: '250',
        durationSeconds: 18000,
        windowStart: '2026-10-20T04:35:05.000Z',
        resetsAt: '2026-10-20T09:35:05.000Z',
      },
      {
        limitCredits: '5000',
        usedCredits: '5000',
        durationSeconds: 604800,
        windowStart: '2026-10-14T09:35:05.000Z',
        resetsAt: '2026-10-21T09:35:05.000Z',
      },
    ],
  },
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'opendesign-test-'))
}

function writeConfig(dir, profile) {
  const path = join(dir, 'config.json')
  writeFileSync(path, JSON.stringify({ profiles: { prod: profile } }))
  return path
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function fakeChild() {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => {
    child.killed = true
  }
  return child
}

test('registers the OpenDesign provider with login, quota, and dynamic models', () => {
  const registrations = []
  extension({
    registerProvider(name, config) {
      registrations.push({ name, config })
    },
  })

  assert.equal(registrations.length, 1)
  const [{ name, config }] = registrations
  assert.equal(name, PROVIDER_ID)
  assert.equal(config.api, 'openai-completions')
  assert.equal(config.baseUrl, BASE_URL)
  assert.equal(config.authHeader, true)
  assert.equal(config.models, FALLBACK_MODELS)
  assert.equal(config.oauth.name, PROVIDER_NAME)
  assert.equal(typeof config.oauth.login, 'function')
  assert.equal(config.usage.id, PROVIDER_ID)
  assert.equal(typeof config.usage.fetchUsage, 'function')
  assert.equal(typeof config.fetchDynamicModels, 'function')
  assert.equal(config.apiKey, undefined, 'no static key without an environment key')
})

test('an environment key becomes the provider fallback login', () => {
  const previous = process.env[API_KEY_ENV_VARS[0]]
  process.env[API_KEY_ENV_VARS[0]] = 'sk-amr-env'
  try {
    const config = buildProviderConfig()
    assert.equal(config.apiKey, 'sk-amr-env')
  } finally {
    if (previous === undefined) delete process.env[API_KEY_ENV_VARS[0]]
    else process.env[API_KEY_ENV_VARS[0]] = previous
  }
})

test('parses the device URL and code from real Vela CLI output', () => {
  assert.deepEqual(parseVelaLoginOutput(VELA_LOGIN_OUTPUT), {
    url: 'https://open-design.ai/cloud/cli/activate?deviceId=fnqkjdjwju1o4yysklwf57b1&userCode=JSSR8K',
    code: 'JSSR8K',
  })
  assert.deepEqual(parseVelaLoginOutput('no device flow here'), { url: undefined, code: undefined })
})

test('resolves the Vela binary from overrides, known locations, then PATH', () => {
  assert.equal(resolveVelaPath({ OPENDESIGN_VELA_PATH: '/custom/vela' }), '/custom/vela')
  assert.equal(resolveVelaPath({ VELA_BIN: '/other/vela' }), '/other/vela')
  assert.equal(resolveVelaPath({}, 'linux', (candidate) => candidate === '/usr/local/bin/vela'), '/usr/local/bin/vela')
  assert.equal(resolveVelaPath({ APPDATA: '/appdata' }, 'win32', () => false), 'vela.exe')
  assert.equal(resolveVelaPath({ APPDATA: '/appdata' }, 'win32', (candidate) => candidate === join('/appdata', 'npm', 'vela.cmd')), join('/appdata', 'npm', 'vela.cmd'))
  assert.equal(resolveVelaPath({}, 'sunos', () => false), 'vela', 'falls back to a PATH lookup')
})

test('ensureVela installs the CLI only when it cannot run', async () => {
  const prefix = tempDir()
  mkdirSync(join(prefix, 'bin'), { recursive: true })
  const installed = join(prefix, 'bin', 'vela')
  writeFileSync(installed, '#!/bin/sh\n')
  chmodSync(installed, 0o755)

  const calls = []
  const execFileImpl = async (file, args) => {
    calls.push([file, ...args])
    if (args[0] === '--version') throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    if (args[0] === 'install' && args[1] === '--global') return { stdout: '' }
    if (args[0] === 'prefix') return { stdout: `${prefix}\n` }
    throw new Error(`unexpected ${file} ${args.join(' ')}`)
  }
  const env = { OPENDESIGN_VELA_PATH: installed, PATH: '/nonexistent' }

  const resolved = await ensureVela({ env, execFileImpl })
  assert.equal(resolved, installed)
  assert.deepEqual(calls, [
    [installed, '--version'],
    ['npm', 'install', '--global', VELA_PACKAGE],
    ['npm', 'prefix', '--global'],
    [installed, '--version'],
  ])
})

test('ensureVela honours OPENDESIGN_SKIP_VELA_INSTALL and never installs silently', async () => {
  const calls = []
  const execFileImpl = async (file, args) => {
    calls.push([file, ...args])
    throw Object.assign(new Error('missing'), { code: 'ENOENT' })
  }
  const env = { OPENDESIGN_VELA_PATH: '/missing/vela', OPENDESIGN_SKIP_VELA_INSTALL: '1' }
  assert.equal(await ensureVela({ env, execFileImpl }), '/missing/vela')
  assert.deepEqual(calls, [['/missing/vela', '--version']])
})

test('npmGlobalVelaPath resolves the CLI from the npm global prefix', async () => {
  const prefix = tempDir()
  mkdirSync(join(prefix, 'bin'), { recursive: true })
  const installed = join(prefix, 'bin', 'vela')
  writeFileSync(installed, '#!/bin/sh\n')
  chmodSync(installed, 0o755)

  const execFileImpl = async () => ({ stdout: `${prefix}\n` })
  assert.equal(await npmGlobalVelaPath({ env: {}, platform: 'linux', execFileImpl }), installed)
  assert.equal(await npmGlobalVelaPath({ env: {}, platform: 'linux', execFileImpl: async () => ({ stdout: '/does-not-exist\n' }) }), undefined)
})

test('loginWithVela relays the device URL and code from the CLI', async () => {
  const child = fakeChild()
  const auth = []
  const promise = loginWithVela({
    velaPath: '/usr/bin/vela',
    callbacks: { onAuth: (payload) => auth.push(payload), signal: new AbortController().signal },
    spawnImpl: () => child,
  })
  setImmediate(() => {
    child.stdout.emit('data', Buffer.from(VELA_LOGIN_OUTPUT))
    child.emit('close', 0)
  })
  await promise
  assert.equal(auth.length, 1)
  assert.equal(auth[0].url, 'https://open-design.ai/cloud/cli/activate?deviceId=fnqkjdjwju1o4yysklwf57b1&userCode=JSSR8K')
  assert.match(auth[0].instructions, /JSSR8K/)
})

test('loginWithVela surfaces a failed sign-in', async () => {
  const child = fakeChild()
  const promise = loginWithVela({
    velaPath: '/usr/bin/vela',
    callbacks: { onAuth() {}, signal: new AbortController().signal },
    spawnImpl: () => child,
  })
  setImmediate(() => {
    child.stderr.emit('data', Buffer.from('device authorization expired'))
    child.emit('close', 1)
  })
  await assert.rejects(promise, /vela login exited with code 1.*device authorization expired/)
})

test('loginOpenDesign reuses a signed-in Vela session without spawning login', async () => {
  const dir = tempDir()
  const configPath = writeConfig(dir, {
    controlKey: 'ck-session',
    runtimeKey: 'sk-amr-session',
    user: { email: 'user@example.com' },
  })
  let loginCalls = 0
  const key = await loginOpenDesign(
    { onAuth() {}, onPrompt: async () => '', signal: new AbortController().signal },
    {
      env: { OPENDESIGN_CONFIG_PATH: configPath },
      fetch: async () => jsonResponse(200, { data: [{ id: 'm1' }] }),
      ensureVela: async () => {
        throw new Error('ensureVela must not run for a reusable session')
      },
      loginWithVela: async () => {
        loginCalls += 1
      },
    },
  )
  assert.equal(key, 'sk-amr-session')
  assert.equal(loginCalls, 0)
})

test('loginOpenDesign harvests the runtime key that vela login stored', async () => {
  const dir = tempDir()
  const configPath = join(dir, 'config.json')
  const prompts = []
  const requested = []
  const key = await loginOpenDesign(
    {
      onAuth(payload) {
        requested.push(payload)
      },
      onPrompt: async () => '',
      signal: new AbortController().signal,
    },
    {
      env: { OPENDESIGN_CONFIG_PATH: configPath },
      fetch: async () => jsonResponse(200, { data: [{ id: 'm1' }] }),
      ensureVela: async ({ env }) => {
        assert.equal(env.OPENDESIGN_CONFIG_PATH, configPath)
        return '/usr/bin/vela'
      },
      loginWithVela: async ({ velaPath }) => {
        assert.equal(velaPath, '/usr/bin/vela')
        writeConfig(dir, { controlKey: 'ck-fresh', runtimeKey: 'sk-amr-fresh' })
        return VELA_LOGIN_OUTPUT
      },
      log: undefined,
      prompts,
    },
  )
  assert.equal(key, 'sk-amr-fresh')
  assert.deepEqual(requested, [], 'no API-key fallback when vela login succeeds')
})

test('loginOpenDesign falls back to a console API key when vela login fails', async () => {
  const dir = tempDir()
  const configPath = join(dir, 'config.json')
  const auth = []
  const key = await loginOpenDesign(
    {
      onAuth: (payload) => auth.push(payload),
      onPrompt: async () => '  sk-amr-pasted  ',
      signal: new AbortController().signal,
    },
    {
      env: { OPENDESIGN_CONFIG_PATH: configPath },
      fetch: async () => jsonResponse(200, { data: [] }),
      ensureVela: async () => '/usr/bin/vela',
      loginWithVela: async () => {
        throw new Error('vela login exited with code 1: device authorization expired')
      },
    },
  )
  assert.equal(key, 'sk-amr-pasted')
  assert.equal(auth.length, 1)
  assert.match(auth[0].url, /cloud\/api-keys$/)
})

test('loginOpenDesign rejects a key the gateway refuses', async () => {
  await assert.rejects(
    loginOpenDesign(
      { onAuth() {}, onPrompt: async () => 'sk-amr-bad', signal: new AbortController().signal },
      {
        env: { OPENDESIGN_CONFIG_PATH: join(tempDir(), 'missing.json') },
        fetch: async () => jsonResponse(401, {}),
        ensureVela: async () => '/usr/bin/vela',
        loginWithVela: async () => {
          throw new Error('vela login exited with code 1')
        },
      },
    ),
    /OpenDesign rejected this runtime key/,
  )
})

test('checkRuntimeKey treats network failures differently from rejection', async () => {
  assert.equal(await checkRuntimeKey('k', async () => jsonResponse(200, { data: [] })), true)
  await assert.rejects(checkRuntimeKey('k', async () => jsonResponse(403, {})), /rejected/)
  await assert.rejects(
    checkRuntimeKey('k', async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }),
    /getaddrinfo/,
  )
})

test('readDesktopProfile returns the first profile holding a control key', () => {
  const dir = tempDir()
  const configPath = writeConfig(dir, {
    controlKey: 'ck',
    runtimeKey: 'rk',
    workspaceId: 'ws-from-config',
    user: { email: 'user@example.com' },
  })
  assert.deepEqual(readDesktopProfile(configPath), {
    controlKey: 'ck',
    runtimeKey: 'rk',
    workspaceId: 'ws-from-config',
    email: 'user@example.com',
  })
  assert.equal(readDesktopProfile(join(dir, 'absent.json')), null)
})

test('mapBillingSummary turns a live summary into plan notes', () => {
  const { notes, metadata } = mapBillingSummary(BILLING_SUMMARY, 'user@example.com')
  assert.deepEqual(notes, [
    'Plan: go (active)',
    'Credits: 15000 ($1.50) — subscription 10000, recharge 5000',
    'Spent today: $0.00 (total $0.00)',
    'Billing period ends 2026-11-17',
  ])
  assert.equal(metadata.planType, 'go')
  assert.equal(metadata.accountId, 'user@example.com')
  assert.deepEqual(metadata.credits, { available: 15000, subscription: 10000, recharge: 5000 })
})

test('mapCodingPlanWindows builds percentage rows with window metadata', () => {
  const limits = mapCodingPlanWindows(PREFLIGHT, 'user@example.com')
  assert.equal(limits.length, 2)
  const [fiveHours, weekly] = limits
  assert.equal(fiveHours.label, 'Design Plan 5 hours')
  assert.equal(fiveHours.window.id, '5h')
  assert.equal(fiveHours.window.resetsAt, Date.parse('2026-10-20T09:35:05.000Z'))
  assert.equal(fiveHours.amount.remaining, 75)
  assert.equal(fiveHours.status, 'ok')
  assert.equal(weekly.label, 'Design Plan 7 days')
  assert.equal(weekly.window.resetsAt, Date.parse('2026-10-21T09:35:05.000Z'))
  assert.equal(weekly.status, 'exhausted')
  assert.equal(weekly.amount.usedFraction, 1)
  assert.deepEqual(mapCodingPlanWindows({ codingPlan: { windows: [] } }), [])
  assert.deepEqual(mapCodingPlanWindows({ codingPlan: { windows: [{ limitCredits: 0 }] } }), [])
})

test('mapCodingPlanWindows derives resetsAt from windowStart when the source omits it', () => {
  const payload = {
    codingPlan: {
      windows: [
        { limitCredits: 100, usedCredits: 10, durationSeconds: 3600, windowStart: 1792400000 },
        { limitCredits: 100, usedCredits: 10, durationSeconds: 3600 },
      ],
    },
  }
  const [derived, missing] = mapCodingPlanWindows(payload)
  assert.equal(derived.window.resetsAt, 1792403600000)
  assert.equal(missing.window.resetsAt, undefined)
})

test('fetchUsageReport reports plan notes and preflight windows from the Vela CLI', async () => {
  const dir = tempDir()
  const configPath = writeConfig(dir, { controlKey: 'ck-live', runtimeKey: 'rk-live', user: { email: 'user@example.com' } })
  const env = {
    OPENDESIGN_CONFIG_PATH: configPath,
    OPENDESIGN_WORKSPACE_ID: 'ws-test',
    OPENDESIGN_CONTROL_KEY: 'ck-live',
  }
  const velaCalls = []
  const fetchImpl = async () => jsonResponse(403, {})
  const { report, problems } = await fetchUsageReport({ apiKey: 'rk-live' }, env, fetchImpl, {
    runVela: async (path, args) => {
      velaCalls.push(args.join(' '))
      if (args[1] === 'summary') return BILLING_SUMMARY
      return PREFLIGHT
    },
  })

  assert.deepEqual(problems, ['coding plan: HTTP 403 from https://amr-api.open-design.ai/api/v1/workspaces/ws-test/billing/coding-plan-usage'])
  assert.equal(report.provider, PROVIDER_ID)
  assert.equal(report.notes[0], 'Plan: go (active)')
  assert.equal(report.metadata.workspaceId, 'ws-test')
  assert.deepEqual(
    report.limits.map((limit) => limit.label),
    ['Design Plan 5 hours', 'Design Plan 7 days'],
  )
  assert.deepEqual(velaCalls, ['billing summary --format json', 'billing preflight --workspace-id ws-test --format json'])
})

test('fetchUsageReport keeps Design Plan windows when vela summary fails', async () => {
  const dir = tempDir()
  const configPath = writeConfig(dir, { controlKey: 'ck-live', runtimeKey: 'rk-live', user: { email: 'user@example.com' } })
  const env = {
    OPENDESIGN_CONFIG_PATH: configPath,
    OPENDESIGN_WORKSPACE_ID: 'ws-test',
    OPENDESIGN_CONTROL_KEY: 'ck-live',
  }
  const { report, problems } = await fetchUsageReport({ apiKey: 'rk-live' }, env, async () => jsonResponse(401, {}), {
    runVela: async (path, args) => {
      if (args[1] === 'summary') throw new Error('fetch billing summary: API request failed with status 403')
      return PREFLIGHT
    },
  })

  assert.equal(report.limits.length, 2)
  assert.equal(report.limits[0].window.resetsAt, Date.parse('2026-10-20T09:35:05.000Z'))
  assert.ok(report.notes.every((note) => !/quota unavailable/i.test(note)))
  assert.match(report.notes[0], /Plan details unavailable/)
  assert.match(problems[0], /vela summary/)
})

test('fetchUsageReport explains how to restore quota when no Vela session exists', async () => {
  const env = { OPENDESIGN_CONFIG_PATH: join(tempDir(), 'missing.json') }
  const { report, problems } = await fetchUsageReport({ apiKey: 'rk' }, env, async () => jsonResponse(500, {}), {
    runVela: async () => {
      throw new Error('Vela CLI not found (vela); install the Vela CLI')
    },
  })
  assert.equal(report.limits.length, 0)
  assert.match(report.notes[0], /run \/login opendesign/)
  assert.match(problems[0], /vela summary/)
})

test('fetchUsageReport ignores requests without a runtime credential', async () => {
  assert.equal(await fetchUsageReport({}, {}, async () => jsonResponse(200, {})), null)
})
