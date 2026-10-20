# OpenDesign (AMR) for OMP

This plugin registers the OpenDesign model gateway as a native OMP provider. Install it from the `omp-enhancer` marketplace:

```bash
omp plugin marketplace add marapapman/omp-enhancer
omp plugin install opendesign-coding-plan@omp-enhancer
omp plugin enable opendesign-coding-plan@omp-enhancer
```

Restart OMP after installation so the provider appears in the model and login pickers.

## Login and the Vela CLI

Run `/login`, choose **OpenDesign**. The login flow signs in with the official Vela CLI:

- If `~/.amr/config.json` already holds a Vela session, that runtime key is validated and reused; no browser round trip happens.
- Otherwise the flow makes sure the Vela CLI is installed (`npm install --global @powerformer/vela-cli`), runs `vela login`, and shows the device URL and code from the CLI in the OMP login dialog.
- If the CLI cannot be installed or its sign-in fails, the flow falls back to the OpenDesign cloud console API-key page and stores a pasted key.

Set `OPENDESIGN_SKIP_VELA_INSTALL=1` to keep the flow from installing the CLI, and `OPENDESIGN_VELA_PATH` to point at an existing binary.

`/logout` removes the OMP-stored credential. The Vela session file belongs to the CLI itself and is left in place; delete `~/.amr/config.json` to sign the CLI out too.

## Models and quota

`/model` lists the account's live model roster, fetched from the gateway with the stored runtime key. The bundled fallback roster keeps the provider usable before the first successful fetch.

`/usage` reports the plan read from the signed-in Vela session: membership tier and status, available credits, today's spend, the billing period end, and the Design Plan windows from `vela billing preflight`. Each window shows used/remaining percentage plus its reset time (`windowStart` + duration when Vela omits `resetsAt`). The personal account API rejects a personal control key on `/billing/summary` and `/wallet/balance`, so those HTTP probes only serve team workspaces; when the summary fails but preflight succeeds, `/usage` shows the Design Plan windows and a note instead of hiding them.

## Credentials and endpoints

```text
inference   https://amr-link.open-design.ai/v1   runtime key, Bearer
account     https://amr-api.open-design.ai/api/v1 control key, Bearer
session     ~/.amr/config.json                    runtimeKey + controlKey
```

Set `OPENDESIGN_API_KEY` (or `OPENDESIGN_RUNTIME_KEY`) to use a key without running `/login`. An environment key acts as a login fallback, so unset it when `/logout` should disable the provider.

Overrides for non-default setups: `OPENDESIGN_VELA_PATH`, `OPENDESIGN_NPM_PATH`, `OPENDESIGN_CONFIG_PATH`, `OPENDESIGN_LINK_BASE`, `OPENDESIGN_CONTROL_BASE`, `OPENDESIGN_CONTROL_KEY`, `OPENDESIGN_WORKSPACE_ID`.
