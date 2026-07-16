function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');
}

function cleanBashOutput(text) {
  let cleaned = stripAnsi(text);
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
  cleaned = cleaned.replace(/\n[$#%>]\s*$/, '');
  return cleaned.trim();
}

function formatReadResult(text, input) {
  if (!text.trim()) {
    const path = isRecord(input) ? input.path ?? 'unknown' : 'unknown';
    return `[File "${path}" is empty]`;
  }
  return text;
}

function formatSearchResult(text) {
  if (!text.trim()) return '[No matches found]';
  const matchLines = text.split('\n').filter((line) => line.startsWith('*')).length;
  const header = matchLines > 0 ? `[Search: ${matchLines} match(es)]` : '';
  if (header && !text.startsWith('[')) return `${header}\n${text}`;
  return text;
}

function formatBashResult(text, isError) {
  if (isError) {
    const cleaned = cleanBashOutput(text);
    return cleaned || '[Command failed with no output]';
  }

  const cleaned = cleanBashOutput(text);
  if (!cleaned) return '[Command produced no output]';

  const lines = cleaned.split('\n');
  if (lines.length > 50) {
    return `[Output: ${lines.length} lines]\n${cleaned}`;
  }
  return cleaned;
}

function formatEditResult(text, isError) {
  if (isError) {
    const msg = text.trim() || 'no details';
    return `[Edit failed] ${msg}`;
  }
  if (!text.trim()) return '[Edit applied successfully]';
  return text;
}

function formatFindResult(text) {
  if (!text.trim()) return '[No files found]';
  const files = text.split('\n').filter(Boolean);
  const header = `[Found ${files.length} file(s)]`;
  if (files.length > 20) {
    return `${header}\n${files.slice(0, 20).join('\n')}\n... and ${files.length - 20} more`;
  }
  return `${header}\n${text}`;
}

function formatWriteResult(text, input) {
  if (!text.trim()) {
    const path = isRecord(input) ? input.path ?? 'unknown' : 'unknown';
    return `[File written: ${path}]`;
  }
  return text;
}

function formatBrowserResult(text) {
  const cleaned = text.trim();
  if (!cleaned) return '[Browser returned no content]';
  return cleaned;
}

function formatError(text, toolName) {
  const msg = text.trim() || 'no error message';
  return `[${toolName} error] ${msg}`;
}

function ensureNonEmpty(text, toolName, isError) {
  if (text.trim()) return text;
  if (isError) return `[${toolName} failed with no error details]`;
  return `[${toolName} completed with no output]`;
}

function readToolName(event) {
  if (typeof event.toolName === 'string') return event.toolName;
  if (typeof event.name === 'string') return event.name;
  return 'tool';
}

function preserveOutcomeMetadata(event, result) {
  const preserved = { ...result };
  if (!Object.hasOwn(preserved, 'details') && Object.hasOwn(event, 'details')) {
    preserved.details = event.details;
  }
  for (const key of ['isError', 'error', 'ok', 'passed', 'status']) {
    if (!Object.hasOwn(preserved, key) && Object.hasOwn(event, key)) preserved[key] = event[key];
  }
  return preserved;
}

export function formatToolResultEvent(rawEvent = {}) {
  const event = isRecord(rawEvent) ? rawEvent : {};
  if (!Array.isArray(event.content)) return undefined;

  const toolName = readToolName(event);
  const input = event.input;
  let changed = false;
  let foundText = false;
  let formattedFirstText = false;

  const content = event.content.map((block) => {
    if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') {
      return block;
    }

    foundText = true;
    let text = block.text;

    if (!formattedFirstText) {
      formattedFirstText = true;
      if (event.isError) {
        text = formatError(text, toolName);
      } else {
        switch (toolName) {
          case 'read':
            text = formatReadResult(text, input);
            break;
          case 'search':
            text = formatSearchResult(text);
            break;
          case 'bash':
            text = formatBashResult(text, false);
            break;
          case 'edit':
          case 'ast_edit':
            text = formatEditResult(text, false);
            break;
          case 'find':
            text = formatFindResult(text);
            break;
          case 'write':
            text = formatWriteResult(text, input);
            break;
          case 'browser':
            text = formatBrowserResult(text);
            break;
        }
        text = ensureNonEmpty(text, toolName, false);
      }
    } else if (toolName === 'bash') {
      text = stripAnsi(text);
    }

    if (text === block.text) return block;
    changed = true;
    return { ...block, text };
  });

  // Do not synthesize text for image/resource/future block-only results.
  // Returning undefined leaves the host-owned result object completely intact.
  if (!foundText || !changed) return undefined;
  return preserveOutcomeMetadata(event, { content });
}
