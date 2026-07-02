import { readFile, writeFile } from 'node:fs/promises'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export interface ComparePngOptions {
  threshold: number
  maxDiffPixels?: number
  maxDiffPixelRatio?: number
  diffPath?: string
}

export interface ComparePngResult {
  passed: boolean
  width: number
  height: number
  diffPixels: number
  diffRatio: number
}

export async function comparePng(expectedPath: string, actualPath: string, options: ComparePngOptions): Promise<ComparePngResult> {
  const expected = PNG.sync.read(await readFile(expectedPath))
  const actual = PNG.sync.read(await readFile(actualPath))

  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      passed: false,
      width: actual.width,
      height: actual.height,
      diffPixels: Number.POSITIVE_INFINITY,
      diffRatio: Number.POSITIVE_INFINITY
    }
  }

  const diff = new PNG({ width: expected.width, height: expected.height })
  const diffPixels = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, { threshold: options.threshold })
  const diffRatio = diffPixels / (expected.width * expected.height)
  const passedByPixels = typeof options.maxDiffPixels === 'number' ? diffPixels <= options.maxDiffPixels : diffPixels === 0
  const passedByRatio = typeof options.maxDiffPixelRatio === 'number' ? diffRatio <= options.maxDiffPixelRatio : true

  if (options.diffPath) await writeFile(options.diffPath, PNG.sync.write(diff))

  return {
    passed: passedByPixels && passedByRatio,
    width: expected.width,
    height: expected.height,
    diffPixels,
    diffRatio
  }
}
