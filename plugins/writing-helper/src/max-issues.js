/**
 * Layered maxIssues configuration for the writing checks.
 *
 * The logic analyzer and the quality aggregate use separate caps: logic
 * findings are capped at 100, while the quality result that combines
 * logic, style, citation, and preservation findings caps at 150.
 */

/** Sentinel meaning "do not truncate this layer". */
export const UNLIMITED = 'unlimited';

export const MAX_ISSUES_CONFIG = {
  logic: { default: 20, min: 1, max: 100 },
  quality: { default: 30, min: 1, max: 150 },
};

/**
 * Clamp a requested issue count into [config.min, config.max].
 * Non-finite values (undefined, NaN, Infinity) fall back to config.default.
 *
 * @param {*} value  Requested count (number or undefined)
 * @param {{default: number, min: number, max: number}} config  Layer bounds
 * @returns {number}  Clamped integer issue count
 */
export function clampMaxIssues(value, config) {
  if (!Number.isFinite(value ?? config.default)) return config.default;
  return Math.max(config.min, Math.min(config.max, Math.trunc(value ?? config.default)));
}
