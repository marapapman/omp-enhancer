import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeExternalActionPrompt,
  analyzeExternalActionContracts,
  externalActionMatchesTool,
  normalizeExternalActionContract,
} from '../src/external-action-policy.js';

test('supported reversible connector prompts compile complete provider/action/target contracts', () => {
  const cases = [
    ['Send an email to alice@example.com.', 'email', 'send', 'recipient', 'alice@example.com'],
    ['Post a Slack message to channel #ops.', 'slack', 'post-message', 'channel', 'ops'],
    ['在 Slack 频道 #omp-e2e 发送消息 hello；不要发布。', 'slack', 'post-message', 'channel', 'omp-e2e'],
    ['Create a Jira issue in project CORE.', 'jira', 'create-issue', 'project', 'CORE'],
    ['Upload report.pdf to Google Drive folder reports.', 'google-drive', 'upload-file', 'folder', 'reports'],
    ['Schedule an event on team@example.com calendar.', 'calendar', 'create-event', 'calendar', 'team@example.com'],
    ['Update Notion page roadmap.', 'notion', 'update-page', 'page', 'roadmap'],
  ];
  for (const [prompt, provider, action, kind, value] of cases) {
    assert.deepEqual(analyzeExternalActionPrompt(prompt), {
      version: 1,
      state: 'complete',
      provider,
      action,
      target: { kind, value },
      reasons: [],
    }, prompt);
  }
});

test('incomplete, conflicting, unsupported, negated, and double-negative prompts stay distinct', () => {
  assert.equal(analyzeExternalActionPrompt('Send an email.').state, 'incomplete');
  assert.equal(analyzeExternalActionPrompt('Send email to alice@example.com and bob@example.com.').state, 'conflicting');
  assert.equal(analyzeExternalActionPrompt('Send email to alice@example.com and post Slack message to #ops.').state, 'conflicting');
  assert.equal(analyzeExternalActionPrompt('Delete Notion page roadmap.').state, 'unsupported');
  assert.equal(analyzeExternalActionPrompt('Do not send email to alice@example.com.').state, 'unsupported');
  assert.equal(analyzeExternalActionPrompt('Do not skip sending an email to alice@example.com.').state, 'complete');
  assert.equal(analyzeExternalActionPrompt("Don't hesitate to send an email to alice@example.com.").state, 'complete');
  assert.equal(analyzeExternalActionPrompt('Just explain this local function.'), null);

  const crossProvider = analyzeExternalActionPrompt('Send email to alice@example.com, but do not post to Slack channel #ops.');
  assert.equal(crossProvider.state, 'complete');
  assert.equal(crossProvider.provider, 'email');
  assert.equal(crossProvider.target.value, 'alice@example.com');

  for (const prompt of [
    'Explain how to send email to alice@example.com.',
    'Tell me how to upload a file to Google Drive folder F1.',
    'Show me a template for sending email to alice@example.com.',
    'Dry-run sending email to alice@example.com.',
    'Prepare to send email to alice@example.com without actually sending it.',
  ]) assert.equal(analyzeExternalActionPrompt(prompt)?.state, 'unsupported', prompt);

  const replacement = analyzeExternalActionPrompt(
    'Do not send to old@example.com; send email to new@example.com.',
  );
  assert.equal(replacement.state, 'complete');
  assert.equal(replacement.target.value, 'new@example.com');

  const naturalReplacement = analyzeExternalActionPrompt(
    'Do not send an email to bob@example.com. Send an email to alice@example.com.',
  );
  assert.equal(naturalReplacement.state, 'complete');
  assert.equal(naturalReplacement.target.value, 'alice@example.com');
});

test('Jira shorthand binds an uppercase project key only in the issue target role', () => {
  const contract = analyzeExternalActionPrompt('Create a Jira issue in PROJ.');
  assert.equal(contract.state, 'complete');
  assert.deepEqual(contract.target, { kind: 'project', value: 'PROJ' });
});

test('multiple complete connector actions expose split contracts and one unsupported-multi-action aggregate', () => {
  const prompt = 'Send email to alice@example.com and post Slack message to #ops.';
  const aggregate = analyzeExternalActionPrompt(prompt);
  assert.equal(aggregate.state, 'conflicting');
  assert.match(aggregate.reasons.join(' '), /unsupported-multi-action/);
  assert.deepEqual(
    analyzeExternalActionContracts(prompt).map(({ state, provider, action, target }) => ({ state, provider, action, target })),
    [
      { state: 'complete', provider: 'email', action: 'send', target: { kind: 'recipient', value: 'alice@example.com' } },
      { state: 'complete', provider: 'slack', action: 'post-message', target: { kind: 'channel', value: 'ops' } },
    ],
  );
});

test('implementation meta-work and non-calendar event code never mint external authority', () => {
  for (const prompt of [
    'Implement send email support in mailer.js.',
    'Fix sending email to alice@example.com in src/mailer.js.',
    'Add Google Drive upload support to drive.ts.',
    'Implement update Notion page logic in notion.ts.',
    'Fix upload to Google Drive folder F1 in drive.ts.',
    'Implement create Jira issue support in jira.ts.',
    'Create an event handler in src/app.js.',
    'Add an event listener in app.js.',
    'Implement an event loop task in runtime.ts.',
    'Create a domain event fixture for local tests.',
  ]) {
    assert.equal(analyzeExternalActionPrompt(prompt), null, prompt);
    assert.deepEqual(analyzeExternalActionContracts(prompt), [], prompt);
  }

  const compound = analyzeExternalActionPrompt('Fix mailer.js, then send email to alice@example.com.');
  assert.equal(compound.state, 'complete');
  assert.equal(compound.provider, 'email');
});

test('prompt target extraction is role-aware instead of treating body mentions as authority', () => {
  const email = analyzeExternalActionPrompt(
    'Send email to alice@example.com with body "Please contact bob@example.com later".',
  );
  assert.equal(email.state, 'complete');
  assert.equal(email.target.value, 'alice@example.com');

  const slack = analyzeExternalActionPrompt(
    'Post a Slack message to channel #C1 with text "The incident also mentions #C2".',
  );
  assert.equal(slack.state, 'complete');
  assert.equal(slack.target.value, 'c1');
});

test('externalActionMatchesTool requires exact provider, action, and role-bearing input target', () => {
  const calls = [
    [
      analyzeExternalActionPrompt('Send email to alice@example.com.'),
      'gmail.send_email',
      { to: 'alice@example.com', body: 'Mention bob@example.com' },
      { to: 'bob@example.com', body: 'Mention alice@example.com' },
    ],
    [
      analyzeExternalActionPrompt('Post a Slack message to #C1.'),
      'slack.post_message',
      { channel: 'C1', text: 'Mention C2' },
      { channel: 'C2', text: 'Mention C1' },
    ],
    [analyzeExternalActionPrompt('Create a Jira issue in project CORE.'), 'jira.create_issue', { projectKey: 'CORE' }, { projectKey: 'OTHER' }],
    [analyzeExternalActionPrompt('Upload report.pdf to Google Drive folder reports.'), 'google_drive.upload_file', { folderId: 'reports' }, { folderId: 'archive' }],
    [analyzeExternalActionPrompt('Schedule an event on team@example.com calendar.'), 'google_calendar.create_event', { calendarId: 'team@example.com' }, { calendarId: 'primary' }],
    [analyzeExternalActionPrompt('Update Notion page roadmap.'), 'notion.update_page', { page_id: 'roadmap' }, { page_id: 'other' }],
  ];

  for (const [contract, toolName, goodInput, wrongInput] of calls) {
    assert.equal(externalActionMatchesTool(contract, { toolName, input: goodInput }), true, toolName);
    assert.equal(externalActionMatchesTool(contract, toolName, JSON.stringify(goodInput)), true, `${toolName} JSON`);
    assert.equal(externalActionMatchesTool(contract, { toolName, input: wrongInput }), false, `${toolName} wrong target`);
  }

  const email = analyzeExternalActionPrompt('Send email to alice@example.com.');
  assert.equal(externalActionMatchesTool(email, { toolName: 'slack.post_message', input: { channel: 'alice@example.com' } }), false);
  assert.equal(externalActionMatchesTool(email, { toolName: 'gmail.create_draft', input: { to: 'alice@example.com' } }), false);
  assert.equal(externalActionMatchesTool(analyzeExternalActionPrompt('Send an email.'), {
    toolName: 'gmail.send_email', input: { to: 'alice@example.com' },
  }), false);
});

test('normalization filters malformed contracts and preserves complete contracts across JSON', () => {
  const contract = analyzeExternalActionPrompt('Post a Slack message to #ops.');
  assert.deepEqual(normalizeExternalActionContract(JSON.parse(JSON.stringify(contract))), contract);
  assert.equal(normalizeExternalActionContract({ state: 'complete', provider: 'slack', action: 'post-message' }), null);
  assert.equal(normalizeExternalActionContract({ state: 'complete', provider: 'unknown', action: 'post-message', target: {} }), null);
});

test('generic Slack and Notion envelopes require exact operation, method, path, and target', () => {
  const slack = analyzeExternalActionPrompt('Post a Slack message to #C1.');
  assert.equal(externalActionMatchesTool(slack, {
    toolName: 'mcp__slack__api_call',
    input: { operation: 'chat.postMessage', channel: 'C1', text: 'Mention C2' },
  }), true);
  for (const input of [
    { operation: 'chat.update', channel: 'C1' },
    { operation: 'chat.postMessage', channel: 'C2', text: 'Mention C1' },
    { operation: 'conversations.history', channel: 'C1' },
  ]) assert.equal(externalActionMatchesTool(slack, { toolName: 'mcp__slack__api_call', input }), false);

  const notion = analyzeExternalActionPrompt('Update Notion page roadmap.');
  assert.equal(externalActionMatchesTool(notion, {
    toolName: 'mcp__notion__request',
    input: { method: 'PATCH', path: '/v1/pages/roadmap', body: { title: 'Roadmap' } },
  }), true);
  for (const input of [
    { method: 'GET', path: '/v1/pages/roadmap' },
    { method: 'POST', path: '/v1/pages/roadmap' },
    { method: 'PATCH', path: '/v1/pages/other', body: { text: 'roadmap' } },
    { method: 'PATCH', path: '/v1/databases/roadmap' },
  ]) assert.equal(externalActionMatchesTool(notion, { toolName: 'mcp__notion__request', input }), false);
});
