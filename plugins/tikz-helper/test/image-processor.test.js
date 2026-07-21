import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { appendFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, mock } from 'node:test';

import extension from '../index.js';
import { prepareAsset } from '../src/asset-prepare.js';
import {
  detectInputImage,
  imageMagickExecutableCandidates,
  imageMagickImageProcessor,
  normalizeImageWithImageMagick,
  parsePngDimensions,
} from '../src/image-processor.js';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngHeader(width = 16, height = 12) {
  const buffer = Buffer.alloc(24);
  PNG_SIGNATURE.copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function sourceFor(format) {
  if (format === 'png') return pngHeader(8, 6);
  if (format === 'jpeg') return Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  return Buffer.from('RIFF\u0004\u0000\u0000\u0000WEBP', 'binary');
}

function childProcess(pid = 31_337) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdin = new EventEmitter();
  child.stdin.end = mock.fn();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = mock.fn((signal) => {
    queueMicrotask(() => child.emit('close', null, signal));
    return true;
  });
  return child;
}

function successfulSpawn(calls, output = pngHeader()) {
  return mock.fn((executable, args, options) => {
    const child = childProcess();
    calls.push({ executable, args, options, child });
    queueMicrotask(() => {
      child.emit('spawn');
      child.stdout.emit('data', output);
      child.emit('close', 0, null);
    });
    return child;
  });
}

function schema(kind, data = {}) {
  const value = { __ompZodSchema: true, kind, ...data };
  value.optional = () => ({ ...value, optional: true });
  return value;
}

function makeExtensionApi() {
  return {
    registerTool: mock.fn(),
    setLabel: mock.fn(),
    zod: {
      z: {
        object: (shape) => schema('object', { shape }),
        string: () => schema('string'),
        number: () => schema('number'),
        boolean: () => schema('boolean'),
        array: (item) => schema('array', { item }),
        enum: (values) => schema('enum', { values }),
        optional: (value) => ({ ...value, optional: true }),
      },
    },
  };
}

describe('ImageMagick asset processor', () => {
  it('binds validated PNG, JPEG, and WebP magic to fixed coder operands after resource limits', async () => {
    for (const format of ['png', 'jpeg', 'webp']) {
      const calls = [];
      const source = sourceFor(format);
      const result = await normalizeImageWithImageMagick(source, {
        spawnImpl: successfulSpawn(calls, pngHeader(11, 7)),
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0].executable, 'magick');
      assert.deepEqual(calls[0].options.stdio, ['pipe', 'pipe', 'pipe']);
      assert.equal(calls[0].options.shell, false);
      assert.notEqual(calls[0].options.cwd, process.cwd());
      assert.deepEqual(calls[0].child.stdin.end.mock.calls[0].arguments, [source]);
      const inputIndex = calls[0].args.indexOf(`${format}:-`);
      assert.equal(inputIndex > 0, true);
      for (const resource of ['memory', 'map', 'disk', 'area', 'thread', 'time']) {
        const limitIndex = calls[0].args.findIndex((value, index) => value === '-limit' && calls[0].args[index + 1] === resource);
        assert.equal(limitIndex >= 0 && limitIndex < inputIndex, true, `${resource} must precede the input operand`);
      }
      assert.deepEqual(calls[0].args.slice(inputIndex), [
        `${format}:-`,
        '-auto-orient',
        '-resize',
        '2048x2048>',
        '-strip',
        '-define',
        'png:exclude-chunks=date,time',
        '-define',
        'png:compression-level=9',
        'png:-',
      ]);
      assert.deepEqual(result.output, { format: 'png', width: 11, height: 7 });
      assert.equal(result.evidence.executable, 'magick');
      assert.equal(Object.hasOwn(result.evidence, 'stdout'), false);
    }
  });

  it('rejects unrecognized magic before spawn and parses PNG IHDR dimensions locally', async () => {
    const spawnImpl = mock.fn();
    await assert.rejects(
      normalizeImageWithImageMagick(Buffer.from('not an image'), { spawnImpl }),
      (error) => error.code === 'UNSUPPORTED_IMAGE_FORMAT',
    );
    assert.equal(spawnImpl.mock.callCount(), 0);
    assert.deepEqual(detectInputImage(pngHeader(23, 29)), { format: 'png', width: 23, height: 29 });
    assert.deepEqual(detectInputImage(pngHeader(4096, 3072)), { format: 'png', width: 4096, height: 3072 });
    assert.deepEqual(parsePngDimensions(pngHeader(31, 37)), { width: 31, height: 37 });
    assert.throws(() => parsePngDimensions(Buffer.from('bad png')), (error) => error.code === 'INVALID_IMAGE');
  });

  it('falls back from magick to convert only for an initial ENOENT', async () => {
    const calls = [];
    const spawnImpl = mock.fn((executable, args, options) => {
      const child = childProcess(41_000 + calls.length);
      calls.push({ executable, args, options, child });
      queueMicrotask(() => {
        if (executable === 'magick') {
          const error = new Error('not found');
          error.code = 'ENOENT';
          child.emit('error', error);
          return;
        }
        child.emit('spawn');
        child.stdout.emit('data', pngHeader());
        child.emit('close', 0, null);
      });
      return child;
    });

    const result = await normalizeImageWithImageMagick(sourceFor('png'), { spawnImpl });
    assert.deepEqual(calls.map((call) => call.executable), ['magick', 'convert']);
    assert.equal(result.evidence.executable, 'convert');

    const nonzeroCalls = [];
    const nonzeroSpawn = mock.fn((executable) => {
      const child = childProcess();
      nonzeroCalls.push(executable);
      queueMicrotask(() => {
        child.emit('spawn');
        child.stderr.emit('data', Buffer.from('decode failed'));
        child.emit('close', 1, null);
      });
      return child;
    });
    await assert.rejects(
      normalizeImageWithImageMagick(sourceFor('png'), { spawnImpl: nonzeroSpawn }),
      (error) => error.code === 'IMAGE_NORMALIZATION_FAILED' && error.details.command.exitCode === 1,
    );
    assert.deepEqual(nonzeroCalls, ['magick']);

    const lateEnoentCalls = [];
    const lateEnoentSpawn = mock.fn((executable) => {
      const child = childProcess();
      lateEnoentCalls.push(executable);
      queueMicrotask(() => {
        child.emit('spawn');
        const error = new Error('late executable failure');
        error.code = 'ENOENT';
        child.emit('error', error);
      });
      return child;
    });
    await assert.rejects(
      normalizeImageWithImageMagick(sourceFor('png'), { spawnImpl: lateEnoentSpawn }),
      (error) => error.code === 'IMAGE_PROCESSOR_START_FAILED',
    );
    assert.deepEqual(lateEnoentCalls, ['magick']);
  });

  it('reports both missing fixed candidates as an actionable unavailable error', async () => {
    const spawnImpl = mock.fn(() => {
      const child = childProcess();
      queueMicrotask(() => {
        const error = new Error('not found');
        error.code = 'ENOENT';
        child.emit('error', error);
      });
      return child;
    });
    await assert.rejects(
      normalizeImageWithImageMagick(sourceFor('png'), { spawnImpl }),
      (error) => error.code === 'IMAGE_PROCESSOR_UNAVAILABLE'
        && error.details.executables.join(',') === 'magick,convert'
        && /ImageMagick/u.test(error.details.installHint),
    );
  });

  it('uses only magick on Windows and magick then convert on other platforms', async () => {
    assert.deepEqual(imageMagickExecutableCandidates('win32'), ['magick']);
    assert.deepEqual(imageMagickExecutableCandidates('linux'), ['magick', 'convert']);
    assert.deepEqual(imageMagickExecutableCandidates('darwin'), ['magick', 'convert']);

    const calls = [];
    const spawnImpl = mock.fn((executable) => {
      calls.push(executable);
      const child = childProcess();
      queueMicrotask(() => {
        const error = new Error('not found');
        error.code = 'ENOENT';
        child.emit('error', error);
      });
      return child;
    });
    await assert.rejects(
      normalizeImageWithImageMagick(sourceFor('png'), { platform: 'win32', spawnImpl }),
      (error) => error.code === 'IMAGE_PROCESSOR_UNAVAILABLE'
        && error.details.executables.join(',') === 'magick'
        && /Windows requires `magick`/u.test(error.details.installHint),
    );
    assert.deepEqual(calls, ['magick']);
  });

  it('caps stdout and stderr independently and terminates output, abort, and timeout paths', async () => {
    const scenarios = [
      { code: 'IMAGE_OUTPUT_LIMIT', stream: 'stdout', data: pngHeader(100, 100), options: { maxStdoutBytes: 8, timeoutMs: 5_000 } },
      { code: 'IMAGE_STDERR_LIMIT', stream: 'stderr', data: Buffer.alloc(32), options: { maxStderrBytes: 8, timeoutMs: 5_000 } },
      { code: 'IMAGE_PROCESSOR_ABORTED', abort: true, options: { timeoutMs: 5_000 } },
      { code: 'IMAGE_PROCESSOR_TIMEOUT', options: { timeoutMs: 5 } },
    ];

    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = scenarios[index];
      const controller = new AbortController();
      const child = childProcess(50_000 + index);
      let spawnOptions;
      const spawnImpl = mock.fn((_executable, _args, options) => {
        spawnOptions = options;
        queueMicrotask(() => {
          child.emit('spawn');
          if (scenario.stream) child[scenario.stream].emit('data', scenario.data);
          if (scenario.abort) controller.abort();
        });
        return child;
      });
      const groupKill = mock.fn((_pid, signal) => {
        queueMicrotask(() => child.emit('close', null, signal));
      });
      const keepAlive = scenario.code === 'IMAGE_PROCESSOR_TIMEOUT' ? setTimeout(() => {}, 100) : undefined;

      try {
        await assert.rejects(
          normalizeImageWithImageMagick(sourceFor('png'), {
            ...scenario.options,
            signal: controller.signal,
            spawnImpl,
            killImpl: groupKill,
          }),
          (error) => error.code === scenario.code
            && error.details.terminationScope === (process.platform === 'win32' ? 'direct-child-only' : 'process-group')
            && !JSON.stringify(error.details).includes(sourceFor('png').toString('base64')),
          scenario.code,
        );
      } finally {
        if (keepAlive) clearTimeout(keepAlive);
      }

      if (process.platform === 'win32') {
        assert.equal(spawnOptions.detached, false);
        assert.equal(groupKill.mock.callCount(), 0);
        assert.equal(child.kill.mock.callCount(), 1);
      } else {
        assert.equal(spawnOptions.detached, true);
        assert.deepEqual(groupKill.mock.calls[0].arguments, [-child.pid, 'SIGKILL']);
        assert.equal(child.kill.mock.callCount(), 0);
      }
    }
  });

  it('passes the current abort signal through asset preparation', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'tikz-project-'));
    const inputPath = join(projectRoot, 'source.png');
    await writeFile(inputPath, pngHeader());
    const controller = new AbortController();
    let observedSignal;
    const processor = {
      async normalize(_buffer, options) {
        observedSignal = options.signal;
        return {
          buffer: pngHeader(),
          input: { format: 'png', width: 16, height: 12 },
          output: { format: 'png', width: 16, height: 12 },
          evidence: { executable: 'magick', args: [], shell: false },
        };
      },
    };
    await prepareAsset({ projectRoot, inputPath }, { processor, signal: controller.signal });
    assert.equal(observedSignal, controller.signal);
  });

  it('reads the already-open source only through limit plus one when it grows after fstat', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'tikz-project-'));
    const inputPath = join(projectRoot, 'growing.png');
    await writeFile(inputPath, pngHeader());
    const processor = { normalize: mock.fn() };
    let observedHandle;

    await assert.rejects(
      prepareAsset({ projectRoot, inputPath }, {
        processor,
        sourceRead: {
          maximumBytes: 32,
          async afterStat({ fileHandle }) {
            observedHandle = fileHandle;
            await appendFile(inputPath, Buffer.alloc(64));
          },
        },
      }),
      (error) => error.code === 'IMAGE_TOO_LARGE'
        && error.details.bytes === 33
        && error.details.maximumBytes === 32,
    );
    assert.equal(processor.normalize.mock.callCount(), 0);
    await assert.rejects(observedHandle.stat(), (error) => error.code === 'EBADF');
  });

  it('checks abort state during bounded source reads and still closes the handle', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'tikz-project-'));
    const inputPath = join(projectRoot, 'aborted.png');
    await writeFile(inputPath, pngHeader());
    const processor = { normalize: mock.fn() };
    const controller = new AbortController();
    let observedHandle;

    await assert.rejects(
      prepareAsset({ projectRoot, inputPath }, {
        processor,
        signal: controller.signal,
        sourceRead: {
          afterStat({ fileHandle }) {
            observedHandle = fileHandle;
            controller.abort();
          },
        },
      }),
      (error) => error.code === 'IMAGE_READ_ABORTED',
    );
    assert.equal(processor.normalize.mock.callCount(), 0);
    await assert.rejects(observedHandle.stat(), (error) => error.code === 'EBADF');
  });

  it('uses exec approval and has no npm runtime dependency', async () => {
    const api = makeExtensionApi();
    extension(api);
    const assetTool = api.registerTool.mock.calls.map((call) => call.arguments[0])
      .find((tool) => tool.name === 'tikz_prepare_asset');
    assert.equal(assetTool.approval, 'exec');
    assert.equal(imageMagickImageProcessor.normalize, normalizeImageWithImageMagick);

    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.deepEqual(packageJson.dependencies ?? {}, {});
  });
});
