#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const svgPath = process.argv[2];

if (!svgPath) {
  console.error('Usage: node check-svg-flowchart.mjs <diagram.svg>');
  process.exitCode = 2;
} else {
  try {
    const source = await readFile(svgPath, 'utf8');
    const findings = checkSvgFlowchart(source);
    if (findings.length) {
      for (const finding of findings) console.error(`- ${finding}`);
      process.exitCode = 1;
    } else {
      console.log(`SVG flowchart check passed: ${svgPath}`);
    }
  } catch (error) {
    console.error(`Unable to read SVG: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

function checkSvgFlowchart(source) {
  let document;
  try {
    document = parseXmlDocument(source);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  const findings = [];
  const { root, tags } = document;
  const allowedElements = new Set([
    'svg', 'title', 'desc', 'g', 'defs', 'marker', 'rect', 'circle', 'ellipse',
    'polygon', 'line', 'polyline', 'text', 'tspan', 'metadata',
  ]);
  const directIdElements = new Set(['line', 'polyline', 'text']);
  const nodeShapeElements = new Set(['rect', 'circle', 'ellipse', 'polygon']);
  const allowedColors = new Set(['none', 'black', 'white', '#000', '#000000', '#fff', '#ffffff']);
  const ids = new Map();

  if (root.name !== 'svg') findings.push('The document root must be <svg>.');
  if (root.attributes.get('xmlns') !== 'http://www.w3.org/2000/svg') {
    findings.push('Root <svg> must declare xmlns="http://www.w3.org/2000/svg".');
  }

  const viewBox = strictNumbers(root.attributes.get('viewbox') ?? '', 'viewBox', findings);
  if (viewBox.length !== 4) findings.push('viewBox must contain exactly four SVG numbers.');
  else if (viewBox[2] <= 0 || viewBox[3] <= 0) findings.push('viewBox width and height must be positive.');

  if (!hasNonEmptyElement(source, 'title')) findings.push('SVG must contain a non-empty <title>.');
  if (!hasNonEmptyElement(source, 'desc')) findings.push('SVG must contain a non-empty <desc>.');

  for (const tag of tags) {
    const name = tag.name;
    if (name !== name.toLowerCase() || !allowedElements.has(name)) {
      findings.push(`<${name}> elements are not allowed; use only simple SVG geometry.`);
    }

    for (const [attributeName, value] of tag.attributes) {
      if (/^on[a-z]/iu.test(attributeName)) {
        findings.push(`Event-handler attribute ${attributeName} is not allowed.`);
      }
      if (attributeName === 'transform') {
        findings.push(`Transform attributes are not allowed on <${name}>; use explicit geometry.`);
      }
      if (attributeName === 'stroke-linecap' && value.trim().toLowerCase() === 'round') {
        findings.push('Rounded connector caps are not allowed; use butt or square caps.');
      }
      if (attributeName === 'stroke-linejoin' && value.trim().toLowerCase() === 'round') {
        findings.push('Rounded connector joins are not allowed; use miter joins.');
      }
      if (/javascript\s*:/iu.test(value) || /(?:^|[;\s])(?:@import|expression\s*\()/iu.test(value)) {
        findings.push(`Active content in attribute ${attributeName} is not allowed.`);
      }
      for (const match of value.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/giu)) {
        if (!/^#[A-Za-z_][\w:.-]*$/u.test(match[1])) {
          findings.push(`External URL reference is not allowed in attribute ${attributeName}.`);
        }
      }
      if ((attributeName === 'href' || attributeName === 'xlink:href') && !/^#[A-Za-z_][\w:.-]*$/u.test(value)) {
        findings.push(`External reference ${value} is not allowed.`);
      }
    }

    for (const colorName of ['fill', 'stroke', 'color']) {
      for (const rawColor of [tag.attributes.get(colorName), styleValue(tag.attributes.get('style'), colorName)]) {
        if (!rawColor) continue;
        const color = rawColor.trim().toLowerCase();
        if (!allowedColors.has(color)) findings.push(`Unsupported color ${color}; use only black, white, or none.`);
      }
    }

    const id = tag.attributes.get('id');
    if (directIdElements.has(name) && !id) findings.push(`${name}@${tag.index} must have a stable id.`);
    if (nodeShapeElements.has(name) && !id && !hasIdentifiedContainer(tag)) {
      findings.push(`${name}@${tag.index} must have a stable id on itself or an enclosing group.`);
    }
    if (id) {
      if (ids.has(id)) findings.push(`Duplicate id ${id}; every SVG id must be unique.`);
      else ids.set(id, tag.index);
    }

    validateGeometry(tag, findings);
  }

  return [...new Set(findings)];
}

function parseXmlDocument(source) {
  let xml = String(source ?? '').trim();
  if (!xml) throw new Error('SVG document is empty.');
  if (/<!--/u.test(xml)) throw new Error('XML comments are not allowed in flowchart SVG files.');
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/iu.test(xml)) throw new Error('DTD, entity declarations, and CDATA are not allowed.');

  if (xml.startsWith('<?xml')) {
    const declarationEnd = xml.indexOf('?>');
    if (declarationEnd < 0) throw new Error('XML declaration is not closed.');
    xml = xml.slice(declarationEnd + 2).trimStart();
  }
  if (/<\?/u.test(xml)) throw new Error('XML processing instructions are not allowed.');

  const stack = [];
  const tags = [];
  let root = null;
  let cursor = 0;

  while (cursor < xml.length) {
    const opening = xml.indexOf('<', cursor);
    const textEnd = opening < 0 ? xml.length : opening;
    const text = xml.slice(cursor, textEnd);
    if (!stack.length && text.trim()) throw new Error('Text is not allowed outside the root SVG element.');
    validateEntities(text);
    if (opening < 0) break;

    const closing = findTagEnd(xml, opening);
    const raw = xml.slice(opening + 1, closing).trim();
    if (!raw || raw.startsWith('!') || raw.startsWith('?')) throw new Error(`Unsupported XML construct at offset ${opening}.`);

    if (raw.startsWith('/')) {
      const match = raw.match(/^\/\s*([A-Za-z][\w:.-]*)\s*$/u);
      if (!match) throw new Error(`Malformed closing tag at offset ${opening}.`);
      const expected = stack.pop();
      if (!expected) throw new Error(`Unexpected closing tag </${match[1]}>.`);
      if (expected.name !== match[1]) throw new Error(`Mismatched closing tag </${match[1]}>; expected </${expected.name}>.`);
      cursor = closing + 1;
      continue;
    }

    const selfClosing = /\/\s*$/u.test(raw);
    const body = selfClosing ? raw.replace(/\/\s*$/u, '').trimEnd() : raw;
    const match = body.match(/^([A-Za-z][\w:.-]*)([\s\S]*)$/u);
    if (!match || match[2] && !/^\s/u.test(match[2])) throw new Error(`Malformed opening tag at offset ${opening}.`);
    const name = match[1];
    const attributes = parseAttributes(match[2], name);
    const tag = { name, attributes, index: opening, parent: stack.at(-1) ?? null };

    if (!stack.length) {
      if (root) throw new Error('SVG must contain exactly one root element.');
      root = tag;
      if (name !== 'svg') throw new Error('The document root must be <svg>.');
    }
    tags.push(tag);
    if (!selfClosing) stack.push(tag);
    cursor = closing + 1;
  }

  if (stack.length) throw new Error(`Unclosed element <${stack.at(-1).name}> in SVG document.`);
  if (!root) throw new Error('SVG must contain exactly one root SVG element.');
  return { root, tags };
}

function findTagEnd(source, opening) {
  let quote = null;
  for (let index = opening + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '>') return index;
  }
  throw new Error(`Unclosed XML tag at offset ${opening}.`);
}

function parseAttributes(source, elementName) {
  const attributes = new Map();
  let cursor = 0;

  while (cursor < source.length) {
    while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
    if (cursor >= source.length) break;
    const nameMatch = source.slice(cursor).match(/^([A-Za-z_:][\w:.-]*)/u);
    if (!nameMatch) throw new Error(`Malformed attribute on <${elementName}>.`);
    const originalName = nameMatch[1];
    const name = originalName.toLowerCase();
    cursor += originalName.length;
    while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
    if (source[cursor] !== '=') throw new Error(`Attribute ${originalName} on <${elementName}> must use a quoted value.`);
    cursor += 1;
    while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") throw new Error(`Attribute ${originalName} on <${elementName}> must use a quoted value.`);
    const valueEnd = source.indexOf(quote, cursor + 1);
    if (valueEnd < 0) throw new Error(`Attribute ${originalName} on <${elementName}> is not closed.`);
    const value = source.slice(cursor + 1, valueEnd);
    if (value.includes('<')) throw new Error(`Attribute ${originalName} on <${elementName}> contains invalid markup.`);
    validateEntities(value);
    if (attributes.has(name)) throw new Error(`Duplicate attribute ${originalName} on <${elementName}>.`);
    attributes.set(name, value);
    cursor = valueEnd + 1;
  }

  return attributes;
}

function validateEntities(value) {
  const stripped = value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/giu, '');
  if (stripped.includes('&')) throw new Error('Only predefined or numeric XML entities are allowed.');
}

function validateGeometry(tag, findings) {
  const { name, attributes, index } = tag;
  if (name === 'text') {
    requireCoordinates(tag, ['x', 'y'], findings);
    validateFontSize(tag, true, findings);
  } else if (name === 'tspan') {
    validateFontSize(tag, false, findings);
  } else if (name === 'line') {
    requireCoordinates(tag, ['x1', 'y1', 'x2', 'y2'], findings);
  } else if (name === 'rect') {
    requireCoordinates(tag, ['x', 'y', 'width', 'height'], findings);
    requirePositive(tag, ['width', 'height'], findings);
  } else if (name === 'circle') {
    requireCoordinates(tag, ['cx', 'cy', 'r'], findings);
    requirePositive(tag, ['r'], findings);
  } else if (name === 'ellipse') {
    requireCoordinates(tag, ['cx', 'cy', 'rx', 'ry'], findings);
    requirePositive(tag, ['rx', 'ry'], findings);
  } else if (name === 'polygon' || name === 'polyline') {
    const points = strictNumbers(attributes.get('points') ?? '', `${name}@${index} points`, findings);
    if (points.length % 2 !== 0) findings.push(`${name}@${index} points must contain coordinate pairs.`);
    if (points.length < 6) findings.push(`${name}@${index} must contain at least three coordinate pairs.`);
    if (name === 'polyline' && points.length >= 6 && points.length % 2 === 0) {
      for (let offset = 2; offset < points.length; offset += 2) {
        const [x1, y1, x2, y2] = [points[offset - 2], points[offset - 1], points[offset], points[offset + 1]];
        if (!nearlyEqual(x1, x2) && !nearlyEqual(y1, y2)) {
          findings.push(`polyline@${index} is not orthogonal between (${x1},${y1}) and (${x2},${y2}).`);
        }
      }
    }
  }
}

function hasIdentifiedContainer(tag) {
  let parent = tag.parent;
  while (parent) {
    if ((parent.name === 'g' || parent.name === 'marker') && parent.attributes.get('id')) return true;
    parent = parent.parent;
  }
  return false;
}

function requireCoordinates(tag, names, findings) {
  for (const name of names) {
    const value = tag.attributes.get(name);
    if (!isSvgNumber(value)) findings.push(`${tag.name}@${tag.index} must declare numeric ${name}.`);
  }
}

function requirePositive(tag, names, findings) {
  for (const name of names) {
    const value = tag.attributes.get(name);
    if (isSvgNumber(value) && Number(value) <= 0) findings.push(`${tag.name}@${tag.index} ${name} must be positive.`);
  }
}

function validateFontSize(tag, required, findings) {
  const rawSize = tag.attributes.get('font-size') ?? styleValue(tag.attributes.get('style'), 'font-size');
  if (!rawSize) {
    if (required) findings.push(`${tag.name}@${tag.index} must declare an explicit font-size in px.`);
    return;
  }
  const match = rawSize.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:px)?$/iu);
  if (!match) {
    findings.push(`${tag.name}@${tag.index} font-size must be an explicit px value.`);
    return;
  }
  const size = Number(match[1]);
  if (size < 16) findings.push(`${tag.name}@${tag.index} font-size ${size}px is below 16px.`);
}

function strictNumbers(value, label, findings) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    findings.push(`${label} contains invalid SVG number syntax.`);
    return [];
  }
  const tokens = trimmed.split(/[\s,]+/u).filter(Boolean);
  if (!tokens.length || tokens.some((token) => !isSvgNumber(token))) {
    findings.push(`${label} contains invalid SVG number syntax.`);
    return [];
  }
  return tokens.map(Number);
}

function isSvgNumber(value) {
  return typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value.trim());
}

function styleValue(style, name) {
  if (!style) return null;
  const match = style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'iu'));
  return match?.[1]?.trim() ?? null;
}

function hasNonEmptyElement(source, name) {
  const match = source.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'u'));
  return Boolean(match?.[1]?.replace(/<[^>]+>/gu, '').trim());
}

function nearlyEqual(left, right) {
  return Math.abs(left - right) < 0.001;
}
