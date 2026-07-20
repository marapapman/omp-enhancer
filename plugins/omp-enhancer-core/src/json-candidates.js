export function jsonEvidenceCandidates(output = '') {
  const text = String(output);
  const candidates = new Set();
  const trimmed = text.trim();
  if (/^[\[{]/.test(trimmed)) candidates.add(trimmed);

  const fencePattern = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  for (const match of text.matchAll(fencePattern)) {
    const candidate = match[1]?.trim();
    if (candidate) candidates.add(candidate);
  }

  for (const candidate of balancedJsonFragments(text)) {
    candidates.add(candidate);
  }

  return [...candidates].filter((candidate) => candidate.length <= 100000);
}

function balancedJsonFragments(text) {
  const fragments = [];
  for (let index = 0; index < text.length && fragments.length < 20; index += 1) {
    if (!isLikelyJsonStart(text, index)) continue;
    const end = findJsonFragmentEnd(text, index);
    if (end > index) fragments.push(text.slice(index, end));
  }
  return fragments;
}

function isLikelyJsonStart(text, index) {
  const char = text[index];
  if (char !== '{' && char !== '[') return false;
  const next = nextNonWhitespace(text, index + 1);
  if (char === '{') return next === '"' || next === '}';
  return next === '"' || next === '{' || next === '[' || next === ']';
}

function nextNonWhitespace(text, start) {
  for (let index = start; index < text.length; index += 1) {
    if (!/\s/.test(text[index])) return text[index];
  }
  return '';
}

function findJsonFragmentEnd(text, start) {
  const stack = [text[start] === '{' ? '}' : ']'];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      stack.push('}');
      continue;
    }
    if (char === '[') {
      stack.push(']');
      continue;
    }
    if (char !== '}' && char !== ']') continue;
    if (stack.at(-1) !== char) return -1;
    stack.pop();
    if (!stack.length) return index + 1;
  }

  return -1;
}
