# Volcengine Ark Coding Plan for OMP

This plugin registers Volcengine Ark Coding Plan as a native OMP provider. Install it from the `omp-enhancer` marketplace:

```bash
omp plugin marketplace add marapapman/omp-enhancer
omp plugin install volcengine-coding-plan@omp-enhancer
omp plugin enable volcengine-coding-plan@omp-enhancer
```

Restart OMP after installation so the provider appears in the model and login pickers.

## Login and model selection

Run `/login`, choose **Volcengine Ark Coding Plan**, open the [official API-key page](https://console.volcengine.com/ark/region:ark+cn-beijing/apikey) shown by OMP, and paste the key when prompted. The login flow stores the pasted key as the provider's API-key credential; it performs no network validation.

Use `/model` to select a current Coding Plan model, for example:

```text
/model volcengine-coding-plan/ark-code-latest
/model volcengine-coding-plan/deepseek-v4-flash
/model volcengine-coding-plan/kimi-k2.7-code
```

The catalog exposes the nine directly configurable model names from the current Coding Plan guide plus the console-managed `ark-code-latest` selector. `Auto` is not a valid direct `Model Name`; use `ark-code-latest` when the model should follow the Coding Plan console selection.
Direct model selectors:

- `doubao-seed-evolving`
- `doubao-seed-2.1-turbo`
- `doubao-seed-2.0-lite`
- `minimax-m3`
- `glm-5.3`
- `glm-5.3-flash`
- `deepseek-v4-flash`
- `deepseek-v4-pro`
- `kimi-k2.7-code`

The model names and Coding Plan rules follow the [official quick-start guide](https://docs.volcengine.com/docs/82379/1928261?lang=zh).

## Thinking intensity

Nine models expose manual levels in OMP's thinking selector: `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`, alongside `off` and `auto`. Endpoint behavior was verified live on 2026-09-05:

- `glm-5.3` rejects `minimal` (400 InvalidParameter); its lowest selectable level is `low`.
- `kimi-k2.7-code` receives reasoning content but ignores both `reasoning_effort` and `enable_thinking`; it intentionally has no manual efforts and remains limited to `off` and `auto`.

For the nine configurable models, selecting `off` sends `reasoning_effort` with that model's lowest listed value (OMP's lowest-effort disable mode), which the endpoint treats as near-zero thinking.

## Credentials and endpoint

Set `ARK_API_KEY` to use a key without running `/login`:

```bash
export ARK_API_KEY='your-api-key'
```

`VOLCENGINE_CODING_PLAN_API_KEY` is accepted as a descriptive fallback when `ARK_API_KEY` is unset. `ARK_API_KEY` takes precedence when both are present.

Requests use the official Coding Plan OpenAI-compatible endpoint:

```text
https://ark.cn-beijing.volces.com/api/coding/v3
```

Coding Plan is a subscription for supported AI coding tools. Use this provider only from OMP; do not repurpose the Coding Plan key/base URL as a general-purpose Ark API client.

Do not replace it with the ordinary `https://ark.cn-beijing.volces.com/api/v3` online-inference endpoint: that is a different service and may incur separate usage charges. Likewise, use the published Coding Plan names such as `deepseek-v4-flash`, not versioned online-inference IDs.
