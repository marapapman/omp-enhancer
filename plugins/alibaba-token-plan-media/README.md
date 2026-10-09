# alibaba-token-plan-media

An OMP extension that exposes Alibaba Bailian Token Plan image and speech models to OMP's native image and speech roles. It starts an HTTP bridge bound to `127.0.0.1` on an ephemeral port inside the OMP process, registers the provider `alibaba-token-plan-media` with base URL `http://127.0.0.1:<port>/v1`, and translates OMP's `openai-images` and `openai-speech` requests into Alibaba Bailian Token Plan DashScope API calls. The extension registers no tools, leaves default model roles unchanged, and never touches the built-in `alibaba-token-plan` provider, its base URL, or its models.

## Install

```sh
omp plugin install alibaba-token-plan-media@omp-enhancer
```

## Usage

Prerequisite: a `/login alibaba-token-plan` session whose Token Plan credential (`sk-sp-...`) lives in OMP's credential store. The bridge reads that credential from OMP at request time and stores nothing itself.

The four models register with `api: openai-images` and `api: openai-speech`, so they show up in the IMAGE and speech model-role pickers beside the built-in image and TTS models, with display names carrying a `(Token Plan)` suffix. Role configuration uses provider-qualified ids:

```yaml
modelRoles:
  image: alibaba-token-plan-media/wan2.7-image
  speech: alibaba-token-plan-media/qwen-audio-3.0-tts-plus
```

Image requests accept `n: 1` only, with sizes `1024x1024`, `1536x1024`, and `1024x1536`.

## Models

| Model id | Role | Notes |
| --- | --- | --- |
| `qwen-image-3.0-pro` | image | Up to 3 input reference images |
| `wan2.7-image` | image | Up to 9 input reference images |
| `wan2.7-image-pro` | image | Up to 9 input reference images |
| `qwen-audio-3.0-tts-plus` | speech | `mp3` (default) or `wav`; sample rate 24000; default voice `longanlingxin` |

## Environment variables

| Variable | Default | Applies when |
| --- | --- | --- |
| `ALIBABA_TOKEN_PLAN_MEDIA_API_ORIGIN` | `https://token-plan.cn-beijing.maas.aliyuncs.com` | Upstream API origin used when the stored credential carries no usable base URL |
| `ALIBABA_TOKEN_PLAN_MEDIA_TTS_VOICE` | `longanlingxin` | Default voice used when a speech request does not name one |

These two variables are the only ones the plugin reads.

## How it works

Each OMP process runs one bridge, shared by every session, and shuts it down when the last session ends. The provider's base URL points at the bridge, which validates each request, attaches the Token Plan bearer token read from OMP's credential store, and calls the Bailian DashScope API. The listener binds to `127.0.0.1` on an ephemeral port and requires a per-process random bearer token on every request, so it is unreachable from the network.

## Limitations

- Token Plan terms allow this subscription from interactive coding and agent tools only. The plugin runs only inside an OMP session and offers no standalone CLI or batch mode.
- Speech synthesis has no streaming. Long input can exceed the bridge's 50 s speech timeout; the bridge then returns HTTP 504 and OMP falls back to the next configured speech candidate.
- Any image size outside `1024x1024`, `1536x1024`, and `1024x1536` gets HTTP 400, and OMP moves to the next configured image candidate.
- Image generation has a 150 s upstream timeout; exceeding it returns HTTP 504 and OMP tries the next configured image candidate.
