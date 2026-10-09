import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

export const PROVIDER_ID = 'alibaba-token-plan-media'
export const PLAN_PROVIDER_ID = 'alibaba-token-plan'
export const DEFAULT_API_ORIGIN = 'https://token-plan.cn-beijing.maas.aliyuncs.com'
export const DEFAULT_TTS_VOICE = 'longanlingxin'
export const TTS_SAMPLE_RATE = 24000
export const IMAGE_MODELS = Object.freeze([
  Object.freeze({ id: 'qwen-image-3.0-pro', name: 'Qwen Image 3.0 Pro (Token Plan)' }),
  Object.freeze({ id: 'wan2.7-image', name: 'Wan 2.7 Image (Token Plan)' }),
  Object.freeze({ id: 'wan2.7-image-pro', name: 'Wan 2.7 Image Pro (Token Plan)' }),
])
export const SPEECH_MODEL = Object.freeze({ id: 'qwen-audio-3.0-tts-plus', name: 'Qwen Audio 3.0 TTS Plus (Token Plan)' })
export const ALLOWED_IMAGE_SIZES = Object.freeze(['1024x1024', '1536x1024', '1024x1536'])
export const MAX_INPUT_IMAGES = Object.freeze({
  'qwen-image-3.0-pro': 3,
  'wan2.7-image': 9,
  'wan2.7-image-pro': 9,
})
export const MAX_BODY_BYTES = 128 * 1024 * 1024
export const IMAGE_UPSTREAM_TIMEOUT_MS = 150000
export const SPEECH_UPSTREAM_TIMEOUT_MS = 50000

const IMAGE_GENERATION_PATH = '/api/v1/services/aigc/multimodal-generation/generation'
const SPEECH_SYNTHESIS_PATH = '/api/v1/services/audio/tts/SpeechSynthesizer'
const IMAGE_ROUTES = Object.freeze(['/v1/images/generations', '/v1/images/edits'])
const SPEECH_ROUTE = '/v1/audio/speech'
const CREDENTIAL_MISSING_MESSAGE = 'alibaba-token-plan credential not found; run /login alibaba-token-plan'
const DEFAULT_IMAGE_MEDIA_TYPE = 'image/png'
const SPEECH_MIME_TYPES = Object.freeze({ mp3: 'audio/mpeg', wav: 'audio/wav' })

const BRIDGE_TOKEN = randomUUID()
const ENV_API_ORIGIN = readEnv('ALIBABA_TOKEN_PLAN_MEDIA_API_ORIGIN')
const ENV_TTS_VOICE = readEnv('ALIBABA_TOKEN_PLAN_MEDIA_TTS_VOICE')

let bridgePromise = null
let bridgeInstance = null
let credentialSource = null

const resolveCredential = () => credentialSource

function readEnv(name) {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function sendJson(res, status, payload) {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendBytes(res, status, bytes, contentType) {
  if (res.headersSent) return
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
  })
  res.end(buffer)
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function isTimeoutError(error) {
  if (!error || typeof error !== 'object') return false
  return error.name === 'AbortError' || error.name === 'TimeoutError' || error.code === 'ABORT_ERR'
}

function upstreamFailureDetail(status, text) {
  let code
  let message
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') {
      const container = parsed.error && typeof parsed.error === 'object' ? parsed.error : parsed
      if (typeof container.code === 'string' && container.code) code = container.code
      if (typeof container.message === 'string' && container.message) message = container.message
    }
  } catch {
    // Non-JSON upstream error bodies fall back to the raw text below.
  }
  if (code && message) return `${code}: ${message}`
  if (message) return message
  if (code) return code
  const trimmed = typeof text === 'string' ? text.trim() : ''
  return trimmed ? trimmed.slice(0, 300) : `HTTP ${status}`
}

function normalizeImageSize(size) {
  if (typeof size !== 'string') return null
  return ALLOWED_IMAGE_SIZES.includes(size) ? size.replace('x', '*') : null
}

function collectInputImages(body) {
  const references = body?.input_references
  if (references === undefined) return []
  if (!Array.isArray(references)) return null
  return references
    .map((reference) => (reference && typeof reference === 'object' ? reference.url : undefined))
    .filter((url) => typeof url === 'string')
}

function collectImageUrls(payload) {
  const urls = []
  const choices = payload?.output?.choices
  if (!Array.isArray(choices)) return urls
  for (const choice of choices) {
    const content = choice?.message?.content
    if (!Array.isArray(content)) continue
    for (const item of content) {
      if (item && typeof item === 'object' && typeof item.image === 'string' && item.image) urls.push(item.image)
    }
  }
  return urls
}

function mediaTypeFromHeader(header, fallback) {
  if (typeof header !== 'string') return fallback
  const value = header.split(';')[0].trim().toLowerCase()
  return value || fallback
}

function actionableError(code, message) {
  if (code && message) return `${code}: ${message}`
  return message ?? code
}

export async function createBridgeServer({ token, resolveCredential: lookupCredential, fetchImpl = fetch, logger } = {}) {
  const bearer = typeof token === 'string' && token ? token : randomUUID()
  const inflight = new Set()
  let refs = 0
  let closed = false

  function logError(error) {
    if (logger && typeof logger.error === 'function') logger.error(error)
  }

  async function resolveUpstreamCredential() {
    let registry = null
    try {
      registry = await lookupCredential?.()
    } catch {
      registry = null
    }
    if (!registry || typeof registry.getApiKeyForProvider !== 'function') return null

    let raw
    try {
      raw = await registry.getApiKeyForProvider(PLAN_PROVIDER_ID)
    } catch {
      return null
    }
    if (typeof raw !== 'string' || !raw) return null

    let upstreamToken
    let origin = ENV_API_ORIGIN ?? DEFAULT_API_ORIGIN
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.token === 'string' && parsed.token) upstreamToken = parsed.token
        if (typeof parsed.baseUrl === 'string' && parsed.baseUrl) {
          const parsedOrigin = safeOrigin(parsed.baseUrl)
          if (parsedOrigin) origin = parsedOrigin
        }
      }
    } catch {
      // A bare credential string is handled below; never treat the raw blob as a bearer token.
    }
    if (!upstreamToken && raw.startsWith('sk-')) upstreamToken = raw
    if (!upstreamToken) return null
    return { token: upstreamToken, origin }
  }

  async function upstreamFetch(url, { method = 'GET', headers, body, timeoutMs } = {}) {
    const controller = new AbortController()
    inflight.add(controller)
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined
    try {
      return await fetchImpl(url, { method, headers, body, signal: controller.signal })
    } finally {
      clearTimeout(timer)
      inflight.delete(controller)
    }
  }

  async function readImageSource(url) {
    const response = await upstreamFetch(url, { timeoutMs: IMAGE_UPSTREAM_TIMEOUT_MS })
    if (!response.ok) {
      throw new Error(`image download failed with HTTP ${response.status}`)
    }
    const contentType = response.headers?.get?.('content-type') ?? null
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`image download returned unsupported content type: ${contentType ?? 'missing'}`)
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    return {
      b64_json: bytes.toString('base64'),
      media_type: mediaTypeFromHeader(contentType, DEFAULT_IMAGE_MEDIA_TYPE),
    }
  }

  async function handleImage(res, body) {
    const credential = await resolveUpstreamCredential()
    if (!credential) {
      sendJson(res, 503, { error: { message: CREDENTIAL_MISSING_MESSAGE } })
      return
    }

    const model = body?.model
    if (typeof model !== 'string' || !IMAGE_MODELS.some((entry) => entry.id === model)) {
      sendJson(res, 400, { error: { message: `unsupported image model: ${String(model)}` } })
      return
    }
    const prompt = body?.prompt
    if (typeof prompt !== 'string' || !prompt) {
      sendJson(res, 400, { error: { message: 'prompt must be a non-empty string' } })
      return
    }
    const count = body?.n
    if (count !== undefined && count !== 1) {
      sendJson(res, 400, { error: { message: 'n must be 1' } })
      return
    }
    const size = body?.size
    let upstreamSize = null
    if (size !== undefined) {
      upstreamSize = normalizeImageSize(size)
      if (!upstreamSize) {
        sendJson(res, 400, { error: { message: `size must be one of ${ALLOWED_IMAGE_SIZES.join(', ')}` } })
        return
      }
    }
    const inputImages = collectInputImages(body)
    if (inputImages === null) {
      sendJson(res, 400, { error: { message: 'input_references must be an array' } })
      return
    }
    const maxInputImages = MAX_INPUT_IMAGES[model]
    if (inputImages.length > maxInputImages) {
      sendJson(res, 400, {
        error: { message: `${model} has ${inputImages.length} input images; at most ${maxInputImages} are supported` },
      })
      return
    }

    const content = [...inputImages.map((url) => ({ image: url })), { text: prompt }]
    const upstreamBody = {
      model,
      input: { messages: [{ role: 'user', content }] },
      parameters: { n: 1, ...(upstreamSize ? { size: upstreamSize } : {}) },
    }

    const response = await upstreamFetch(`${credential.origin}${IMAGE_GENERATION_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
      timeoutMs: IMAGE_UPSTREAM_TIMEOUT_MS,
    })
    const text = await response.text()
    if (!response.ok) {
      sendJson(res, response.status, { error: { message: upstreamFailureDetail(response.status, text) } })
      return
    }

    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      sendJson(res, 502, { error: { message: 'upstream returned malformed JSON' } })
      return
    }
    if (payload && typeof payload === 'object' && typeof payload.code === 'string' && payload.code) {
      const message = typeof payload.message === 'string' && payload.message ? payload.message : payload.code
      sendJson(res, 502, { error: { message: actionableError(payload.code, message) } })
      return
    }
    const urls = collectImageUrls(payload)
    if (urls.length === 0) {
      sendJson(res, 502, { error: { message: 'upstream returned no images' } })
      return
    }

    const data = []
    for (const url of urls) {
      data.push(await readImageSource(url))
    }
    sendJson(res, 200, { created: Math.floor(Date.now() / 1000), data })
  }

  async function handleSpeech(res, body) {
    const credential = await resolveUpstreamCredential()
    if (!credential) {
      sendJson(res, 503, { error: { message: CREDENTIAL_MISSING_MESSAGE } })
      return
    }

    const text = body?.input
    if (typeof text !== 'string' || !text) {
      sendJson(res, 400, { error: { message: 'input must be a non-empty string' } })
      return
    }
    if (body?.model !== SPEECH_MODEL.id) {
      sendJson(res, 400, { error: { message: `unsupported speech model: ${String(body?.model)}` } })
      return
    }
    const format = body?.response_format === 'wav' ? 'wav' : 'mp3'
    const voice = typeof body?.voice === 'string' && body.voice ? body.voice : ENV_TTS_VOICE ?? DEFAULT_TTS_VOICE

    const upstreamBody = {
      model: SPEECH_MODEL.id,
      input: { text, voice, format, sample_rate: TTS_SAMPLE_RATE },
    }
    const response = await upstreamFetch(`${credential.origin}${SPEECH_SYNTHESIS_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
      timeoutMs: SPEECH_UPSTREAM_TIMEOUT_MS,
    })

    if (!response.ok) {
      const text = await response.text()
      sendJson(res, response.status, { error: { message: upstreamFailureDetail(response.status, text) } })
      return
    }

    const contentType = response.headers?.get?.('content-type') ?? null
    if (contentType && contentType.startsWith('audio/')) {
      sendBytes(res, 200, Buffer.from(await response.arrayBuffer()), contentType)
      return
    }

    const raw = await response.text()
    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      sendJson(res, 502, { error: { message: 'upstream returned neither audio nor JSON' } })
      return
    }
    const audioUrl = payload?.output?.audio?.url
    if (typeof audioUrl === 'string' && audioUrl) {
      const download = await upstreamFetch(audioUrl, { timeoutMs: SPEECH_UPSTREAM_TIMEOUT_MS })
      if (!download.ok) {
        sendJson(res, 502, { error: { message: `speech download failed with HTTP ${download.status}` } })
        return
      }
      const downloadType = download.headers?.get?.('content-type') ?? null
      if (!downloadType || !downloadType.startsWith('audio/')) {
        sendJson(res, 502, { error: { message: `speech download returned unsupported content type: ${downloadType ?? 'missing'}` } })
        return
      }
      sendBytes(res, 200, Buffer.from(await download.arrayBuffer()), SPEECH_MIME_TYPES[format])
      return
    }
    if (payload && typeof payload === 'object' && (payload.code || payload.message)) {
      sendJson(res, 502, {
        error: {
          message: actionableError(
            typeof payload.code === 'string' ? payload.code : undefined,
            typeof payload.message === 'string' ? payload.message : undefined,
          ),
        },
      })
      return
    }
    sendJson(res, 502, { error: { message: 'upstream returned no audio' } })
  }

  async function routeRequest(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: { message: 'method not allowed' } })
      return
    }
    if (req.headers.authorization !== `Bearer ${bearer}`) {
      sendJson(res, 401, { error: { message: 'unauthorized' } })
      return
    }

    let raw
    try {
      raw = await readBody(req)
    } catch (error) {
      if (error?.statusCode === 413) {
        sendJson(res, 413, { error: { message: 'request body too large' } })
        res.once('finish', () => req.destroy())
        return
      }
      throw error
    }

    let body
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      sendJson(res, 400, { error: { message: 'invalid JSON body' } })
      return
    }

    const path = safePath(req.url)
    if (IMAGE_ROUTES.includes(path)) {
      await handleImage(res, body)
      return
    }
    if (path === SPEECH_ROUTE) {
      await handleSpeech(res, body)
      return
    }
    sendJson(res, 404, { error: { message: 'not found' } })
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      let settled = false
      req.on('data', (chunk) => {
        if (settled) return
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          settled = true
          const error = new Error('request body too large')
          error.statusCode = 413
          reject(error)
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (settled) return
        settled = true
        resolve(Buffer.concat(chunks))
      })
      req.on('error', (error) => {
        if (settled) return
        settled = true
        reject(error)
      })
    })
  }

  const server = createServer((req, res) => {
    void routeRequest(req, res).catch((error) => {
      logError(error)
      sendJson(res, isTimeoutError(error) ? 504 : 502, { error: { message: errorMessage(error) } })
    })
  })

  function close() {
    if (closed) return
    closed = true
    for (const controller of inflight) {
      try {
        controller.abort()
      } catch {
        // Aborting an already-settled controller is harmless.
      }
    }
    inflight.clear()
    try {
      server.closeIdleConnections?.()
    } catch {
      // Older runtimes may not expose connection tracking.
    }
    try {
      server.closeAllConnections?.()
    } catch {
      // Older runtimes may not expose connection tracking.
    }
    server.close()
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  server.unref()

  const address = server.address()
  return {
    port: typeof address === 'object' && address ? address.port : 0,
    token: bearer,
    addRef() {
      refs += 1
      return refs
    },
    release() {
      refs = Math.max(0, refs - 1)
      if (refs === 0) close()
      return refs
    },
    close,
    inflightCount() {
      return inflight.size
    },
    get closed() {
      return closed
    },
  }
}

export function ensureBridge(options = {}) {
  if (bridgeInstance?.closed) {
    bridgePromise = null
    bridgeInstance = null
  }
  if (!bridgePromise) {
    bridgePromise = createBridgeServer({ token: BRIDGE_TOKEN, ...options })
      .then((bridge) => {
        bridgeInstance = bridge
        return bridge
      })
      .catch((error) => {
        bridgePromise = null
        bridgeInstance = null
        throw error
      })
  }
  return bridgePromise
}

export default async function alibabaTokenPlanMediaExtension(pi) {
  const bridge = await ensureBridge({ resolveCredential, fetchImpl: fetch, logger: pi?.logger })
  bridge.addRef()
  pi.on('session_start', (_event, ctx) => {
    credentialSource = ctx?.modelRegistry ?? null
  })
  pi.on('session_shutdown', () => {
    if (bridge.release() === 0) bridge.close()
  })
  try {
    pi.registerProvider(PROVIDER_ID, {
      baseUrl: `http://127.0.0.1:${bridge.port}/v1`,
      apiKey: bridge.token,
      models: [
        ...IMAGE_MODELS.map(({ id, name }) => ({ id, name, api: 'openai-images' })),
        { id: SPEECH_MODEL.id, name: SPEECH_MODEL.name, api: 'openai-speech' },
      ],
    })
  } catch (error) {
    if (bridge.release() === 0) bridge.close()
    throw error
  }
}

function safeOrigin(value) {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function safePath(value) {
  try {
    return new URL(value ?? '/', 'http://127.0.0.1').pathname
  } catch {
    return '/'
  }
}
