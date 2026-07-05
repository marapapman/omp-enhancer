import { classifyProviderError } from './errors.js';
import { SimpleAssistantMessageEventStream } from './event-stream.js';
import { getOpenCodeGoUpstreamApi } from './provider-registration.js';
import { usageFromAssistantMessage } from './usage.js';

const DEFAULT_MAX_ATTEMPTS = 8;

export function createBalancedStream(deps = {}) {
  const createStream = deps.createStream ?? (() => new SimpleAssistantMessageEventStream());
  const now = deps.now ?? (() => Date.now());

  return function streamOpenCodeGoBalanced(model, context, options = {}) {
    const outer = createStream();

    void (async () => {
      const excludedHashes = new Set();
      let lastError;

      attemptLoop:
      for (let attemptIndex = 0; attemptIndex < (deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS); attemptIndex += 1) {
        let selected;
        const attemptStartedAt = now();
        let emittedReplayUnsafeEvent = false;
        const bufferedEvents = [];

        try {
          selected = await deps.keyPool.selectKey({
            primaryApiKey: options.apiKey,
            excludedHashes,
          });
        } catch (error) {
          outer.fail(error);
          return;
        }

        let streamSimple;
        try {
          streamSimple = deps.streamSimple ?? (await deps.resolveStreamSimple?.());
        } catch (error) {
          await recordFailure({ deps, selected, model, error, durationMs: now() - attemptStartedAt });
          outer.fail(error);
          return;
        }
        if (typeof streamSimple !== 'function') {
          const error = new Error('OpenCode Go pool cannot find the OMP streamSimple runtime.');
          await recordFailure({ deps, selected, model, error, durationMs: now() - attemptStartedAt });
          outer.fail(error);
          return;
        }

        try {
          const upstreamModel = {
            ...model,
            api: getOpenCodeGoUpstreamApi(model),
            compat: model.compat ?? model.compatConfig ?? {},
          };
          const inner = streamSimple(upstreamModel, context, {
            ...options,
            apiKey: selected.key,
          });

          for await (const event of inner) {
            if (!emittedReplayUnsafeEvent && isPreOutputBufferableEvent(event)) {
              bufferedEvents.push(event);
              continue;
            }

            if (!emittedReplayUnsafeEvent && event?.type === 'error') {
              const classification = await recordFailure({
                deps,
                selected,
                model,
                error: event.error,
                durationMs: now() - attemptStartedAt,
              });
              lastError = event.error;
              if (classification.retryableBeforeOutput) {
                excludedHashes.add(selected.hash);
                continue attemptLoop;
              }
              flushBuffered(outer, bufferedEvents);
              outer.push(event);
              return;
            }

            flushBuffered(outer, bufferedEvents);
            emittedReplayUnsafeEvent = true;

            if (event?.type === 'done') {
              await recordSuccess({
                deps,
                selected,
                model,
                message: event.message,
                durationMs: now() - attemptStartedAt,
              });
              outer.push(event);
              return;
            }

            outer.push(event);
          }

          const message = typeof inner?.result === 'function' ? await inner.result() : undefined;
          if (message) {
            flushBuffered(outer, bufferedEvents);
            await recordSuccess({
              deps,
              selected,
              model,
              message,
              durationMs: now() - attemptStartedAt,
            });
            outer.end(message);
            return;
          }

          throw new Error('OpenCode Go upstream stream ended without a final message');
        } catch (error) {
          const classification = await recordFailure({
            deps,
            selected,
            model,
            error,
            durationMs: now() - attemptStartedAt,
          });
          lastError = error;
          if (!emittedReplayUnsafeEvent && classification.retryableBeforeOutput) {
            excludedHashes.add(selected.hash);
            continue attemptLoop;
          }
          flushBuffered(outer, bufferedEvents);
          outer.fail(error);
          return;
        }
      }

      outer.fail(lastError ?? new Error('OpenCode Go key pool exhausted.'));
    })();

    return outer;
  };
}

export async function resolveRuntimeStreamSimple(pi) {
  if (typeof pi?.streamSimple === 'function') return pi.streamSimple;
  if (typeof pi?.pi?.streamSimple === 'function') return pi.pi.streamSimple;
  try {
    const mod = await import('@oh-my-pi/pi-ai');
    if (typeof mod.streamSimple === 'function') return mod.streamSimple;
  } catch {
    // Fall through to the explicit error below.
  }
  throw new Error('Unable to resolve @oh-my-pi/pi-ai streamSimple from the OMP runtime.');
}

function isPreOutputBufferableEvent(event) {
  return event?.type === 'start';
}

function flushBuffered(outer, bufferedEvents) {
  while (bufferedEvents.length > 0) {
    outer.push(bufferedEvents.shift());
  }
}

async function recordSuccess({ deps, selected, model, message, durationMs }) {
  const usage = usageFromAssistantMessage(message);
  await deps.keyPool.recordSuccess(selected, usage).catch(() => {});
  await deps.usageLedger?.appendAttempt?.({
    timestamp: Date.now(),
    provider: model.provider,
    model: model.id,
    key: publicKey(selected),
    success: true,
    durationMs,
    usage,
  }).catch(() => {});
}

async function recordFailure({ deps, selected, model, error, durationMs }) {
  const classification = classifyProviderError(error);
  const recorded = await deps.keyPool.recordFailure(selected, error).catch(() => classification);
  await deps.usageLedger?.appendAttempt?.({
    timestamp: Date.now(),
    provider: model.provider,
    model: model.id,
    key: publicKey(selected),
    success: false,
    durationMs,
    usage: usageFromAssistantMessage(error),
    error: classification,
  }).catch(() => {});
  return recorded;
}

function publicKey(selected) {
  return {
    label: selected.label,
    hash: selected.hash,
    source: selected.source,
  };
}
