// OpenDesign (AMR) provider for OMP.
//
// Registers the OpenDesign model gateway as a first-class provider so it behaves
// like a built-in one: `/login opendesign` signs in through the Vela CLI (device
// code + browser approval) or accepts a console API key, `/model` lists the
// account's live model roster, and `/usage` reports the account's plan quota.
//
// Verified 2026-10-18 against a live membership:
//   inference  https://amr-link.open-design.ai/v1              runtime key, Bearer
//   session    ~/.amr/config.json (profiles.<name>)            runtimeKey + controlKey
//   quota      vela billing summary --format json              tier, credits, spend
//   plan rows  vela billing preflight --workspace-id <id>      Design Plan windows
//   workspace  GET /api/v1/workspaces/current (control key)    personal workspace id
// The account API rejects a personal control key with 403 on /billing/summary and
// /wallet/balance, so the Vela CLI is the working quota source; those HTTP paths
// stay as secondary probes for team workspaces.
//
// `/login opendesign` reuses a signed-in Vela session when ~/.amr/config.json
// already holds a runtime key, otherwise it makes sure the Vela CLI is installed
// (npm i -g @powerformer/vela-cli, skipped with OPENDESIGN_SKIP_VELA_INSTALL=1),
// runs `vela login`, relays the device URL and code to the OMP login dialog, and
// stores the harvested runtime key. `/logout` (OMP) deletes that stored
// credential. The Vela session file belongs to the Vela CLI and is left alone:
// remove ~/.amr/config.json to sign the CLI out as well. A key in
// OPENDESIGN_API_KEY/OPENDESIGN_RUNTIME_KEY acts as an environment login, so
// unset it when `/logout` should disable the provider.

import { execFile, spawn } from 'node:child_process'
import { accessSync, constants, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const PROVIDER_ID = 'opendesign'
export const PROVIDER_NAME = 'OpenDesign'
export const BASE_URL = (process.env.OPENDESIGN_LINK_BASE ?? 'https://amr-link.open-design.ai/v1').replace(/\/+$/, '')
const CONTROL_BASE = (process.env.OPENDESIGN_CONTROL_BASE ?? 'https://amr-api.open-design.ai/api/v1').replace(/\/+$/, '')
const API_KEY_URL = 'https://open-design.ai/cloud/api-keys'
const API_KEY_INSTRUCTIONS = 'Create an API key in the OpenDesign cloud console, then paste it here.'
export const API_KEY_ENV_VARS = Object.freeze(['OPENDESIGN_API_KEY', 'OPENDESIGN_RUNTIME_KEY'])
export const VELA_PACKAGE = '@powerformer/vela-cli'
const VELA_INSTALL_HINT = `install the Vela CLI (npm i -g ${VELA_PACKAGE}) or point OPENDESIGN_VELA_PATH at it`

const HTTP_TIMEOUT_MS = 10_000
const VELA_TIMEOUT_MS = 20_000
const VELA_INSTALL_TIMEOUT_MS = 180_000
const LOGIN_TIMEOUT_MS = 10 * 60_000
const ZERO_COST = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
const EFFORTS = Object.freeze(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

// Offline fallback roster; a credentialed run replaces it with the live /models list.
export const FALLBACK_MODELS = Object.freeze([
  ['claude-haiku-5.5', 1_000_000, 128_000, ['text', 'image']],
  ['deepseek-v4-flash', 1_048_000, 32_000, ['text']],
  ['deepseek-v4-flash-vision-exp', 1_048_000, 32_000, ['text', 'image']],
  ['deepseek-v4-pro', 1_048_000, 32_000, ['text']],
  ['deepseek-v4.1-flash', 1_048_000, 32_000, ['text', 'image']],
  ['glm-5.3-flash', 1_048_000, 32_000, ['text', 'image']],
  ['glm-5.3-flashx', 1_000_000, 32_000, ['text', 'image']],
  ['gpt-6-luna', 1_050_000, 32_000, ['text', 'image']],
  ['hy4-preview', 1_024_000, 32_000, ['text']],
  ['kimi-k2.7-code', 262_144, 32_000, ['text', 'image']],
  ['mimo-v2.6-flash', 1_048_000, 32_000, ['text', 'image']],
  ['mimo-v2.6-pro', 1_048_000, 32_000, ['text', 'image']],
].map(([id, contextWindow, maxTokens, input]) => ({
  id,
  name: id,
  reasoning: true,
  thinking: { mode: 'effort', efforts: [...EFFORTS] },
  input: [...input],
  supportsTools: true,
  cost: { ...ZERO_COST },
  contextWindow,
  maxTokens,
})))

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function numberOrUndefined(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(n) ? n : undefined
}

function positive(value, fallback) {
  const n = numberOrUndefined(value)
  return n !== undefined && n > 0 ? Math.floor(n) : fallback
}

function resolveEnvApiKey(env = process.env) {
  if (!env || typeof env !== 'object') return undefined
  for (const name of API_KEY_ENV_VARS) {
    const value = env[name]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function mapAmrModel(raw) {
  const id = firstString(raw?.id)
  if (!id || raw?.enabled === false) return null
  const metadata = raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}
  const modalities = raw?.architecture?.input_modalities
  const input = Array.isArray(modalities) && modalities.includes('image') ? ['text', 'image'] : ['text']
  return {
    id,
    name: firstString(raw.name, id),
    reasoning: true,
    thinking: { mode: 'effort', efforts: [...EFFORTS] },
    input,
    supportsTools: true,
    cost: { ...ZERO_COST },
    contextWindow: positive(metadata.context_limit, positive(metadata.context_budget, 128_000)),
    maxTokens: positive(metadata.output_budget, 32_768),
  }
}

async function fetchAmrModels(apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${BASE_URL}/models`)
  const payload = await res.json()
  const rows = Array.isArray(payload?.data) ? payload.data.map(mapAmrModel).filter(Boolean) : []
  return rows.length > 0 ? rows : null
}

export async function checkRuntimeKey(apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  if (res.status === 401 || res.status === 403) throw new Error('OpenDesign rejected this runtime key')
  if (!res.ok) throw new Error(`OpenDesign key check failed with HTTP ${res.status}`)
  return true
}

function findWorkspaceId(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 4) return undefined
  for (const [key, value] of Object.entries(node)) {
    if (/^workspace[-_]?id$/i.test(key) && typeof value === 'string' && value.trim()) return value.trim()
    const nested = findWorkspaceId(value, depth + 1)
    if (nested) return nested
  }
  return undefined
}

export function readDesktopProfile(configPath, env = process.env) {
  const path = firstString(configPath, env.OPENDESIGN_CONFIG_PATH, join(homedir(), '.amr', 'config.json'))
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
  const profiles = parsed?.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {}
  const candidates = [profiles.prod, ...Object.values(profiles)].filter((p) => p && typeof p === 'object')
  for (const profile of candidates) {
    const controlKey = firstString(profile.controlKey)
    if (!controlKey) continue
    return {
      controlKey,
      runtimeKey: firstString(profile.runtimeKey),
      workspaceId: firstString(profile.workspaceId, profile.workspace_id, findWorkspaceId(parsed)),
      email: firstString(profile.user?.email),
    }
  }
  return null
}

function velaInstallCandidates(env = process.env, platform = process.platform) {
  const exe = platform === 'win32' ? 'vela.exe' : 'vela'
  if (platform === 'win32') {
    const candidates = []
    if (env?.APPDATA) candidates.push(join(env.APPDATA, 'npm', 'vela.cmd'))
    if (env?.LOCALAPPDATA) candidates.push(join(env.LOCALAPPDATA, 'Programs', 'vela', exe))
    return candidates
  }
  const home = homedir()
  return [join(home, '.local', 'bin', exe), '/usr/local/bin/vela', '/usr/bin/vela', join(home, '.volta', 'bin', exe), '/opt/homebrew/bin/vela']
}

export function resolveVelaPath(env = process.env, platform = process.platform, isExecutable = defaultIsExecutable) {
  const explicit = firstString(env?.OPENDESIGN_VELA_PATH, env?.VELA_BIN)
  if (explicit) return explicit
  for (const candidate of velaInstallCandidates(env, platform)) {
    if (isExecutable(candidate)) return candidate
  }
  return platform === 'win32' ? 'vela.exe' : 'vela'
}

function defaultIsExecutable(path) {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function npmExecutable(env = process.env, platform = process.platform) {
  return firstString(env?.OPENDESIGN_NPM_PATH, platform === 'win32' ? 'npm.cmd' : 'npm')
}

function resolveControlContext(env = process.env) {
  const desktop = readDesktopProfile(undefined, env)
  return {
    controlKey: firstString(env.OPENDESIGN_CONTROL_KEY, env.VELA_CONTROL_KEY, desktop?.controlKey),
    workspaceId: firstString(env.OPENDESIGN_WORKSPACE_ID, env.VELA_WORKSPACE_ID, desktop?.workspaceId),
    email: desktop?.email,
    velaPath: resolveVelaPath(env),
  }
}

async function runVelaJson(velaPath, args, { env = process.env, timeoutMs = VELA_TIMEOUT_MS, execFileImpl = execFileAsync } = {}) {
  let stdout
  try {
    ;({ stdout } = await execFileImpl(velaPath, args, { timeout: timeoutMs, maxBuffer: 1_048_576, encoding: 'utf8', windowsHide: true, env }))
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Vela CLI not found (${velaPath}); ${VELA_INSTALL_HINT}`)
    const lines = String(error?.stderr ?? error?.message ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    throw new Error(`vela ${args.join(' ')} failed: ${lines.at(-1) ?? 'unknown error'}`)
  }
  try {
    return JSON.parse(stdout)
  } catch {
    throw new Error(`vela ${args.join(' ')} returned non-JSON output`)
  }
}

async function velaIsRunnable(velaPath, { env = process.env, execFileImpl = execFileAsync } = {}) {
  try {
    await execFileImpl(velaPath, ['--version'], { timeout: 20_000, encoding: 'utf8', windowsHide: true, env })
    return true
  } catch {
    return false
  }
}

async function installVelaCli({ env = process.env, execFileImpl = execFileAsync, timeoutMs = VELA_INSTALL_TIMEOUT_MS } = {}) {
  const npm = npmExecutable(env)
  try {
    await execFileImpl(npm, ['install', '--global', VELA_PACKAGE], { timeout: timeoutMs, maxBuffer: 1_048_576, encoding: 'utf8', windowsHide: true, env })
  } catch (error) {
    const lines = String(error?.stderr ?? error?.message ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    throw new Error(`${npm} install --global ${VELA_PACKAGE} failed: ${lines.at(-1) ?? 'unknown error'}`)
  }
  return true
}

export async function npmGlobalVelaPath({ env = process.env, platform = process.platform, execFileImpl = execFileAsync } = {}) {
  try {
    const { stdout } = await execFileImpl(npmExecutable(env, platform), ['prefix', '--global'], { timeout: 20_000, encoding: 'utf8', windowsHide: true, env })
    const prefix = stdout.trim()
    if (!prefix) return undefined
    const candidate = platform === 'win32' ? join(prefix, 'vela.cmd') : join(prefix, 'bin', 'vela')
    accessSync(candidate, constants.X_OK)
    return candidate
  } catch {
    return undefined
  }
}

// Provider plugins install by symlinking the cached package, so no npm lifecycle
// script runs at install time: the Vela dependency is configured on first use.
export async function ensureVela({ env = process.env, log, allowInstall, execFileImpl = execFileAsync } = {}) {
  const current = resolveVelaPath(env)
  if (await velaIsRunnable(current, { env, execFileImpl })) return current
  const install = allowInstall ?? env.OPENDESIGN_SKIP_VELA_INSTALL !== '1'
  if (!install) return current
  log?.info?.(`opendesign: installing the Vela CLI (${VELA_PACKAGE})`)
  try {
    await installVelaCli({ env, execFileImpl })
  } catch (error) {
    log?.warn?.(`opendesign: Vela CLI install failed (${error.message})`)
    return current
  }
  const installed = (await npmGlobalVelaPath({ env, execFileImpl })) ?? resolveVelaPath(env)
  if (await velaIsRunnable(installed, { env, execFileImpl })) log?.info?.(`opendesign: Vela CLI ready at ${installed}`)
  return installed
}

export function parseVelaLoginOutput(text) {
  const url = /(https?:\/\/[^\s"'<>]+)/.exec(text)?.[1]
  const code = /(?:^|\n)\s*code:?\s*([A-Za-z0-9][A-Za-z0-9-]{3,})/i.exec(text)?.[1]
  return { url, code }
}

function velaLoginAuthMessage({ url, code }) {
  return {
    url,
    instructions: code ? `Enter code ${code} in the browser page to approve this device.` : 'Approve the sign-in request in your browser.',
  }
}

export async function loginWithVela({
  velaPath = resolveVelaPath(),
  callbacks,
  env = process.env,
  spawnImpl = spawn,
  timeoutMs = LOGIN_TIMEOUT_MS,
} = {}) {
  const signal = callbacks?.signal
  const child = spawnImpl(velaPath, ['login'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let output = ''
  let announced = false
  let codeTimer
  const announce = (force = false) => {
    if (announced) return
    const { url, code } = parseVelaLoginOutput(output)
    if (!url) return
    if (!code && !force) {
      codeTimer ??= setTimeout(() => announce(true), 1_500)
      return
    }
    announced = true
    callbacks?.onAuth?.(velaLoginAuthMessage({ url, code }))
  }
  const onChunk = (chunk) => {
    output += chunk.toString('utf8')
    announce()
  }

  await new Promise((resolve, reject) => {
    let settled = false
    let killTimer
    let graceTimer
    const detach = () => {
      clearTimeout(killTimer)
      clearTimeout(codeTimer)
      signal?.removeEventListener?.('abort', onAbort)
      child.stdout?.removeListener('data', onChunk)
      child.stderr?.removeListener('data', onChunk)
    }
    const settle = (error) => {
      if (settled) return
      settled = true
      detach()
      if (error) reject(error)
      else resolve()
    }
    const cancel = (error) => {
      if (settled) return
      try {
        child.kill('SIGTERM')
      } catch {
        // the child may already be gone
      }
      graceTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // the child may already be gone
        }
      }, 2_000)
      graceTimer.unref?.()
      settle(error)
    }
    const onAbort = () => cancel(new Error('OpenDesign login cancelled'))
    killTimer = setTimeout(() => cancel(new Error('vela login timed out waiting for approval')), timeoutMs)
    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)
    child.on('error', (error) => {
      const message = error?.code === 'ENOENT' ? `Vela CLI not found (${velaPath}); ${VELA_INSTALL_HINT}` : `vela login failed: ${error.message}`
      settle(new Error(message))
    })
    child.on('close', (exitCode) => {
      announce(true)
      if (exitCode === 0) {
        settle()
        return
      }
      const lines = output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      settle(new Error(`vela login exited with code ${exitCode}${lines.length > 0 ? `: ${lines.at(-1)}` : ''}`))
    })
    signal?.addEventListener?.('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
  return output
}

// A signed-in Vela session already carries a runtime key; a hard rejection sends
// the caller to the login flow, while a network error keeps the stored session.
async function reuseVelaSession(runtimeKey, fetchImpl = fetch) {
  try {
    await checkRuntimeKey(runtimeKey, fetchImpl)
    return runtimeKey
  } catch (error) {
    if (String(error?.message ?? '').includes('rejected')) return null
    return runtimeKey
  }
}

export async function loginOpenDesign(callbacks, deps = {}) {
  const signal = callbacks?.signal
  if (signal?.aborted) throw new Error('OpenDesign login cancelled')
  if (typeof callbacks?.onAuth !== 'function' || typeof callbacks?.onPrompt !== 'function') {
    throw new TypeError('OpenDesign login requires onAuth and onPrompt callbacks')
  }
  const fetchImpl = deps.fetch ?? fetch
  const env = deps.env ?? process.env
  const prepareVela = deps.ensureVela ?? ensureVela

  const session = readDesktopProfile(undefined, env)
  if (session?.runtimeKey) {
    const reused = await reuseVelaSession(session.runtimeKey, fetchImpl)
    if (reused) return reused
  }

  const velaPath = deps.velaPath ?? (await prepareVela({ env, log: deps.log, allowInstall: deps.allowInstall, execFileImpl: deps.execFile }))
  const login = deps.loginWithVela ?? loginWithVela
  let velaError
  try {
    await login({ velaPath, callbacks, env, spawnImpl: deps.spawn, timeoutMs: deps.timeoutMs })
  } catch (error) {
    if (signal?.aborted) throw new Error('OpenDesign login cancelled')
    velaError = error
  }
  if (!velaError) {
    const harvested = firstString(readDesktopProfile(undefined, env)?.runtimeKey)
    if (!harvested) throw new Error('vela login finished without storing a runtime key in ~/.amr/config.json')
    await checkRuntimeKey(harvested, fetchImpl)
    return harvested
  }

  // Fallback: a console API key still authenticates inference when the Vela CLI
  // cannot be installed or its sign-in cannot be completed.
  callbacks.onAuth({ url: API_KEY_URL, instructions: API_KEY_INSTRUCTIONS })
  const rawKey = await callbacks.onPrompt({
    message: `Vela sign-in did not complete (${velaError.message}). Paste an OpenDesign API key instead`,
    placeholder: 'sk-amr-...',
    secret: true,
  })
  if (signal?.aborted) throw new Error('OpenDesign login cancelled')
  const key = typeof rawKey === 'string' ? rawKey.trim() : ''
  if (!key) throw new Error('A non-empty OpenDesign API key is required')
  await checkRuntimeKey(key, fetchImpl)
  return key
}

function pickWorkspaceId(payload) {
  const direct = findWorkspaceId(payload)
  if (direct) return direct
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.data) ? payload.data : null
  if (!list) return typeof payload?.id === 'string' && payload.id.trim() ? payload.id.trim() : undefined
  const ranked = [
    list.find((entry) => entry?.current === true || entry?.isCurrent === true || entry?.active === true),
    list.find((entry) => /personal/i.test(String(entry?.type ?? entry?.kind ?? ''))),
    list.find((entry) => typeof entry?.id === 'string' && entry.id.trim()),
  ]
  for (const entry of ranked) {
    const id = firstString(entry?.workspaceId, entry?.id)
    if (id) return id
  }
  return undefined
}

async function discoverWorkspaceId({ controlKey, velaPath }, fetchImpl = fetch) {
  if (!controlKey) return undefined
  for (const path of ['/workspaces/current', '/workspaces']) {
    try {
      const payload = await getJson(`${CONTROL_BASE}${path}`, controlKey, fetchImpl)
      const id = pickWorkspaceId(payload)
      if (id) return id
    } catch {
      // Endpoint may not accept a personal control key; try the next source.
    }
  }
  try {
    const { stdout } = await execFileAsync(velaPath, ['billing', 'summary', '--format', 'json'], {
      timeout: VELA_TIMEOUT_MS,
      maxBuffer: 1_048_576,
      encoding: 'utf8',
      windowsHide: true,
    })
    return pickWorkspaceId(JSON.parse(stdout))
  } catch {
    return undefined
  }
}

async function getJson(url, key, fetchImpl = fetch) {
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  const body = await res.json()
  if (!body || typeof body !== 'object' || body.error || body.success === false) {
    throw new Error(`invalid response from ${url}`)
  }
  return body.data !== null && typeof body.data === 'object' ? body.data : body
}

function windowIdFor(durationMs) {
  if (!durationMs || durationMs <= 0) return undefined
  if (durationMs % 86_400_000 === 0) return `${durationMs / 86_400_000}d`
  if (durationMs % 3_600_000 === 0) return `${durationMs / 3_600_000}h`
  return `${Math.round(durationMs / 60_000)}m`
}

function windowLabel(durationMs) {
  const id = windowIdFor(durationMs)
  if (!id) return undefined
  const unit = { h: 'hours', d: 'days', m: 'minutes' }[id.at(-1)]
  return unit ? `${id.slice(0, -1)} ${unit}` : id
}

export function mapCodingPlanWindows(payload, accountId) {
  const windows = payload?.codingPlan?.windows
  if (!Array.isArray(windows)) return []
  const limits = []
  for (const [index, raw] of windows.entries()) {
    const limitCredits = numberOrUndefined(raw?.limitCredits)
    const usedCredits = numberOrUndefined(raw?.usedCredits)
    const durationMs = (numberOrUndefined(raw?.durationSeconds) ?? 0) * 1000
    const resetsAtSeconds = numberOrUndefined(raw?.resetsAt)
    if (limitCredits === undefined || limitCredits <= 0 || usedCredits === undefined) continue
    const windowId = windowIdFor(durationMs) ?? `window-${index}`
    const label = windowLabel(durationMs) ?? `window ${index + 1}`
    const usedFraction = Math.min(usedCredits / limitCredits, 1)
    const remainingFraction = Math.max(0, 1 - usedFraction)
    const status = usedCredits / limitCredits >= 1 ? 'exhausted' : usedFraction >= 0.9 ? 'warning' : 'ok'
    limits.push({
      id: `design-plan-${windowId}-${index}`,
      label: `Design Plan ${label}`,
      scope: { provider: PROVIDER_ID, ...(accountId ? { accountId } : {}), windowId },
      window: {
        id: windowId,
        label,
        ...(durationMs > 0 ? { durationMs } : {}),
        ...(resetsAtSeconds ? { resetsAt: resetsAtSeconds < 1e12 ? resetsAtSeconds * 1000 : resetsAtSeconds } : {}),
      },
      amount: {
        used: Number((usedFraction * 100).toFixed(2)),
        limit: 100,
        remaining: Number((remainingFraction * 100).toFixed(2)),
        usedFraction,
        remainingFraction,
        unit: 'percent',
      },
      status,
    })
  }
  return limits
}

export function mapBillingSummary(summary, accountId) {
  const notes = []
  const metadata = {}
  const tier = firstString(summary?.membershipTier)
  const status = firstString(summary?.subscriptionStatus)
  const periodEnd = firstString(summary?.subscriptionCurrentPeriodEnd)
  if (tier) {
    notes.push(`Plan: ${tier}${status ? ` (${status})` : ''}`)
    metadata.planType = tier
    if (accountId) metadata.accountId = accountId
    if (status) metadata.subscriptionStatus = status
    if (periodEnd) metadata.periodEnd = periodEnd
  }
  const credits = {
    available: numberOrUndefined(summary?.balances?.totalAvailableCredits),
    subscription: numberOrUndefined(summary?.balances?.subscriptionCredits),
    recharge: numberOrUndefined(summary?.balances?.rechargeCredits),
  }
  const availableUsd = numberOrUndefined(summary?.totalAvailableCreditsUsd)
  if (credits.available !== undefined) {
    const parts = []
    if (credits.subscription !== undefined) parts.push(`subscription ${credits.subscription}`)
    if (credits.recharge !== undefined) parts.push(`recharge ${credits.recharge}`)
    notes.push(
      `Credits: ${credits.available}${availableUsd !== undefined ? ` ($${availableUsd.toFixed(2)})` : ''}${parts.length > 0 ? ` — ${parts.join(', ')}` : ''}`,
    )
    metadata.credits = {
      available: credits.available,
      ...(credits.subscription !== undefined ? { subscription: credits.subscription } : {}),
      ...(credits.recharge !== undefined ? { recharge: credits.recharge } : {}),
    }
  }
  const todaySpent = numberOrUndefined(summary?.todayConsumedUsd)
  const totalSpent = numberOrUndefined(summary?.totalConsumedUsd)
  if (todaySpent !== undefined) {
    notes.push(`Spent today: $${todaySpent.toFixed(2)}${totalSpent !== undefined ? ` (total $${totalSpent.toFixed(2)})` : ''}`)
    metadata.todayConsumedUsd = todaySpent
    if (totalSpent !== undefined) metadata.totalConsumedUsd = totalSpent
  }
  if (periodEnd) notes.push(`Billing period ends ${periodEnd.slice(0, 10)}`)
  return { notes, metadata }
}

export async function fetchUsageReport(credential, env = process.env, fetchImpl = fetch, deps = {}) {
  const runtimeKey = firstString(credential?.apiKey, credential?.key)
  if (!runtimeKey) return null

  const { controlKey, workspaceId, email, velaPath } = resolveControlContext(env)
  const runVela = deps.runVela ?? ((path, args) => runVelaJson(path, args, { env }))
  const notes = []
  const metadata = {}
  const problems = []
  const accountId = email ?? 'OpenDesign'

  let summary
  try {
    summary = await runVela(velaPath, ['billing', 'summary', '--format', 'json'])
  } catch (error) {
    problems.push(`vela summary: ${error.message}`)
  }
  if (summary) {
    const mapped = mapBillingSummary(summary, accountId)
    notes.push(...mapped.notes)
    Object.assign(metadata, mapped.metadata)
  } else {
    notes.push('Plan quota unavailable: run /login opendesign to create a Vela session (~/.amr/config.json)')
  }

  let resolvedWorkspaceId = workspaceId
  if (!resolvedWorkspaceId) resolvedWorkspaceId = await discoverWorkspaceId({ controlKey, velaPath }, fetchImpl)
  const hasWindows = (candidate) => mapCodingPlanWindows(candidate, accountId).length > 0
  let plan
  if (resolvedWorkspaceId) {
    metadata.workspaceId = resolvedWorkspaceId
    if (controlKey) {
      try {
        plan = await getJson(`${CONTROL_BASE}/workspaces/${encodeURIComponent(resolvedWorkspaceId)}/billing/coding-plan-usage`, controlKey, fetchImpl)
      } catch (error) {
        problems.push(`coding plan: ${error.message}`)
      }
    }
    if (!hasWindows(plan)) {
      try {
        const candidate = await runVela(velaPath, ['billing', 'preflight', '--workspace-id', resolvedWorkspaceId, '--format', 'json'])
        if (candidate?.workspaceId && candidate.workspaceId !== resolvedWorkspaceId) {
          throw new Error('vela reported a different workspace')
        }
        if (hasWindows(candidate) || !plan) plan = candidate
      } catch (error) {
        problems.push(`vela preflight: ${error.message}`)
      }
    }
  }

  const limits = plan ? mapCodingPlanWindows(plan, accountId) : []
  if (plan && limits.length === 0 && plan?.codingPlan?.eligible !== false) {
    problems.push('coding plan returned no usable windows')
  }
  if (limits.length === 0 && notes.length === 0) return null
  return { report: { provider: PROVIDER_ID, fetchedAt: Date.now(), notes, metadata, limits }, problems }
}

export function buildProviderConfig(logger) {
  const envApiKey = resolveEnvApiKey()
  return {
    baseUrl: BASE_URL,
    api: 'openai-completions',
    authHeader: true,
    models: FALLBACK_MODELS,
    oauth: { name: PROVIDER_NAME, login: (callbacks) => loginOpenDesign(callbacks, { log: logger }) },
    ...(envApiKey ? { apiKey: envApiKey } : {}),
    async fetchDynamicModels(context) {
      const key = firstString(
        typeof context === 'string' ? context : undefined,
        context?.credential?.apiKey,
        context?.apiKey,
        context?.credential?.key,
        resolveEnvApiKey(),
      )
      if (!key) {
        logger?.debug?.('opendesign: no credential for live model discovery')
        return null
      }
      try {
        const rows = await fetchAmrModels(key)
        logger?.debug?.(`opendesign: discovered ${rows?.length ?? 0} live models`)
        return rows
      } catch (error) {
        logger?.warn?.(`opendesign: live model discovery failed (${error.message})`)
        return null
      }
    },
    usage: {
      id: PROVIDER_ID,
      cacheVersion: 4,
      async fetchUsage(params, helpers) {
        const fetchImpl = helpers?.fetch ?? fetch
        try {
          const result = await fetchUsageReport(params?.credential, process.env, fetchImpl)
          if (!result) {
            logger?.info?.('opendesign: no runtime credential for quota reporting')
            return null
          }
          if (result.problems.length > 0) {
            logger?.info?.(`opendesign: quota partially unavailable (${result.problems.join('; ')})`)
          }
          return result.report
        } catch (error) {
          logger?.warn?.(`opendesign: quota fetch failed (${error.message})`)
          return null
        }
      },
    },
  }
}

export default function registerOmpPlugin(pi) {
  pi.registerProvider(PROVIDER_ID, buildProviderConfig(pi.logger))
}
