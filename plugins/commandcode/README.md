# Command Code for OMP

This plugin registers the [Command Code Provider API](https://commandcode.ai/docs/provider) as a native OMP provider. Install it from the `omp-enhancer` marketplace:

```bash
omp plugin marketplace add marapapman/omp-enhancer
omp plugin install commandcode@omp-enhancer
omp plugin enable commandcode@omp-enhancer
```

Restart OMP after installation so the provider appears in the model and login pickers.

## Login and model selection

Run `/login`, choose **Command Code**, open the [official API-key page](https://commandcode.ai/settings/keys) shown by OMP, and paste the key when prompted. The login flow stores the pasted key as the provider's API-key credential; it performs no network validation.

Use `/model` to select a model, for example:

```text
/model commandcode/claude-sonnet-5
/model commandcode/gpt-5.6-sol
/model commandcode/deepseek/deepseek-v4-flash
```

The full catalog (69 models at packaging time) follows the [official model list](https://commandcode.ai/docs/reference/cli/models). Model ids are case-insensitive on the Command Code side.

## Routing

Every model shares the base URL `https://api.commandcode.ai/provider/v1`. Each entry carries a per-model `api`:

- **Claude models** use `anthropic-messages` → OMP posts `…/provider/v1/messages`. The OpenAI-style `/v1` suffix is stripped by OMP before the Anthropic transport appends `/v1/messages`, so no double-path results.
- **All other models** use `openai-completions` → `…/provider/v1/chat/completions`.

The docs are explicit that Claude models sent to `/chat/completions` fail with a 400, which is why the per-model `api` split matters.

## Thinking intensity

Reasoning-capable models expose a thinking ladder in OMP's selector (`off`, `auto`, plus the listed levels); everything else shows only `off`/`auto` and uses upstream default thinking. Ladders are opt-in per model — `defineModel` defaults to `null` and only the families below pass one. Command Code forwards the effort (or budget) upstream. If a model rejects a level with a 400 naming the effort, trim its ladder in `index.js`.

- Claude: `budget` ladder `minimal`–`xhigh` (sent as thinking budget on `/messages`).
- GPT: `minimal`–`max`.
- DeepSeek: `low`, `high`, `max`.
- GLM (`zai-org/GLM-*`): `minimal`–`max`.
- Kimi, MiniMax, MiMo, Qwen, Gemini, and all niche ids: no synthesized ladder (default provider behavior) unless you add one.

## Credentials and endpoint

Set `CMD_API_KEY` to use a key without running `/login`:

```bash
export CMD_API_KEY='your-api-key'
```

`COMMANDCODE_API_KEY` is accepted as a descriptive fallback when `CMD_API_KEY` is unset. `CMD_API_KEY` takes precedence when both are present.

Requests use the official Provider API endpoint:

```text
https://api.commandcode.ai/provider/v1
```

Optional: set the `x-cmd-zdr: 1` header externally (not configured by this plugin) to enforce zero data retention; requests fail with `422` when a model has no ZDR upstream.

Model ids and `contextWindow` values are synced against the live `GET /provider/v1/models` response at packaging time (the bundled test asserts the id set matches it exactly). `maxTokens`, `input` modality, and the effort ladders are conservative estimates from the underlying model families, not values Command Code publishes — treat them as provisional and adjust in `index.js` if a request says otherwise.

## Billing

Command Code bills usage against your account credits at the published per-model token rates. OMP's per-token cost display is not modeled: catalog entries ship zero costs, so OMP usage summaries show tokens but $0.00. Consult the Command Code pricing page for actual spend; plug real rates into the per-model `cost` fields in `index.js` if you want OMP to estimate dollars.
