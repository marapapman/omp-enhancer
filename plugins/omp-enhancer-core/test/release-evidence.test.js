import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeReleasePromptContract,
  createReleaseMutationRecord,
  releaseMutationMatchesPrompt,
  supportsReleaseMutation,
  verifyReleaseMutation,
} from '../src/release-evidence.js';

const SHA_A = '0123456789abcdef0123456789abcdef01234567';
const SHA_B = '89abcdef0123456789abcdef0123456789abcdef';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const MANIFEST_DIGEST = 'b'.repeat(64);

function event(command, resultText, overrides = {}) {
  return {
    toolName: 'bash',
    command,
    resultText,
    successful: true,
    masked: false,
    dryRun: false,
    cwd: '/workspace/project',
    ...overrides,
  };
}

function npmManifest(name, version, overrides = {}) {
  return {
    source: 'host-package-json',
    cwd: '/workspace/project',
    name,
    version,
    digest: MANIFEST_DIGEST,
    ...overrides,
  };
}

test('git push binds remote, target ref, and pushed revision', () => {
  const record = createReleaseMutationRecord(event(
    `git push https://github.com/org/repo.git ${SHA_B}:refs/heads/main`,
    `To github.com:org/repo.git\n   ${SHA_A.slice(0, 12)}..${SHA_B.slice(0, 12)}  main -> main`,
  ));

  assert.equal(record?.kind, 'git-push');
  assert.equal(record?.expectation.revision, SHA_B);
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/heads/main',
    `${SHA_B}\trefs/heads/main`,
  )), true);
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/another/repo.git refs/heads/main',
    `${SHA_B}\trefs/heads/main`,
  )), false);
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/heads/release',
    `${SHA_B}\trefs/heads/release`,
  )), false);
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/heads/main',
    `${SHA_A}\trefs/heads/main`,
  )), false);
  assert.equal(verifyReleaseMutation(record, event(
    "git ls-remote https://github.com/org/repo.git refs/heads/main; printf 'forged'",
    `${SHA_B}\trefs/heads/main`,
  )), false);
});

test('trusted namespaced shell envelopes support a mutation and verifier roundtrip', () => {
  const record = createReleaseMutationRecord(event(
    `git push https://github.com/org/repo.git ${SHA_B}:refs/heads/main`,
    `To github.com:org/repo.git\n   ${SHA_A.slice(0, 12)}..${SHA_B.slice(0, 12)}  main -> main`,
    { toolName: 'functions.exec_command' },
  ));
  assert.ok(record);
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/heads/main',
    `${SHA_B}\trefs/heads/main`,
    { toolName: 'functions.exec_command' },
  )), true);
  assert.equal(createReleaseMutationRecord(event(
    `git push https://github.com/org/repo.git ${SHA_B}:refs/heads/main`,
    `To github.com:org/repo.git\n   ${SHA_A.slice(0, 12)}..${SHA_B.slice(0, 12)}  main -> main`,
    { toolName: 'untrusted.exec_command' },
  )), null);
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/heads/main',
    `${SHA_B}\trefs/heads/main`,
    { toolName: 'untrusted.exec_command' },
  )), false);
});

test('git evidence rejects no-op, forged, masked, dry-run, and failed pushes', () => {
  const positive = `To github.com:org/repo.git\n ${SHA_A.slice(0, 12)}..${SHA_B.slice(0, 12)} main -> main`;
  for (const input of [
    event('git push origin main', 'Everything up-to-date'),
    event("echo 'git push origin main'", positive),
    event("git push origin main; printf 'success'", positive),
    event('git push origin "main$(printf forged)"', positive),
    event('git push origin main || true', positive, { masked: true }),
    event('git push --dry-run origin main', positive, { dryRun: true }),
    event('git push origin main', 'fatal: failed to push some refs'),
    event('git push origin main', positive, { successful: false }),
  ]) assert.equal(createReleaseMutationRecord(input), null, input.command);
});

test('a successful new-branch push is independently verifiable without repeating the mutation', () => {
  const record = createReleaseMutationRecord(event(
    `git push https://github.com/org/repo.git ${SHA_B}:refs/heads/new-release`,
    'To https://github.com/org/repo.git\n * [new branch] main -> new-release',
  ));
  assert.equal(record?.expectation.outcome, 'new-branch');
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/heads/new-release',
    `${SHA_B}\trefs/heads/new-release`,
  )), true);
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/heads/new-release',
    `${SHA_A}\trefs/heads/new-release`,
  )), false);
});

test('an idempotent full-SHA push records desired state for independent verification', () => {
  const record = createReleaseMutationRecord(event(
    `git push https://github.com/org/repo.git ${SHA_B}:refs/heads/main`,
    'Everything up-to-date',
  ));
  assert.equal(record?.expectation.outcome, 'desired-state-pending-verification');
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/heads/main',
    `${SHA_B}\trefs/heads/main`,
  )), true);
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/heads/main',
    `${SHA_A}\trefs/heads/main`,
  )), false);
});

test('git tag push binds the direct tag object SHA and ignores an unrelated peeled SHA', () => {
  const record = createReleaseMutationRecord(event(
    `git push https://github.com/org/repo.git ${SHA_B}:refs/tags/v2.0.0`,
    'To https://github.com/org/repo.git\n * [new tag] 89abcdef0123456789abcdef0123456789abcdef -> v2.0.0',
  ));
  assert.equal(record?.expectation.refType, 'tag');
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/tags/v2.0.0',
    `${SHA_B}\trefs/tags/v2.0.0\n${SHA_A}\trefs/tags/v2.0.0^{}`,
  )), true);
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/tags/v2.0.0',
    `${SHA_A}\trefs/tags/v2.0.0\n${SHA_B}\trefs/tags/v2.0.0^{}`,
  )), false);
});

test('verification is bound to the same working directory', () => {
  const record = createReleaseMutationRecord(event(
    `git push https://github.com/org/repo.git ${SHA_B}:refs/heads/main`,
    `To github.com:org/repo.git\n ${SHA_A.slice(0, 12)}..${SHA_B.slice(0, 12)} main -> main`,
  ));
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote https://github.com/org/repo.git refs/heads/main',
    `${SHA_B}\trefs/heads/main`,
    { cwd: '/workspace/another-project' },
  )), false);
});

test('npm publish binds the exact package and version from npm success output', () => {
  const record = createReleaseMutationRecord(event(
    'npm publish --ignore-scripts --access public --registry https://registry.npmjs.org --tag next',
    'npm notice Publishing to https://registry.npmjs.org/ with tag next and public access\n+ @scope/pkg@1.2.3-beta.1',
    { npmManifest: npmManifest('@scope/pkg', '1.2.3-beta.1') },
  ));

  assert.equal(record?.kind, 'npm-publish');
  assert.deepEqual(record?.expectation, {
    version: '1.2.3-beta.1',
    tag: 'next',
    manifestDigest: MANIFEST_DIGEST,
  });
  assert.equal(verifyReleaseMutation(record, event(
    'npm view @scope/pkg dist-tags --json --registry https://registry.npmjs.org',
    '{"latest":"1.2.2","next":"1.2.3-beta.1"}',
  )), true);
  assert.equal(verifyReleaseMutation(record, event(
    'npm view @scope/other dist-tags --json --registry https://registry.npmjs.org',
    '{"next":"1.2.3-beta.1"}',
  )), false);
  assert.equal(verifyReleaseMutation(record, event(
    'npm view @scope/pkg dist-tags --json --registry https://registry.npmjs.org',
    '{"next":"1.2.4"}',
  )), false);
  assert.equal(verifyReleaseMutation(record, event(
    'npm view @scope/pkg dist-tags --json --registry https://registry.example.com',
    '{"next":"1.2.3-beta.1"}',
  )), false);
});

test('npm verifier must prove the bound dist-tag and cannot rely on version-only output', () => {
  const record = createReleaseMutationRecord(event(
    'npm publish . --ignore-scripts --registry https://registry.npmjs.org --tag latest',
    'npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access\n+ pkg@4.5.6',
    { npmManifest: npmManifest('pkg', '4.5.6') },
  ));
  assert.ok(record);
  assert.equal(verifyReleaseMutation(record, event(
    'npm view pkg version --registry https://registry.npmjs.org',
    '4.5.6',
  )), false);
  assert.equal(verifyReleaseMutation(record, event(
    'npm view pkg dist-tags --json --registry https://registry.npmjs.org',
    '{"latest":"4.5.5","next":"4.5.6"}',
  )), false);
  assert.equal(verifyReleaseMutation(record, event('echo 4.5.6', '4.5.6')), false);
  assert.equal(createReleaseMutationRecord(event('npm publish --ignore-scripts --dry-run', '+ pkg@4.5.6')), null);
  assert.equal(createReleaseMutationRecord(event('npm publish', 'npm ERR! publish failed')), null);
});

test('npm preflight requires trusted manifest metadata for the trusted cwd', () => {
  const command = 'npm publish --ignore-scripts --registry https://registry.npmjs.org --tag latest';
  assert.equal(supportsReleaseMutation(event(command, 'unused', {
    npmManifest: npmManifest('pkg', '4.5.6'),
  })), true);
  for (const npmManifestValue of [
    undefined,
    npmManifest('pkg', '4.5.6', { source: 'model-claimed' }),
    npmManifest('pkg', '4.5.6', { cwd: '/workspace/other' }),
    npmManifest('pkg', '4.5.6', { digest: 'not-a-digest' }),
    npmManifest('pkg', 'not-semver'),
  ]) assert.equal(supportsReleaseMutation(event(command, 'unused', {
    npmManifest: npmManifestValue,
  })), false, JSON.stringify(npmManifestValue));

  for (const unsupported of [
    'npm publish ./packages/pkg --ignore-scripts --registry https://registry.npmjs.org --tag latest',
    'npm publish artifact.tgz --ignore-scripts --registry https://registry.npmjs.org --tag latest',
    'npm publish --workspace pkg --ignore-scripts --registry https://registry.npmjs.org --tag latest',
  ]) assert.equal(supportsReleaseMutation(event(unsupported, 'unused', {
    npmManifest: npmManifest('pkg', '4.5.6'),
  })), false, unsupported);
});

test('npm preflight closes the prepublish lifecycle TOCTOU with an explicit ignore-scripts contract', () => {
  const overrides = { npmManifest: npmManifest('pkg', '4.5.6') };
  assert.equal(supportsReleaseMutation(event(
    'npm publish . --ignore-scripts --registry https://registry.npmjs.org --tag latest',
    'unused',
    overrides,
  )), true);
  assert.equal(supportsReleaseMutation(event(
    'npm publish . --registry https://registry.npmjs.org --tag latest',
    'unused',
    overrides,
  )), false);
  assert.equal(supportsReleaseMutation(event(
    'npm publish . --ignore-scripts=false --registry https://registry.npmjs.org --tag latest',
    'unused',
    overrides,
  )), false);
});

test('npm publish without --tag binds the observed default latest tag', () => {
  const input = event(
    'npm publish --ignore-scripts --registry https://registry.npmjs.org',
    'npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access\n+ pkg@4.5.6',
    { npmManifest: npmManifest('pkg', '4.5.6') },
  );
  assert.equal(supportsReleaseMutation(input), true);
  const record = createReleaseMutationRecord(input);
  assert.equal(record?.expectation.tag, 'latest');
  assert.equal(verifyReleaseMutation(record, event(
    'npm view pkg dist-tags --json --registry https://registry.npmjs.org',
    '{"latest":"4.5.6"}',
  )), true);
});

test('plugin upgrade follows actual OMP CLI output and verifies actual plugin-list JSON', () => {
  const record = createReleaseMutationRecord(event(
    'omp plugin upgrade omp-enhancer-core@omp-enhancer --scope project',
    'Upgraded omp-enhancer-core@omp-enhancer (project) to 0.1.75',
  ));

  assert.equal(record?.kind, 'omp-plugin-upgrade');
  assert.deepEqual(record?.expectation, { version: '0.1.75', scope: 'project' });
  assert.equal(verifyReleaseMutation(record, event(
    'omp plugin list --json',
    JSON.stringify({
      npm: [],
      marketplace: [{
        id: 'omp-enhancer-core@omp-enhancer',
        scope: 'project',
        entries: [{ scope: 'project', version: '0.1.75' }],
      }],
    }),
  )), true);
  assert.equal(verifyReleaseMutation(record, event(
    'omp plugin list --json',
    JSON.stringify({ marketplace: [{
      id: 'writing-helper@omp-enhancer',
      scope: 'project',
      entries: [{ scope: 'project', version: '0.1.75' }],
    }] }),
  )), false);
  assert.equal(verifyReleaseMutation(record, event(
    'omp plugin list --json',
    JSON.stringify({ marketplace: [{
      id: 'omp-enhancer-core@omp-enhancer',
      scope: 'project',
      entries: [{ scope: 'project', version: '0.1.74' }],
    }] }),
  )), false);
});

test('plugin upgrade also verifies the actual human-readable plugin list row', () => {
  const record = createReleaseMutationRecord(event(
    'omp plugin upgrade omp-enhancer-core@omp-enhancer --scope user',
    'Upgraded omp-enhancer-core@omp-enhancer (user) to 0.1.75',
  ));
  assert.equal(verifyReleaseMutation(record, event(
    'omp plugin list',
    'Marketplace Plugins:\n\n  omp-enhancer-core@omp-enhancer (0.1.75) (user)',
  )), true);
  assert.equal(verifyReleaseMutation(record, event(
    'omp plugin status omp-enhancer-core@omp-enhancer',
    'omp-enhancer-core@omp-enhancer 0.1.75 enabled',
  )), false);
});

test('docker push binds an explicit image tag and registry digest', () => {
  const record = createReleaseMutationRecord(event(
    'docker push registry.example.com/org/app:1.4.0',
    `1.4.0: digest: ${DIGEST} size: 1573`,
  ));

  assert.equal(record?.kind, 'docker-push');
  assert.deepEqual(record?.expectation, { digest: DIGEST });
  assert.equal(verifyReleaseMutation(record, event(
    'docker manifest inspect registry.example.com/org/app:1.4.0',
    `{\"Descriptor\":{\"digest\":\"${DIGEST}\"}}`,
  )), true);
  assert.equal(verifyReleaseMutation(record, event(
    'docker manifest inspect registry.example.com/org/app:latest',
    `{\"Descriptor\":{\"digest\":\"${DIGEST}\"}}`,
  )), false);
  assert.equal(verifyReleaseMutation(record, event(
    'docker manifest inspect registry.example.com/org/app:1.4.0',
    `Digest: sha256:${'b'.repeat(64)}`,
  )), false);
});

test('gh release binds repository and tag and verifies the same published release', () => {
  const record = createReleaseMutationRecord(event(
    'gh release create v2.0.0 --repo github.com/org/project --generate-notes',
    'https://github.com/org/project/releases/tag/v2.0.0',
  ));

  assert.equal(record?.kind, 'gh-release');
  assert.deepEqual(record?.expectation, { status: 'published', prerelease: false });
  assert.equal(verifyReleaseMutation(record, event(
    'gh release view v2.0.0 --repo github.com/org/project --json tagName,url,isDraft,isPrerelease',
    '{"tagName":"v2.0.0","url":"https://github.com/org/project/releases/tag/v2.0.0","isDraft":false,"isPrerelease":false}',
  )), true);
  assert.equal(verifyReleaseMutation(record, event(
    'gh release view v2.0.0 --repo github.com/another/project --json tagName,url,isDraft,isPrerelease',
    '{"tagName":"v2.0.0","url":"https://github.com/another/project/releases/tag/v2.0.0","isDraft":false,"isPrerelease":false}',
  )), false);
});

test('gh release rejects drafts and binds prerelease intent', () => {
  for (const command of [
    'gh release create v2.0.0 --repo github.com/org/project --draft',
    'gh release create v2.0.0 --repo github.com/org/project -d',
    'gh release create v2.0.0 --repo github.com/org/project --draft=true',
  ]) {
    assert.equal(supportsReleaseMutation(event(command, 'unused')), false, command);
    assert.equal(createReleaseMutationRecord(event(command, 'https://github.com/org/project/releases/tag/v2.0.0')), null, command);
  }

  const record = createReleaseMutationRecord(event(
    'gh release create v2.0.0-rc.1 --repo github.com/org/project --prerelease',
    'https://github.com/org/project/releases/tag/v2.0.0-rc.1',
  ));
  assert.deepEqual(record?.expectation, { status: 'published', prerelease: true });
  const command = 'gh release view v2.0.0-rc.1 --repo github.com/org/project --json tagName,url,isDraft,isPrerelease';
  assert.equal(verifyReleaseMutation(record, event(command,
    '{"tagName":"v2.0.0-rc.1","url":"https://github.com/org/project/releases/tag/v2.0.0-rc.1","isDraft":false,"isPrerelease":true}',
  )), true);
  for (const output of [
    '{"tagName":"v2.0.0-rc.1","url":"https://github.com/org/project/releases/tag/v2.0.0-rc.1","isDraft":true,"isPrerelease":true}',
    '{"tagName":"v2.0.0-rc.1","url":"https://github.com/org/project/releases/tag/v2.0.0-rc.1","isDraft":false,"isPrerelease":false}',
    '{"tagName":"v2.0.0-rc.1","url":"https://github.com/org/project/releases/tag/v2.0.0-rc.1"}',
  ]) assert.equal(verifyReleaseMutation(record, event(command, output)), false, output);
});

test('gh release parses a positional tag after options and rejects unbound asset arguments', () => {
  const record = createReleaseMutationRecord(event(
    'gh release create --prerelease --repo github.com/org/project v3.0.0-rc.1 --title RC',
    'https://github.com/org/project/releases/tag/v3.0.0-rc.1',
  ));
  assert.equal(record?.kind, 'gh-release');
  assert.equal(record?.expectation.prerelease, true);

  for (const command of [
    'gh release create --repo github.com/org/project v3.0.0 artifact.tar.gz',
    'gh release create --repo github.com/org/project --prerelease',
  ]) assert.equal(supportsReleaseMutation(event(command, 'unused')), false, command);
});

test('gh prerelease boolean variants preserve preflight and record agreement', () => {
  for (const [flag, expected] of [
    ['--prerelease=true', true],
    ['--prerelease=false', false],
  ]) {
    const command = `gh release create v3.0.0 --repo github.com/org/project ${flag}`;
    assert.equal(supportsReleaseMutation(event(command, 'unused')), true, command);
    const record = createReleaseMutationRecord(event(
      command,
      'https://github.com/org/project/releases/tag/v3.0.0',
    ));
    assert.equal(record?.expectation.prerelease, expected, command);
  }
  assert.equal(supportsReleaseMutation(event(
    'gh release create v3.0.0 --repo github.com/org/project --prerelease=maybe',
    'unused',
  )), false);
});

test('gh release binds an explicit immutable target commitish', () => {
  const mutation = `gh release create v3.0.0 --repo github.com/org/project --target ${SHA_B}`;
  const record = createReleaseMutationRecord(event(
    mutation,
    'https://github.com/org/project/releases/tag/v3.0.0',
  ));
  assert.equal(record?.expectation.targetCommitish, SHA_B);
  const verifier = 'gh release view v3.0.0 --repo github.com/org/project --json tagName,url,isDraft,isPrerelease,targetCommitish';
  assert.equal(verifyReleaseMutation(record, event(verifier, JSON.stringify({
    tagName: 'v3.0.0',
    url: 'https://github.com/org/project/releases/tag/v3.0.0',
    isDraft: false,
    isPrerelease: false,
    targetCommitish: SHA_B,
  }))), true);
  assert.equal(verifyReleaseMutation(record, event(verifier, JSON.stringify({
    tagName: 'v3.0.0',
    url: 'https://github.com/org/project/releases/tag/v3.0.0',
    isDraft: false,
    isPrerelease: false,
    targetCommitish: SHA_A,
  }))), false);
  assert.equal(releaseMutationMatchesPrompt(
    event(mutation, 'unused'),
    `Create release v3.0.0 in github.com/org/project targeting ${SHA_B}.`,
  ), true);
  assert.equal(releaseMutationMatchesPrompt(
    event(mutation, 'unused'),
    `Create release v3.0.0 in github.com/org/project targeting ${SHA_A}.`,
  ), false);
  assert.equal(supportsReleaseMutation(event(
    'gh release create v3.0.0 --repo github.com/org/project --target main',
    'unused',
  )), false);
});

test('kubectl binds every container image and verifies converged deployment JSON', () => {
  const record = createReleaseMutationRecord(event(
    'kubectl set image deployment/web web=registry.example.com/web:2 sidecar=registry.example.com/sidecar:3 --namespace production --context prod-cluster',
    'deployment.apps/web image updated',
  ));

  assert.equal(record?.kind, 'kubectl-rollout');
  assert.equal(record?.expectation.containerImageFingerprints.length, 2);
  assert.equal(Object.isFrozen(record?.expectation.containerImageFingerprints), true);
  assert.equal(JSON.stringify(record).includes('registry.example.com/web:2'), false);
  assert.equal(JSON.stringify(record).includes('sidecar'), false);
  assert.equal(verifyReleaseMutation(record, event(
    'kubectl get deployment/web --namespace production --context prod-cluster -o=json',
    deploymentJson(),
  )), true);
  assert.equal(verifyReleaseMutation(record, event(
    'kubectl get deployment/web --namespace staging --context prod-cluster -o json',
    deploymentJson({ namespace: 'staging' }),
  )), false);
  assert.equal(verifyReleaseMutation(record, event(
    'kubectl get deployment/web --namespace production --context another-cluster -o json',
    deploymentJson(),
  )), false);
});

test('kubectl rejects wrong images, stale rollout status, and incomplete deployment JSON', () => {
  const record = createReleaseMutationRecord(event(
    'kubectl set image deployment/web web=registry.example.com/web:2 sidecar=registry.example.com/sidecar:3 --namespace production --context prod-cluster',
    'deployment.apps/web image updated',
  ));
  assert.ok(record);

  const cases = [
    ['rollout text is insufficient', 'kubectl rollout status deployment/web --namespace production --context prod-cluster', 'deployment "web" successfully rolled out'],
    ['wrong target image', null, deploymentJson({ webImage: 'registry.example.com/web:old' })],
    ['missing target container', null, deploymentJson({ containers: [{ name: 'web', image: 'registry.example.com/web:2' }] })],
    ['duplicate container name', null, deploymentJson({ containers: [
      { name: 'web', image: 'registry.example.com/web:2' },
      { name: 'web', image: 'registry.example.com/web:2' },
      { name: 'sidecar', image: 'registry.example.com/sidecar:3' },
    ] })],
    ['stale observed generation', null, deploymentJson({ generation: 8, observedGeneration: 7 })],
    ['not all replicas updated', null, deploymentJson({ replicas: 3, updatedReplicas: 2 })],
    ['not all replicas available', null, deploymentJson({ replicas: 3, availableReplicas: 2 })],
    ['missing observed generation', null, deploymentJson({ omitStatusField: 'observedGeneration' })],
    ['missing updated replicas', null, deploymentJson({ omitStatusField: 'updatedReplicas' })],
    ['missing available replicas', null, deploymentJson({ omitStatusField: 'availableReplicas' })],
    ['missing spec replicas', null, deploymentJson({ omitReplicas: true })],
    ['wrong deployment name', null, deploymentJson({ name: 'api' })],
    ['wrong resource kind', null, deploymentJson({ kind: 'Pod' })],
    ['malformed JSON with forged suffix', null, `${deploymentJson()}\n{"status":{"availableReplicas":999}}`],
  ];

  for (const [name, command, output] of cases) {
    assert.equal(verifyReleaseMutation(record, event(
      command ?? 'kubectl get deployment/web --namespace production --context prod-cluster -o json',
      output,
    )), false, name);
  }
});

test('kubectl preflight rejects wildcard and multi-resource mutations', () => {
  for (const command of [
    'kubectl set image deployment/web *=registry.example.com/web:2 --namespace production --context prod-cluster',
    'kubectl set image deployment/web deployment/api web=registry.example.com/web:2 --namespace production --context prod-cluster',
    'kubectl set image deployment/web,api web=registry.example.com/web:2 --namespace production --context prod-cluster',
    'kubectl set image deployments --all web=registry.example.com/web:2 --namespace production --context prod-cluster',
    'kubectl set image deployment/web web=registry.example.com/web:2 --selector=app=web --namespace production --context prod-cluster',
    'kubectl set image deployment/web web=registry.example.com/web:2 web=registry.example.com/web:3 --namespace production --context prod-cluster',
  ]) {
    assert.equal(supportsReleaseMutation(event(command, 'unused')), false, command);
    assert.equal(createReleaseMutationRecord(event(command, 'deployment.apps/web image updated')), null, command);
  }
});

test('helm upgrade binds release, namespace, revision, and deployed status', () => {
  const record = createReleaseMutationRecord(event(
    'helm upgrade --install web ./chart -n production --kube-context prod-cluster',
    'NAME: web\nLAST DEPLOYED: today\nNAMESPACE: production\nSTATUS: deployed\nREVISION: 7',
  ));

  assert.equal(record?.kind, 'helm-upgrade');
  assert.deepEqual(record?.expectation, { revision: '7', status: 'deployed' });
  assert.equal(verifyReleaseMutation(record, event(
    'helm status web -n production --kube-context prod-cluster',
    'NAME: web\nNAMESPACE: production\nSTATUS: deployed\nREVISION: 7',
  )), true);
  assert.equal(verifyReleaseMutation(record, event(
    'helm status web -n production --kube-context prod-cluster',
    'NAME: web\nNAMESPACE: production\nSTATUS: deployed\nREVISION: 8',
  )), false);
});

test('helm upgrade binds and independently verifies an explicit chart version', () => {
  const mutation = 'helm upgrade --install web ./chart --version 2.3.4 --namespace production --kube-context prod-cluster';
  const record = createReleaseMutationRecord(event(
    mutation,
    'NAME: web\nNAMESPACE: production\nSTATUS: deployed\nREVISION: 8',
  ));
  assert.equal(record?.expectation.chartVersion, '2.3.4');
  const verifier = 'helm status web --namespace production --kube-context prod-cluster --output json';
  assert.equal(verifyReleaseMutation(record, event(verifier, JSON.stringify({
    name: 'web', namespace: 'production', version: 8,
    info: { status: 'deployed' },
    chart: { metadata: { version: '2.3.4' } },
  }))), true);
  assert.equal(verifyReleaseMutation(record, event(verifier, JSON.stringify({
    name: 'web', namespace: 'production', version: 8,
    info: { status: 'deployed' },
    chart: { metadata: { version: '2.3.5' } },
  }))), false);
  assert.equal(releaseMutationMatchesPrompt(
    event(mutation, 'unused'),
    'Upgrade web from ./chart version 2.3.4 in production on prod-cluster.',
  ), true);
  assert.equal(releaseMutationMatchesPrompt(
    event(mutation, 'unused'),
    'Upgrade web from ./chart version 2.3.5 in production on prod-cluster.',
  ), false);
});

test('OMP plugin upgrades with an explicit requested version fail closed without a preflight catalog binding', () => {
  const command = 'omp plugin upgrade omp-enhancer-core@omp-enhancer --scope user';
  assert.equal(releaseMutationMatchesPrompt(
    event(command, 'unused'),
    'Upgrade omp-enhancer-core@omp-enhancer in user scope to version 0.1.75.',
  ), false);
});

test('records are privacy-conscious, immutable, and reject unrelated verifiers', () => {
  const record = createReleaseMutationRecord(event(
    'npm publish --ignore-scripts --registry https://registry.npmjs.org --tag latest',
    'npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access\n+ private-name@1.0.0',
    { npmManifest: npmManifest('private-name', '1.0.0') },
  ));
  const serialized = JSON.stringify(record);

  assert.equal(serialized.includes('private-name'), false);
  assert.equal(serialized.includes('npm publish'), false);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.expectation), true);
  assert.equal(verifyReleaseMutation(record, event(
    'git ls-remote origin refs/heads/main',
    `${SHA_B}\trefs/heads/main`,
  )), false);
});

test('preflight allows only release mutations with deterministic, explicit verification targets', () => {
  for (const command of [
    `git push https://github.com/org/repo.git ${SHA_B}:refs/heads/main`,
    `git push https://github.com/org/repo.git ${SHA_B}:refs/tags/v2.0.0`,
    'omp plugin upgrade omp-enhancer-core@omp-enhancer --scope user',
    'docker push registry.example.com/org/app:1.4.0',
    'gh release create v2.0.0 --repo github.com/org/project',
    'kubectl set image deployment/web web=registry.example.com/web:2 --namespace production --context prod-cluster',
    'helm upgrade --install web ./chart --namespace production --kube-context prod-cluster',
  ]) assert.equal(supportsReleaseMutation(event(command, 'unused')), true, command);
  assert.equal(supportsReleaseMutation(event(
    'npm publish --ignore-scripts --registry https://registry.npmjs.org --tag latest',
    'unused',
    { npmManifest: npmManifest('pkg', '4.5.6') },
  )), true);

  for (const command of [
    'git push origin main',
    `git push origin ${SHA_B}:refs/heads/main`,
    'git push https://github.com/org/repo.git main:refs/heads/main',
    'npm publish',
    'omp plugin upgrade omp-enhancer-core@omp-enhancer',
    'docker push org/app:1.4.0',
    'gh release create v2.0.0 --repo org/project',
    'kubectl apply -f multi-resource.yml --namespace production --context prod-cluster',
    'kubectl set image deployment/web web=image:2 --namespace production',
    'helm upgrade web ./chart --namespace production',
    'terraform apply',
  ]) assert.equal(supportsReleaseMutation(event(command, 'unused')), false, command);

  assert.equal(supportsReleaseMutation(event(
    'npm publish --ignore-scripts --registry https://registry.npmjs.org --tag latest',
    'unused',
    { cwd: '', npmManifest: npmManifest('pkg', '4.5.6') },
  )), false);
  assert.equal(supportsReleaseMutation(event(
    'npm publish --ignore-scripts --registry https://registry.npmjs.org --tag latest',
    'unused',
    { masked: true, npmManifest: npmManifest('pkg', '4.5.6') },
  )), false);
});

test('release authorization binds every concrete mutation target to one trusted prompt clause', () => {
  const authorized = [
    [
      `git push https://github.com/org/repo.git ${SHA_B}:refs/heads/main`,
      `Push commit ${SHA_B} to https://github.com/org/repo.git at refs/heads/main.`,
    ],
    [
      'npm publish --ignore-scripts --registry https://registry.npmjs.org --tag next',
      'Publish @scope/pkg@1.2.3 to https://registry.npmjs.org with tag next.',
      { npmManifest: npmManifest('@scope/pkg', '1.2.3') },
    ],
    [
      'omp plugin upgrade omp-enhancer-core@omp-enhancer --scope user',
      'Upgrade omp-enhancer-core@omp-enhancer in user scope.',
    ],
    [
      'docker push registry.example.com/org/app:1.4.0',
      'Push registry.example.com/org/app:1.4.0.',
    ],
    [
      'gh release create v2.0.0 --repo github.com/org/project --prerelease',
      'Create the prerelease v2.0.0 in github.com/org/project.',
    ],
    [
      'kubectl set image deployment/web web=registry.example.com/web:2 --namespace production --context prod-cluster',
      'Deploy deployment/web with web=registry.example.com/web:2 in production on prod-cluster.',
    ],
    [
      'helm upgrade --install web ./chart --namespace production --kube-context prod-cluster',
      'Upgrade web from ./chart in production on prod-cluster.',
    ],
  ];
  for (const [command, prompt, overrides] of authorized) {
    assert.equal(releaseMutationMatchesPrompt(event(command, 'unused', overrides), prompt), true, command);
  }

  const authorizedGit = `Push commit ${SHA_A} to https://github.com/org/authorized.git at refs/heads/main.`;
  assert.equal(releaseMutationMatchesPrompt(event(
    `git push https://github.com/attacker/wrong.git ${SHA_B}:refs/heads/prod`,
    'unused',
  ), authorizedGit), false);
  assert.equal(releaseMutationMatchesPrompt(event(
    `git push https://github.com/org/authorized.git ${SHA_A}:refs/heads/main`,
    'unused',
  ), 'Push the current release commit.'), false);
  assert.equal(releaseMutationMatchesPrompt(event(
    `git push https://github.com/org/authorized.git ${SHA_A}:refs/heads/main`,
    'unused',
  ), `Push the release.\nRepository: https://github.com/org/authorized.git\nCommit: ${SHA_A}\nRef: refs/heads/main`), true);
  assert.equal(releaseMutationMatchesPrompt(event(
    'npm publish --ignore-scripts --registry https://registry.npmjs.org --tag latest',
    'unused',
    { npmManifest: npmManifest('@scope/bar', '9.9.9') },
  ), 'Publish @scope/foo@1.2.3 to https://registry.npmjs.org with tag latest.'), false);
  assert.equal(releaseMutationMatchesPrompt(event(
    `git push https://github.com/org/authorized.git ${SHA_A}:refs/heads/main`,
    'unused',
  ), `Do not push ${SHA_A} to https://github.com/org/authorized.git at refs/heads/main.`), false);
});

test('release authorization uses exact target boundaries instead of substring matching', () => {
  assert.equal(releaseMutationMatchesPrompt(event(
    'npm publish --ignore-scripts --registry https://registry.npmjs.org --tag latest',
    'unused',
    { npmManifest: npmManifest('pkg', '1.2.3') },
  ), 'Publish pkg@1.2.30 to https://registry.npmjs.org.evil with tag latest.'), false);
  assert.equal(releaseMutationMatchesPrompt(event(
    'docker push registry.example.com/org/app:1.4.0',
    'unused',
  ), 'Push registry.example.com/org/app:1.4.01.'), false);
  assert.equal(releaseMutationMatchesPrompt(event(
    'gh release create v1.2.3 --repo github.com/org/project',
    'unused',
  ), 'Create release v1.2.30 in github.com/org/project-evil.'), false);
});

test('release authorization compares canonical prompt targets and affirmative double-negation', () => {
  const npmCommand = 'npm publish . --ignore-scripts --registry https://registry.npmjs.org --tag latest';
  assert.equal(releaseMutationMatchesPrompt(event(
    npmCommand,
    'unused',
    { npmManifest: npmManifest('@scope/pkg', '1.2.3') },
  ), 'Publish @scope/pkg@1.2.3 to https://registry.npmjs.org/ with tag latest.'), true);
  assert.equal(releaseMutationMatchesPrompt(event(
    'gh release create v1.2.3 --repo github.com/org/project',
    'unused',
  ), 'Create release v1.2.3 for https://github.com/org/project.'), true);

  const gitCommand = `git push https://github.com/org/project.git ${SHA_B}:refs/heads/main`;
  for (const prompt of [
    `Don't hesitate to push commit ${SHA_B} to https://github.com/org/project.git at refs/heads/main.`,
    `Do not avoid pushing commit ${SHA_B} to https://github.com/org/project.git at refs/heads/main.`,
    `不要犹豫，推送提交 ${SHA_B} 到 https://github.com/org/project.git 的 refs/heads/main。`,
    `不要跳过推送提交 ${SHA_B} 到 https://github.com/org/project.git 的 refs/heads/main。`,
  ]) assert.equal(releaseMutationMatchesPrompt(event(gitCommand, 'unused'), prompt), true, prompt);

  assert.equal(releaseMutationMatchesPrompt(event(gitCommand, 'unused'), [
    `Do not push ${SHA_A} to https://github.com/org/old.git at refs/heads/old.`,
    `Push ${SHA_B} to https://github.com/org/project.git at refs/heads/main.`,
  ].join(' ')), true);
});

test('release prompt analysis distinguishes complete, incomplete, conflicting, and unsupported targets', () => {
  const git = analyzeReleasePromptContract([
    'Push the release.',
    'Repository: https://github.com/org/project.git',
    `Commit: ${SHA_B}`,
    'Ref: refs/heads/main',
  ].join('\n'));
  assert.equal(git.status, 'complete');
  assert.equal(git.kind, 'git-push');
  assert.deepEqual(git.target, {
    remote: 'https://github.com/org/project.git',
    sourceName: SHA_B,
    targetRef: 'refs/heads/main',
    refType: 'branch',
  });

  const npm = analyzeReleasePromptContract(
    'Publish @scope/pkg@1.2.3 to https://registry.npmjs.org with tag next.',
  );
  assert.equal(npm.status, 'complete');
  assert.equal(npm.kind, 'npm-publish');
  assert.deepEqual(npm.target, {
    packageName: '@scope/pkg',
    version: '1.2.3',
    registry: 'https://registry.npmjs.org',
    tag: 'next',
  });

  assert.deepEqual(analyzeReleasePromptContract('Publish the package now.'), {
    status: 'incomplete', kind: 'npm-publish', target: null,
  });
  assert.equal(analyzeReleasePromptContract(
    `Push ${SHA_A} and ${SHA_B} to https://github.com/org/project.git at refs/heads/main.`,
  ).status, 'conflicting');
  assert.deepEqual(analyzeReleasePromptContract('Run terraform apply in production.'), {
    status: 'unsupported', kind: null, target: null,
  });
});

test('successful release names containing failure-like words are not false negatives', () => {
  const npmRecord = createReleaseMutationRecord(event(
    'npm publish --ignore-scripts --registry https://registry.npmjs.org --tag latest',
    'npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access\n+ error-tools@1.0.0',
    { npmManifest: npmManifest('error-tools', '1.0.0') },
  ));
  const pluginRecord = createReleaseMutationRecord(event(
    'omp plugin upgrade failed-jobs@omp-enhancer --scope user',
    'Upgraded failed-jobs@omp-enhancer (user) to 1.0.0',
  ));
  assert.equal(npmRecord?.kind, 'npm-publish');
  assert.equal(pluginRecord?.kind, 'omp-plugin-upgrade');
});

test('known line-shaped failure output still overrides a positive-looking suffix', () => {
  const command = `git push https://github.com/org/repo.git ${SHA_B}:refs/heads/main`;
  for (const failure of [
    'remote: error: protected branch update declined',
    'Error response from daemon: denied',
    'npm error code E403',
  ]) assert.equal(createReleaseMutationRecord(event(
    command,
    `${failure}\n${SHA_A.slice(0, 12)}..${SHA_B.slice(0, 12)} main -> main`,
  )), null, failure);
});

function deploymentJson(overrides = {}) {
  const {
    name = 'web',
    namespace = 'production',
    kind = 'Deployment',
    generation = 7,
    observedGeneration = generation,
    replicas = 3,
    updatedReplicas = replicas,
    availableReplicas = replicas,
    webImage = 'registry.example.com/web:2',
    containers = [
      { name: 'web', image: webImage },
      { name: 'sidecar', image: 'registry.example.com/sidecar:3' },
    ],
    omitStatusField,
    omitReplicas = false,
  } = overrides;
  const status = { observedGeneration, updatedReplicas, availableReplicas };
  if (omitStatusField) delete status[omitStatusField];
  const spec = { template: { spec: { containers } } };
  if (!omitReplicas) spec.replicas = replicas;
  return JSON.stringify({
    apiVersion: 'apps/v1',
    kind,
    metadata: { name, namespace, generation },
    spec,
    status,
  });
}
