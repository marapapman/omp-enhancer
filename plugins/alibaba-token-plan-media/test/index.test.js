import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import {
  ALLOWED_IMAGE_SIZES,
  DEFAULT_TTS_VOICE,
  IMAGE_MODELS,
  MAX_INPUT_IMAGES,
  PROVIDER_ID,
  SPEECH_MODEL,
  TTS_SAMPLE_RATE,
  createBridgeServer,
  ensureBridge,
} from '../index.js'
import alibabaTokenPlanMediaExtension from '../index.js'

const TOKEN = 'test-bridge-token'
const PLAN_PROVIDER_ID = 'alibaba-token-plan'
const IMAGE_ENDPOINT = 'https://upstream.test/api/v1/services/aigc/multimodal-generation/generation'
const SPEECH_ENDPOINT = 'https://upstream.test/api/v1/services/audio/tts/SpeechSynthesizer'
const CREDENTIAL = JSON.stringify({
  token: 'sk-sp-secret-token',
  cookie: 'session=abc',
  baseUrl: 'https://upstream.test/compatible-mode/v1',
})
const IMAGE_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
const AUDIO_BYTES = Buffer.from('49443303000000000000', 'hex')
const LOGGER = { error() {} }

const bridges = []

after(() => {
  for (const bridge of bridges) bridge.close()
})

class FakePi {
  constructor() {
    this.providers = []
    this.tools = []
    this.unregistered = []
    this.handlers = new Map()
    this.logger = LOGGER
  }

  registerProvider(name, config) {
    this.providers.push({ name, config })
  }

  registerTool(tool) {
    this.tools.push(tool)
  }

  unregisterProvider(name) {
    this.unregistered.push(name)
  }

  on(event, handler) {
    const handlers = this.handlers.get(event) ?? []
    handlers.push(handler)
    this.handlers.set(event, handlers)
  }

  emit(event, payload) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload, {})
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function credentialRegistry(raw) {
  return { getApiKeyForProvider: async (provider) => (provider === PLAN_PROVIDER_ID ? raw : undefined) }
}

async function startBridge({ upstream, rawCredential = CREDENTIAL, resolveCredential } = {}) {
  const calls = []
  const bridge = await createBridgeServer({
    token: TOKEN,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init })
      return upstream(url, init)
    },
    resolveCredential: resolveCredential ?? (() => credentialRegistry(rawCredential)),
    logger: LOGGER,
  })
  bridges.push(bridge)
  return { bridge, calls, base: `http://127.0.0.1:${bridge.port}/v1` }
}

function post(base, path, body, token = TOKEN) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function imageUpstream({ imageUrl = 'https://upstream.test/out.png', download } = {}) {
  const captured = {}
  const upstream = async (url, init) => {
    if (String(url) === IMAGE_ENDPOINT) {
      captured.body = JSON.parse(init.body)
      captured.headers = init.headers
      return jsonResponse({ output: { choices: [{ message: { content: [{ image: imageUrl }] } }] } })
    }
    if (String(url) === imageUrl) {
      return download ? download() : new Response(IMAGE_BYTES, { headers: { 'content-type': 'image/png' } })
    }
    throw new Error(`unexpected upstream url ${url}`)
  }
  return { upstream, captured }
}

test('gateway rejects requests without the bridge bearer and never calls upstream', async () => {
  const { base, calls } = await startBridge({ upstream: async () => jsonResponse({ output: {} }) })

  const anonymous = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'wan2.7-image', prompt: 'a red cube' }),
  })
  assert.equal(anonymous.status, 401)
  assert.equal((await anonymous.json()).error.message, 'unauthorized')

  const wrongToken = await post(base, '/images/generations', { model: 'wan2.7-image', prompt: 'a red cube' }, 'nope')
  assert.equal(wrongToken.status, 401)
  assert.equal(calls.length, 0)
})

test('image generation translates the openai-images body into a DashScope multimodal request', async () => {
  const { upstream, captured } = imageUpstream()
  const { base } = await startBridge({ upstream })

  const response = await post(base, '/images/generations', {
    model: 'wan2.7-image',
    prompt: 'a red cube',
    n: 1,
    response_format: 'b64_json',
    size: '1024x1024',
  })

  assert.equal(response.status, 200)
  assert.equal(captured.body.model, 'wan2.7-image')
  assert.deepEqual(captured.body.parameters, { n: 1, size: '1024*1024' })
  assert.deepEqual(captured.body.input.messages[0].content, [{ text: 'a red cube' }])
  assert.equal(captured.headers.Authorization, 'Bearer sk-sp-secret-token')

  const payload = await response.json()
  assert.equal(payload.data.length, 1)
  assert.equal(payload.data[0].b64_json, IMAGE_BYTES.toString('base64'))
  assert.equal(payload.data[0].media_type, 'image/png')
  assert.equal(typeof payload.created, 'number')
})

test('input references become leading image parts and omit an upstream size when none was requested', async () => {
  const { upstream, captured } = imageUpstream()
  const { base } = await startBridge({ upstream })

  const response = await post(base, '/images/generations', {
    model: 'wan2.7-image-pro',
    prompt: 'keep the composition',
    input_references: [{ type: 'image_url', url: 'data:image/png;base64,AAAA' }],
  })

  assert.equal(response.status, 200)
  assert.deepEqual(captured.body.input.messages[0].content, [
    { image: 'data:image/png;base64,AAAA' },
    { text: 'keep the composition' },
  ])
  assert.deepEqual(captured.body.parameters, { n: 1 })
})

test('the edits route produces the same upstream request as generations for the same body', async () => {
  const requestBody = {
    model: 'qwen-image-3.0-pro',
    prompt: 'add a shadow',
    size: '1536x1024',
    input_references: [{ type: 'image_url', url: 'data:image/png;base64,BBBB' }],
  }
  const generations = imageUpstream()
  const edits = imageUpstream()
  const first = await startBridge({ upstream: generations.upstream })
  const second = await startBridge({ upstream: edits.upstream })

  assert.equal((await post(first.base, '/images/generations', requestBody)).status, 200)
  assert.equal((await post(second.base, '/images/edits', requestBody)).status, 200)
  assert.deepEqual(edits.captured.body, generations.captured.body)
  assert.equal(generations.captured.body.parameters.size, '1536*1024')
})

test('unsupported sizes and multi-image counts are rejected before any upstream call', async () => {
  const { upstream } = imageUpstream()
  const { base, calls } = await startBridge({ upstream })

  const badSize = await post(base, '/images/generations', { model: 'wan2.7-image', prompt: 'x', size: '2048x2048' })
  assert.equal(badSize.status, 400)
  assert.match((await badSize.json()).error.message, /1024x1024/)

  const badCount = await post(base, '/images/generations', { model: 'wan2.7-image', prompt: 'x', n: 2 })
  assert.equal(badCount.status, 400)

  assert.equal(calls.length, 0)
})

test('input image limits follow the per-model caps', async () => {
  const { upstream } = imageUpstream()
  const { base } = await startBridge({ upstream })
  const references = Array.from({ length: 4 }, (unused, index) => ({
    type: 'image_url',
    url: `data:image/png;base64,AAAA${index}`,
  }))

  const qwen = await post(base, '/images/generations', {
    model: 'qwen-image-3.0-pro',
    prompt: 'x',
    input_references: references,
  })
  assert.equal(qwen.status, 400)
  const message = (await qwen.json()).error.message
  assert.match(message, /4 input images/)
  assert.match(message, new RegExp(`at most ${MAX_INPUT_IMAGES['qwen-image-3.0-pro']} are supported`))

  const wan = await post(base, '/images/generations', {
    model: 'wan2.7-image',
    prompt: 'x',
    input_references: references,
  })
  assert.equal(wan.status, 200)
})

test('upstream image errors are passed through with the upstream code visible to the caller', async () => {
  const { base } = await startBridge({
    upstream: async (url) => {
      assert.equal(String(url), IMAGE_ENDPOINT)
      return jsonResponse({ code: 'InvalidParameter', message: 'bad size' }, 400)
    },
  })

  const response = await post(base, '/images/generations', { model: 'wan2.7-image', prompt: 'x' })
  assert.equal(response.status, 400)
  const message = (await response.json()).error.message
  assert.match(message, /InvalidParameter/)
  assert.match(message, /bad size/)
})

test('a successful upstream response without any image becomes a 502', async () => {
  const { base } = await startBridge({
    upstream: async () => jsonResponse({ output: { choices: [{ message: { content: [{ text: 'no image here' }] } }] } }),
  })

  const response = await post(base, '/images/generations', { model: 'wan2.7-image', prompt: 'x' })
  assert.equal(response.status, 502)
  assert.equal((await response.json()).error.message, 'upstream returned no images')
})

test('speech synthesis maps the request onto SpeechSynthesizer and returns the downloaded audio', async () => {
  let captured
  const audioUrl = 'https://upstream.test/out.mp3'
  const { base } = await startBridge({
    upstream: async (url, init) => {
      if (String(url) === SPEECH_ENDPOINT) {
        captured = JSON.parse(init.body)
        return jsonResponse({ output: { audio: { url: audioUrl, data: '' } } })
      }
      assert.equal(String(url), audioUrl)
      return new Response(AUDIO_BYTES, { headers: { 'content-type': 'audio/mpeg' } })
    },
  })

  const response = await post(base, '/audio/speech', {
    model: SPEECH_MODEL.id,
    input: 'hi',
    response_format: 'mp3',
  })

  assert.equal(response.status, 200)
  assert.deepEqual(captured, {
    model: SPEECH_MODEL.id,
    input: { text: 'hi', voice: DEFAULT_TTS_VOICE, format: 'mp3', sample_rate: TTS_SAMPLE_RATE },
  })
  assert.equal(response.headers.get('content-type'), 'audio/mpeg')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), AUDIO_BYTES)
})

test('raw upstream audio is forwarded byte for byte with a wav content type', async () => {
  const { base } = await startBridge({
    upstream: async (url, init) => {
      assert.equal(String(url), SPEECH_ENDPOINT)
      assert.equal(JSON.parse(init.body).input.format, 'wav')
      return new Response(AUDIO_BYTES, { headers: { 'content-type': 'audio/wav' } })
    },
  })

  const response = await post(base, '/audio/speech', {
    model: SPEECH_MODEL.id,
    input: 'hi',
    response_format: 'wav',
    voice: 'longanhuan_v3.6',
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'audio/wav')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), AUDIO_BYTES)
})

test('a speech error payload never becomes the audio response body', async () => {
  const { base } = await startBridge({
    upstream: async () => jsonResponse({ code: 'InvalidParameter', message: 'voice not supported' }),
  })

  const response = await post(base, '/audio/speech', { model: SPEECH_MODEL.id, input: 'hi' })
  assert.equal(response.status, 502)
  assert.equal(response.headers.get('content-type').startsWith('audio/'), false)
  const payload = await response.json()
  assert.match(payload.error.message, /voice not supported/)
})

test('an aborted upstream request becomes 504 so OMP can fall back', async () => {
  const { base } = await startBridge({
    upstream: async () => {
      throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
    },
  })

  const response = await post(base, '/audio/speech', { model: SPEECH_MODEL.id, input: 'hi' })
  assert.equal(response.status, 504)
  assert.equal(response.headers.get('content-type').startsWith('audio/'), false)
})

test('a missing Token Plan credential yields 503 without contacting upstream', async () => {
  const { upstream } = imageUpstream()
  const { base, calls } = await startBridge({ upstream, resolveCredential: () => null })

  const response = await post(base, '/images/generations', { model: 'wan2.7-image', prompt: 'x' })
  assert.equal(response.status, 503)
  assert.match((await response.json()).error.message, /\/login alibaba-token-plan/)
  assert.equal(calls.length, 0)
})

test('only the inner credential token is sent upstream as a bearer', async () => {
  const { upstream, captured } = imageUpstream()
  const { base } = await startBridge({ upstream })

  assert.equal((await post(base, '/images/generations', { model: 'wan2.7-image', prompt: 'x' })).status, 200)
  assert.equal(captured.headers.Authorization, 'Bearer sk-sp-secret-token')
  assert.notEqual(captured.headers.Authorization, `Bearer ${CREDENTIAL}`)
})

test('the factory registers one image and speech provider without tools or default-role changes', async () => {
  const pi = new FakePi()
  await alibabaTokenPlanMediaExtension(pi)
  pi.emit('session_shutdown', {})

  assert.equal(pi.providers.length, 1)
  const { name, config } = pi.providers[0]
  assert.equal(name, PROVIDER_ID)
  assert.notEqual(name, PLAN_PROVIDER_ID)
  assert.match(config.baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/v1$/)
  assert.equal(typeof config.apiKey, 'string')
  assert.ok(config.apiKey.length > 0)
  assert.deepEqual(
    config.models.map((model) => model.api),
    ['openai-images', 'openai-images', 'openai-images', 'openai-speech'],
  )
  assert.deepEqual(
    config.models.map((model) => model.id),
    [...IMAGE_MODELS.map((model) => model.id), SPEECH_MODEL.id],
  )
  assert.deepEqual(pi.tools, [])
  assert.deepEqual(pi.unregistered, [])
})

test('all sessions share one bridge and the listener survives until the last release', async () => {
  const parent = new FakePi()
  const child = new FakePi()
  await alibabaTokenPlanMediaExtension(parent)
  await alibabaTokenPlanMediaExtension(child)

  const parentConfig = parent.providers[0].config
  const childConfig = child.providers[0].config
  assert.equal(childConfig.baseUrl, parentConfig.baseUrl)
  assert.equal(childConfig.apiKey, parentConfig.apiKey)

  parent.emit('session_shutdown', {})
  const alive = await post(parentConfig.baseUrl, '/images/generations', { model: 'wan2.7-image', prompt: 'x' }, parentConfig.apiKey)
  assert.equal(alive.status, 503)

  child.emit('session_shutdown', {})
  await assert.rejects(() =>
    post(parentConfig.baseUrl, '/images/generations', { model: 'wan2.7-image', prompt: 'x' }, parentConfig.apiKey),
  )
})

test('the exported sizing surface matches what the bridge accepts', () => {
  assert.deepEqual([...ALLOWED_IMAGE_SIZES], ['1024x1024', '1536x1024', '1024x1536'])
  assert.deepEqual(
    IMAGE_MODELS.map((model) => model.id),
    ['qwen-image-3.0-pro', 'wan2.7-image', 'wan2.7-image-pro'],
  )
  assert.equal(MAX_INPUT_IMAGES['wan2.7-image-pro'], 9)
  assert.equal(DEFAULT_TTS_VOICE, 'longanlingxin')
  assert.equal(TTS_SAMPLE_RATE, 24000)
})

test('ensureBridge returns the same instance while it is alive', async () => {
  const first = await ensureBridge({ resolveCredential: () => null })
  const second = await ensureBridge({ resolveCredential: () => null })
  assert.equal(first, second)
  assert.equal(first.port, second.port)
})
