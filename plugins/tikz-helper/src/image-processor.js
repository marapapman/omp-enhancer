import { TikzRuntimeError } from './runtime-error.js';

const SUPPORTED_INPUT_FORMATS = new Set(['png', 'jpeg', 'webp']);

export async function normalizeImageWithSharp(buffer) {
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch (error) {
    throw new TikzRuntimeError('IMAGE_PROCESSOR_UNAVAILABLE', 'The packaged sharp image processor is unavailable.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  let metadata;
  try {
    metadata = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: 40_000_000,
    }).metadata();
  } catch (error) {
    throw new TikzRuntimeError('INVALID_IMAGE', 'The input is not a readable image.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!SUPPORTED_INPUT_FORMATS.has(metadata.format)) {
    throw new TikzRuntimeError(
      'UNSUPPORTED_IMAGE_FORMAT',
      'Only decoded PNG, JPEG, and WebP inputs are supported.',
      { format: metadata.format ?? null },
    );
  }

  try {
    const normalized = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: normalized.data,
      input: {
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
      },
      output: {
        format: 'png',
        width: normalized.info.width,
        height: normalized.info.height,
      },
    };
  } catch (error) {
    throw new TikzRuntimeError('IMAGE_NORMALIZATION_FAILED', 'Unable to normalize the image as PNG.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export const sharpImageProcessor = Object.freeze({ normalize: normalizeImageWithSharp });
export const supportedInputFormats = Object.freeze([...SUPPORTED_INPUT_FORMATS]);
