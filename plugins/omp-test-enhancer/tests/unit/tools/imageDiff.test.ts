import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { comparePng } from '../../../src/tools/imageDiff.js'

async function writePng(path: string, color: [number, number, number, number]): Promise<void> {
  const image = new PNG({ width: 2, height: 2 })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = color[0]
    image.data[offset + 1] = color[1]
    image.data[offset + 2] = color[2]
    image.data[offset + 3] = color[3]
  }
  await writeFile(path, PNG.sync.write(image))
}

describe('comparePng', () => {
  it('passes identical images', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-diff-'))
    await mkdir(cwd, { recursive: true })
    const expected = join(cwd, 'expected.png')
    const actual = join(cwd, 'actual.png')
    await writePng(expected, [255, 0, 0, 255])
    await writePng(actual, [255, 0, 0, 255])

    await expect(comparePng(expected, actual, { threshold: 0.1 })).resolves.toMatchObject({
      passed: true,
      width: 2,
      height: 2,
      diffPixels: 0,
      diffRatio: 0
    })
  })

  it('fails changed pixels and writes a diff image', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-diff-'))
    const expected = join(cwd, 'expected.png')
    const actual = join(cwd, 'actual.png')
    const diff = join(cwd, 'diff.png')
    await writePng(expected, [255, 0, 0, 255])
    await writePng(actual, [0, 0, 255, 255])

    await expect(comparePng(expected, actual, { threshold: 0.1, maxDiffPixels: 0, diffPath: diff })).resolves.toMatchObject({
      passed: false,
      width: 2,
      height: 2,
      diffPixels: 4,
      diffRatio: 1
    })
    expect((await readFile(diff)).length).toBeGreaterThan(0)
  })
})
