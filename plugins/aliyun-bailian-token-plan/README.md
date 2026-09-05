# Alibaba Cloud Bailian Token Plan for OMP

This plugin registers Alibaba Cloud Bailian Token Plan as a native OMP provider. Install it from the `omp-enhancer` marketplace:

```bash
omp plugin marketplace add marapapman/omp-enhancer
omp plugin install aliyun-bailian-token-plan@omp-enhancer
omp plugin enable aliyun-bailian-token-plan@omp-enhancer
```

Restart OMP after installation so the provider appears in the model and login pickers.

## Login and model selection

Run `/login`, choose **Alibaba Cloud Bailian Token Plan**, open the [official Token Plan key page](https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/token-plan), and paste the key when prompted. The login flow trims the key, rejects an empty key, and performs no network validation.

You can then use `/model` with a catalog model, for example:

```text
/model aliyun-bailian-token-plan/qwen3.8-max
/model aliyun-bailian-token-plan/deepseek-v4-pro
/model aliyun-bailian-token-plan/kimi-k2.7-code
```

The catalog includes the documented text-capable models available through current personal and team Token Plans. Personal and team availability differs; select a model covered by your own plan. The catalog is static and may need an update when Alibaba changes Token Plan offerings.

## Thinking intensity

The catalog exposes OMP thinking controls for models with a documented
effort surface:

- `qwen3.8-max`: `low`, `medium`, `xhigh` (default `xhigh`)
- Qwen 3.8 Flash, Qwen 3.7, and Qwen 3.6 models: `minimal`, `low`,
  `medium`, `high`
- DeepSeek V4: `low`, `high`, `max`; DeepSeek V3.2: `high`, `max`
- GLM 5.x: `minimal`, `low`, `medium`, `high`, `max`

Kimi K2.7/K2.6/K2.5 and MiniMax-M2.5 have no documented manual-effort
contract for this Token Plan endpoint, so the plugin leaves their provider
default enabled instead of sending an unsupported manual effort field. The
Qwen3.8 Max path uses the documented `enable_thinking` plus effort-compatible
OpenAI request shape.

Because `DASHSCOPE_API_KEY` has highest precedence, clear or override a
pre-existing pay-as-you-go DashScope key before using this provider if it is
not the Token Plan key.

## Credentials and endpoint

Set one of these environment variables to use a key without running `/login`:

```bash
export DASHSCOPE_API_KEY='sk-sp-your-token-plan-key'
# or, when DASHSCOPE_API_KEY is not set:
export ALIYUN_BAILIAN_TOKEN_PLAN_API_KEY='sk-sp-your-token-plan-key'
# or, when both variables above are not set:
export BAILIAN_TOKEN_PLAN_API_KEY='sk-sp-your-token-plan-key'
```

Values are trimmed. `DASHSCOPE_API_KEY` takes precedence, followed by `ALIYUN_BAILIAN_TOKEN_PLAN_API_KEY`, then `BAILIAN_TOKEN_PLAN_API_KEY`.

Requests use the official Beijing Token Plan OpenAI-compatible endpoint:

```text
https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
```

If your OMP version also lists a built-in `alibaba-token-plan` provider, that entry targets OMP's international QwenCloud/Singapore service. This plugin is specifically for the Beijing China Token Plan endpoint documented above.

Token Plan keys are dedicated credentials for supported interactive coding and agent tools. Use this OMP provider for that supported workflow; do not use Token Plan keys for generic application or backend API calls.

For plan details and the current model lists, see Alibaba Cloud's official [Model Studio more-tools documentation](https://help.aliyun.com/zh/model-studio/more-tools) and [Bailian Token Plan console](https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/token-plan).
