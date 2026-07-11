import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyTestExecutionScope,
  classifyToolAction,
  hasUnsafeResultMasking,
  isDryRunAction,
} from '../src/action-policy.js';

function classify(command, toolName = 'bash') {
  return classifyToolAction({ toolName, text: command });
}

function exhaustCommandExpansion(command) {
  return `${'strace '.repeat(8)}${command}`;
}

function escapeShellSpaces(value) {
  return String(value).replaceAll(' ', '\\ ');
}

function concatenateShellFragments(value) {
  return String(value).split(' ').join('" "');
}

test('classifies common shell and direct file writes', () => {
  const commands = [
    'printf hacked > src/router.js',
    'sed -i s/old/new/ src/router.js',
    'touch new-file.txt',
    'cp a b',
    'mv a b',
    'tee output.txt',
    'mkdir generated',
    'python -c "open(\'x\', \'w\').write(\'y\')"',
    'node -e "require(\'fs\').writeFileSync(\'x\', \'y\')"',
  ];
  for (const command of commands) assert.equal(classify(command).workspaceWrite, true, command);
  assert.equal(classifyToolAction({ toolName: 'edit', text: 'src/router.js' }).workspaceWrite, true);
});

test('filesystem MCP tools fail closed except for explicit read operations', () => {
  for (const toolName of [
    'mcp__filesystem__append_file',
    'mcp__filesystem__replace_file',
    'mcp__filesystem__touch',
    'mcp__filesystem__chmod',
    'mcp__filesystem__chown',
    'mcp__filesystem__truncate',
    'mcp__filesystem__mkdir',
    'mcp__filesystem__set_permissions',
    'mcp__filesystem__unknown_operation',
  ]) {
    const action = classifyToolAction({ toolName, text: '{}' });
    assert.equal(action.workspaceWrite, true, toolName);
    assert.equal(action.definiteWorkspaceMutation, true, toolName);
  }
  for (const toolName of [
    'mcp__filesystem__read_file',
    'mcp__filesystem__read_multiple_files',
    'mcp__filesystem__list_directory',
    'mcp__filesystem__search_files',
    'mcp__filesystem__get_file_info',
  ]) {
    assert.equal(classifyToolAction({ toolName, text: '{}' }).workspaceWrite, false, toolName);
  }
});

test('remote MCP tools fail closed unless their operation is explicitly read-only', () => {
  for (const toolName of [
    'mcp__github__add_issue_comment',
    'mcp__jira__add_comment',
    'mcp__slack__add_reaction',
    'mcp__google_drive__share_file',
    'mcp__calendar__rsvp',
    'mcp__notion__archive_page',
    'mcp__github__set_labels',
    'mcp__github__get_and_approve_pull_request',
    'mcp__github__check_run_rerequest',
    'mcp__github__mark_notification_as_read',
    'mcp__github__rerequest_check_run',
    'mcp__github__approve_check_run',
    'mcp__slack__search_and_join',
    'mcp__browser__click',
    'mcp__github__unknown_operation',
  ]) {
    const action = classifyToolAction({ toolName, text: toolName.endsWith('__click') ? '{"text":"Like"}' : '{}' });
    assert.equal(action.networkAccess, true, toolName);
    assert.equal(action.externalWrite, true, toolName);
  }
  for (const toolName of [
    'mcp__github__get_issue',
    'mcp__jira__list_issues',
    'mcp__slack__search_messages',
    'mcp__notion__read_page',
    'mcp__github__get_issue_comments',
    'mcp__github__list_labels',
    'mcp__slack__search_reactions',
    'mcp__browser__open',
    'mcp__browser__navigate',
    'mcp__browser__screenshot',
  ]) {
    const action = classifyToolAction({ toolName, text: '{}' });
    assert.equal(action.networkAccess, true, toolName);
    assert.equal(action.externalWrite, false, toolName);
  }
});

test('recognizes provably read-only shell commands', () => {
  for (const command of [
    'git diff --stat',
    'git status --short',
    'cd /tmp/model-v182-e2e-content-fact && git log --all --oneline --notes',
    'rg -n route src',
    'sed -n 1,80p src/router.js',
    'ls -la',
    'node --check src/router.js',
    'npm run lint',
  ]) {
    assert.equal(classify(command).workspaceWrite, false, command);
  }
});

test('a read-only cwd change cannot hide a later workspace mutation', () => {
  for (const command of [
    'cd /tmp && touch x',
    'cd /tmp && git log > history.txt',
    'cd "$(touch /tmp/x)" && git log',
    'cd <(touch /tmp/x)',
    'cd <(curl https://example.com)',
    'cd >(touch /tmp/x)',
  ]) {
    assert.equal(classify(command).workspaceWrite, true, command);
  }
});

test('classifies common test runners without treating lint as tests', () => {
  for (const command of [
    'npm test',
    'npm run unit',
    'pnpm run check:test',
    'node --test',
    'make test',
    'ctest',
    './test.sh',
    'pytest -q',
    'npx jest',
    'pnpm exec vitest run',
    'python -m pytest',
    'mvn test',
    './gradlew test',
    'dotnet test',
    'deno test',
    'cargo nextest run',
    'npm exec jest',
    './gradlew --no-daemon test',
  ]) {
    assert.equal(classify(command).testExecution, true, command);
  }
  assert.equal(classify('npm run lint').testExecution, false);
  assert.equal(classify('node --check src/router.js').testExecution, false);
});

test('classifies package-manager fanout and transparent launchers as aggregate tests', () => {
  for (const command of [
    'npm --workspaces test',
    'npm --include-workspace-root test',
    'npm --if-present test',
    'npm --workspaces --include-workspace-root --if-present run test',
    'npm run --workspaces --include-workspace-root --if-present test',
    'npm --workspaces=true --include-workspace-root=true --if-present=true test',
    'npm --workspaces --if-present run test:unit',
    'pnpm --recursive test',
    'pnpm --recursive=true test',
    'pnpm -r test',
    'pnpm -r run test:unit',
    'yarn workspaces run test',
    'yarn workspaces foreach test',
    'yarn workspaces foreach -A run test',
    'yarn workspaces foreach -A run test:unit',
    'corepack npm test',
    'corepack npm --workspaces test',
    'mise exec -- npm test',
    'mise exec -- pnpm -r test',
    'mise exec -- yarn workspaces foreach test',
    'setsid npm test',
    'stdbuf -oL npm test',
    'ionice -c 3 npm test',
    'taskset -c 0 npm test',
    'docker run local-image npm test',
    'podman run --rm local-image npm test',
    'docker run --rm -e CI=1 -v "$PWD:/app" -w /app local-image sh -c "npm test"',
    'podman run --entrypoint npm local-image test',
    'setsid stdbuf -oL docker run local-image npm test',
    'docker exec container npm test',
    'podman exec container npm test',
    'docker compose run --rm service npm test',
    'docker compose exec service npm test',
    'podman compose run service npm test',
    'docker-compose run --rm service sh -c "npm test"',
    'systemd-run --user npm test',
    'chronic npm test',
    'watch -n 1 npm test',
    'sudo -u runner npm test',
    'sudo --preserve-env=CI npm test',
    'doas npm test',
    'runuser -u runner -- npm test',
    'chroot / npm test',
    'unshare --net npm test',
    'prlimit --nproc=100 npm test',
    '/bin/bash -c "npm run unit"',
    '/usr/bin/flock /tmp/l npm run unit',
    '/usr/bin/docker run --rm image npm run unit',
    'command -- npm test',
    'env -i PATH=/usr/bin npm test',
    'env -u NODE_ENV npm test',
    'docker --context remote run --rm image npm test',
    'docker container exec ctr npm test',
    'docker --context remote compose run --rm svc npm test',
    'podman --connection dev run image npm test',
    'kubectl exec pod -- npm test',
    'kubectl exec -c app pod -- sh -lc "npm test"',
    'kubectl run test-pod --image=node -- npm test',
    'uv run pytest',
    'poetry run pytest',
    'npm t',
    'npm --silent t',
    'corepack npm t',
    'mise exec -- npm t',
    'npm run-script test',
    'yarn run-script test',
    'pnpm run-script test',
    'npx --package=vitest vitest run',
    'npm exec --package=vitest -- vitest run',
    'cargo +nightly test',
    'bazel --output_base=/tmp/b test //...',
    'node --experimental-test-coverage --test',
    'task test',
    'nx test app',
    'turbo run test',
    'bash --noprofile --norc -c "npm test"',
    'bash -o pipefail -c "npm test"',
    'sh -o errexit -c "npm test"',
    'bash -c "npm test" runner0',
    'bash -lc "npm test" --',
    'dash -c "npm test"',
    'fish -c "npm test"',
    'nohup command timeout 30 env CI=1 npm test &',
    '(npm test) &',
    'make -C . test',
    'just test',
    'NODE_OPTIONS="--max-old-space-size=4096 --trace-warnings" npm test',
    "TEST_FLAGS='--runInBand --detectOpenHandles' npm test",
    'cross-env-shell NODE_OPTIONS="--trace-warnings --no-deprecation" "npm test"',
    'env --split-string="npm test"',
    'pnpm vitest',
    'yarn jest',
    'pnpm playwright test',
    'coverage run -m pytest',
    'conda run pytest',
    'bundle exec rake test',
    'rake test',
    'composer test',
    'php artisan test',
    'php vendor/bin/phpunit',
    'ant test',
    'mise run test',
    'lerna run test',
    'rush test',
    'xvfb-run npm test',
    'cross-env CI=1 npm test',
    'flock /tmp/t.lock npm test',
    'sbt -batch test',
    'meson test -C build',
    'ninja -C build test',
    'pdm run pytest',
    'bazel --output_base /tmp/b test //...',
    'bazel --bazelrc .bazelrc test //...',
    'cargo --manifest-path Cargo.toml test',
    'cargo --color always test',
    'deno --config deno.json test',
    'npm tst',
    'bunx --bun vitest run',
    'gotestsum -- ./...',
    'go tool gotestsum -- ./...',
    'sbt "testOnly foo.BarSpec"',
    'lein with-profile test test',
    'echo --dry-run && npm test',
    'make --dry-run lint && npm test',
    'npm test && echo --dry-run',
    'npm test -- --dry-run',
    'sudo --non-interactive npm test',
    'sudo --preserve-env CI=1 npm test',
    'env --ignore-environment npm test',
    'npx -c "npm test"',
    'npm exec -c "npm test"',
    'flock --verbose /tmp/t.lock npm test',
    'docker compose --ansi never run --rm svc npm test',
    'parallel npm test ::: one',
    'find . -type f -name package.json -exec npm test {} +',
    'nice -5 npm test',
  ]) {
    assert.equal(classify(command).testExecution, true, command);
    assert.equal(classifyTestExecutionScope({ toolName: 'bash', text: command }), 'aggregate-or-unknown', command);
  }
});

test('corepack and mise preserve explicit focused test kinds', () => {
  for (const command of [
    'corepack npm run test:unit',
    'mise exec -- npm run test:unit',
  ]) {
    assert.equal(classify(command).testExecution, true, command);
    assert.equal(classifyTestExecutionScope({ toolName: 'bash', text: command }), 'focused', command);
  }
});

test('transparent launchers preserve a single exact focused test target', () => {
  for (const command of [
    '/usr/bin/sudo npm run unit',
    '/usr/bin/env npm run unit',
    'timeout 30 node --test test/router.test.js',
    'env CI=1 node --test test/router.test.js',
    'command node --test test/router.test.js',
  ]) {
    assert.equal(classify(command).testExecution, true, command);
    assert.equal(classifyTestExecutionScope({ toolName: 'bash', text: command }), 'focused', command);
  }
});

test('shell, container, and unknown wrappers keep exact test targets aggregate-or-unknown', () => {
  for (const command of [
    'bash -c "node --test test/router.test.js"',
    'docker run local-image node --test test/router.test.js',
    'mystery-wrapper node --test test/router.test.js',
    'script -q -c "node --test test/router.test.js" /dev/null',
    'setsid --wait /usr/bin/script --return -q --command "node --test test/router.test.js" /dev/null',
    'mystery-wrapper "node --test test/router.test.js"',
  ]) {
    assert.equal(classify(command).testExecution, true, command);
    assert.equal(classifyTestExecutionScope({ toolName: 'bash', text: command }), 'aggregate-or-unknown', command);
  }
});

test('canonical single-target runners remain focused across package-manager frontends', () => {
  for (const command of [
    'pnpm vitest run test/router.test.js',
    'yarn jest test/router.test.js',
    'pnpm playwright test test/ui.spec.ts',
    'node --no-warnings --test test/router.test.js',
    'pytest test/test_router.py::test_one',
  ]) {
    assert.equal(classify(command).testExecution, true, command);
    assert.equal(classifyTestExecutionScope({ toolName: 'bash', text: command }), 'focused', command);
  }
});

test('wrapper parsing requires a real test runner instead of a test-shaped argument', () => {
  for (const command of [
    'env rg test src',
    'time rg test src',
    'exec grep test README.md',
    'xargs rg test',
    'for f in test/*.js; do echo "$f"; done',
    'if test -f package.json; then git status; fi',
    'case "$mode" in test) echo testing;; esac',
    'nohup echo testing',
    'command cat test/router.test.js',
    'setsid rg test src',
    'stdbuf -oL grep test README.md',
    'docker run local-image rg test src',
    'make -C . lint',
    'just lint',
    'docker exec container rg test src',
    'docker compose run --rm service rg test src',
    'systemd-run --user rg test src',
    'chronic rg test src',
    'watch -n 1 rg test src',
    'sudo -u runner rg test src',
    'command -- rg test src',
    'env -i PATH=/usr/bin rg test src',
    'kubectl exec pod -- rg test src',
    'uv run ruff check src',
    'poetry run ruff check src',
    'make check-format',
    'make -C . check-docs',
    'just check-types',
    'logger "npm test"',
    'logger --message="npm test"',
    'printf "%s\\n" "npm test"',
    'mystery-wrapper "the command npm test is documented"',
    'mystery-wrapper --description="npm test"',
    'mystery-wrapper --command="the command npm test is documented"',
    'script -q README.md',
    'script -q -c "rg test src" /dev/null',
  ]) {
    assert.equal(classify(command).testExecution, false, command);
    assert.equal(classifyTestExecutionScope({ toolName: 'bash', text: command }), 'none', command);
  }
});

test('opaque and unknown execution wrappers expose the nested command effects', () => {
  const wrappers = [
    (command) => `strace ${command}`,
    (command) => `perf stat ${command}`,
    (command) => `valgrind ${command}`,
    (command) => `gdb --args ${command}`,
    (command) => `nsenter --target 1 --mount ${command}`,
    (command) => `bwrap --ro-bind / / ${command}`,
    (command) => `su runner -c "${command}"`,
    (command) => `mystery-wrapper ${command}`,
    (command) => `script -q -c "${command}" /dev/null`,
    (command) => `setsid --wait /usr/bin/script --return -q --command "${command}" /dev/null`,
    (command) => `script -q -c"${command}" /dev/null`,
    (command) => `script -qec"${command}" /dev/null`,
    (command) => `script -q -c${escapeShellSpaces(command)} /dev/null`,
    (command) => `script -q -c${concatenateShellFragments(command)} /dev/null`,
    (command) => `script -q -c$'${command}' /dev/null`,
    (command) => `mystery-wrapper "${command}"`,
    (command) => `mystery-wrapper --command="${command}"`,
    (command) => `mystery-runner --cmd='${command}'`,
    (command) => `mystery-wrapper --command=${escapeShellSpaces(command)}`,
    (command) => `mystery-runner --cmd=${concatenateShellFragments(command)}`,
    (command) => `mystery-launcher --exec=$'${command}'`,
    (command) => `mystery-executor --run=$'${command}'`,
    (command) => `mystery-wrapper -c ${escapeShellSpaces(command)}`,
    (command) => `mystery-wrapper -c${escapeShellSpaces(command)}`,
  ];
  for (const wrap of wrappers) {
    const testCommand = wrap('npm test');
    assert.equal(classify(testCommand).testExecution, true, testCommand);
    assert.equal(classifyTestExecutionScope({ toolName: 'bash', text: testCommand }), 'aggregate-or-unknown', testCommand);

    const removal = wrap('rm -rf cache');
    assert.equal(classify(removal).definiteWorkspaceMutation, true, removal);
    assert.equal(classify(removal).irreversible, true, removal);

    const workspaceWrite = wrap('touch marker');
    assert.equal(classify(workspaceWrite).definiteWorkspaceMutation, true, workspaceWrite);

    const push = wrap('git push origin main');
    assert.equal(classify(push).networkAccess, true, push);
    assert.equal(classify(push).externalWrite, true, push);

    const clusterDelete = wrap('kubectl delete pod web');
    assert.equal(classify(clusterDelete).networkAccess, true, clusterDelete);
    assert.equal(classify(clusterDelete).externalWrite, true, clusterDelete);
    assert.equal(classify(clusterDelete).irreversible, true, clusterDelete);

    const post = wrap('curl -X POST https://example.com/api');
    assert.equal(classify(post).networkAccess, true, post);
    assert.equal(classify(post).externalWrite, true, post);
  }
});

test('command expansion depth exhaustion propagates every protected effect fail closed', () => {
  const command = exhaustCommandExpansion('rg parser src');
  const action = classify(command);
  assert.equal(action.opaqueEffects, true);
  assert.equal(action.testExecution, true);
  assert.equal(action.networkAccess, true);
  assert.equal(action.externalWrite, true);
  assert.equal(action.workspaceWrite, true);
  assert.equal(action.definiteWorkspaceMutation, true);
  assert.equal(action.irreversible, true);
  assert.equal(classifyTestExecutionScope({ toolName: 'bash', text: command }), 'aggregate-or-unknown');
});

test('unreliable command-bearing argv fails closed without treating logger prose as execution', () => {
  for (const command of [
    'script -q -c "$RUNNER" /dev/null',
    'script -q -c "npm test /dev/null',
    "script -q -c$'npm\\qtest' /dev/null",
    'mystery-wrapper --command="$RUNNER"',
    'mystery-runner --cmd="npm test',
    "mystery-launcher --exec=$'npm\\qtest'",
    'mystery-executor --run=',
    'mystery-wrapper -c',
  ]) {
    const action = classify(command);
    assert.equal(action.opaqueEffects, true, command);
    assert.equal(action.testExecution, true, command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, true, command);
    assert.equal(action.workspaceWrite, true, command);
    assert.equal(action.irreversible, true, command);
  }

  for (const command of [
    'logger npm test',
    'logger git push origin main',
    'logger rm -rf cache',
    'logger "npm test"',
    'logger --message="git push origin main"',
  ]) {
    const action = classify(command);
    assert.equal(action.testExecution, false, command);
    assert.equal(action.externalWrite, false, command);
    assert.equal(action.irreversible, false, command);
  }
});

test('opaque shell controls fail closed only when their body contains a runner', () => {
  for (const command of [
    'eval "npm test"',
    'source ./test.sh',
    'xargs npm test',
    'xargs -n 1 npm test',
    'if npm test; then echo passed; fi',
    'if test -f package.json; then command npm test; fi',
    'while npm test; do echo retry; done',
    'for f in test/*.test.js; do node --test "$f"; done',
    'case "$mode" in test) npm test;; esac',
  ]) {
    assert.equal(classify(command).testExecution, true, command);
    assert.equal(classifyTestExecutionScope({ toolName: 'bash', text: command }), 'aggregate-or-unknown', command);
  }
});

test('only browser checks execute tests among omp test QA and evidence tools', () => {
  for (const toolName of [
    'omp_test_gate',
    'omp_test_report',
    'omp_test_analyze',
    'omp_test_context',
    'omp_test_coverage_analyze',
    'omp_test_mutation_context',
  ]) {
    assert.equal(classifyToolAction({ toolName }).testExecution, false, toolName);
  }

  assert.equal(classifyToolAction({ toolName: 'omp_test_browser_check' }).testExecution, true);
});

test('separates network reads from external mutations', () => {
  assert.deepEqual(
    pick(classify('curl https://example.com/data')),
    { networkAccess: true, externalWrite: false },
  );
  assert.deepEqual(
    pick(classify('curl -X POST -d data https://example.com/api')),
    { networkAccess: true, externalWrite: true },
  );
  for (const command of [
    'git push origin main',
    'npm publish',
    'npm dist-tag add pkg@1 latest',
    'docker push org/image:tag',
    'aws s3 cp artifact s3://prod-bucket/',
    'gh issue create --title bug',
    'kubectl apply -f deploy.yml',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, true, command);
  }
});

test('classifies destructive variants as irreversible', () => {
  for (const command of [
    'rm -rf cache',
    'find cache -type f -delete',
    'git clean -fdx',
    'truncate -s 0 data.db',
    'shred -u secret.txt',
    'python -c "import shutil; shutil.rmtree(\'cache\')"',
    'node -e "require(\'fs\').rmSync(\'cache\', {recursive:true})"',
    'rm cache.tmp',
    'git reset --hard HEAD~1',
    'git push --force-with-lease origin main',
    'git push origin --delete old-branch',
    'git branch -D old',
    'git tag -d v1.0.0',
    'git tag --delete v1.0.0',
    'git tag -f v1.0.0 HEAD~1',
    'git tag --force v1.0.0 HEAD~1',
    'git update-ref -d refs/tags/v1.0.0',
    'git update-ref --delete refs/heads/stale',
    'git reflog expire --expire=now --all',
    'git gc --prune=now',
    'git worktree remove --force ../stale-worktree',
    'npm unpublish pkg@1.0.0',
    'terraform destroy -auto-approve',
    'aws s3 rm s3://prod-bucket/path --recursive',
    'aws iam delete-user --user-name alice',
    'gcloud projects delete prod-project',
    'az group delete --name production --yes',
    'kubectl --context prod delete namespace production',
    'helm --kube-context prod uninstall web --namespace production',
    'docker system prune -af',
    'docker image rm registry.example.com/app:prod',
    'gh repo delete org/repo --yes',
    'curl -X DELETE https://example.com/account',
    'curl --request=DELETE https://example.com/account',
    'http DELETE https://example.com/account',
    'gh api --method=DELETE repos/org/repo',
    'gh api -XDELETE repos/org/repo',
    `node -e "fetch('https://example.com/account', {method:'DELETE'})"`,
    `node -e "axios.delete('https://example.com/account')"`,
  ]) {
    assert.equal(classify(command).irreversible, true, command);
  }
  for (const input of [
    { toolName: 'mcp__database__execute_query', text: 'DELETE FROM users WHERE id = 1' },
    { toolName: 'mcp__database__execute_query', text: 'DROP TABLE users' },
    { toolName: 'mcp__browser__submit', text: 'Delete account permanently' },
  ]) assert.equal(classifyToolAction(input).irreversible, true, `${input.toolName}: ${input.text}`);

  for (const command of [
    'git tag',
    'git tag v1.0.0',
    'git update-ref refs/tags/v1.0.0 HEAD',
    'git reflog show',
    'git gc --prune=2.weeks.ago',
    'git worktree list',
    'git worktree remove ../finished-worktree',
  ]) assert.equal(classify(command).irreversible, false, command);
});

test('compound shell commands are write-risky unless every segment is proven safe', () => {
  for (const command of [
    "git status; ruby -e 'File.write(\"x\", \"y\")'",
    "rg route src && perl -e 'unlink \"x\"'",
    "git diff || python -c 'import requests; requests.post(\"https://example.com\")'",
    'cat README.md | sh',
  ]) {
    const action = classify(command);
    assert.equal(action.workspaceWrite || action.externalWrite, true, command);
  }
});

test('command substitution and background execution cannot hide writes', () => {
  for (const command of [
    "git status $(ruby -e 'File.write(\"x\", \"y\")')",
    "git status `ruby -e 'File.write(\"x\", \"y\")'`",
    "git status & ruby -e 'File.write(\"x\", \"y\")'",
    "git status\nruby -e 'File.write(\"x\", \"y\")'",
  ]) assert.equal(classify(command).workspaceWrite, true, command);

  assert.equal(classify("rg 'foo|bar' src").workspaceWrite, false);
});

test('classifies MCP filesystem and remote-provider tools by capability-bearing names', () => {
  assert.equal(classifyToolAction({ toolName: 'mcp__filesystem__write_file' }).workspaceWrite, true);
  assert.equal(classifyToolAction({ toolName: 'mcp__github__create_issue' }).externalWrite, true);
  assert.equal(classifyToolAction({ toolName: 'mcp__github__get_issue' }).networkAccess, true);
  assert.equal(classifyToolAction({ toolName: 'mcp__filesystem__read_file' }).networkAccess, false);
  assert.equal(classifyToolAction({ toolName: 'mcp__linear__create_issue' }).externalWrite, true);
  assert.equal(classifyToolAction({ toolName: 'mcp__browser__open', text: 'Open documentation link' }).externalWrite, false);
  assert.equal(classifyToolAction({ toolName: 'mcp__browser__click', text: 'Like' }).externalWrite, true);
  assert.equal(classifyToolAction({ toolName: 'mcp__browser__submit', text: 'Submit account form' }).externalWrite, true);
  assert.equal(classifyToolAction({ toolName: 'mcp__database__execute_query', text: 'SELECT * FROM users' }).externalWrite, false);
  assert.equal(classifyToolAction({ toolName: 'mcp__database__execute_query', text: 'DELETE FROM users' }).externalWrite, true);
  assert.equal(classifyToolAction({ toolName: 'mcp__agent__spawn' }).subagent, true);
});

test('tool-name namespace separators canonicalize before capability classification', () => {
  for (const toolName of ['filesystem.write_file', 'filesystem/write_file', 'filesystem:write_file']) {
    const action = classifyToolAction({ toolName });
    assert.equal(action.workspaceWrite, true, toolName);
    assert.equal(action.networkAccess, false, toolName);
  }
  for (const toolName of ['mcp.github.create_issue', 'mcp/github/create_issue', 'github:create_issue']) {
    const action = classifyToolAction({ toolName });
    assert.equal(action.networkAccess, true, toolName);
    assert.equal(action.externalWrite, true, toolName);
  }
  assert.equal(classifyToolAction({ toolName: 'collaboration.spawn_agent' }).subagent, true);

  const remoteRead = classifyToolAction({ toolName: 'github.get_issue' });
  assert.equal(remoteRead.networkAccess, true);
  assert.equal(remoteRead.externalWrite, false);
  const localRead = classifyToolAction({ toolName: 'filesystem.read_file' });
  assert.equal(localRead.workspaceWrite, false);
  assert.equal(localRead.networkAccess, false);
  assert.equal(classifyToolAction({ toolName: 'collaboration.list_agents' }).subagent, true);
});

test('all collaboration lifecycle tools count as subagent interaction', () => {
  for (const toolName of [
    'collaboration.spawn_agent',
    'collaboration.followup_task',
    'collaboration.send_message',
    'collaboration.wait_agent',
    'collaboration.interrupt_agent',
    'collaboration.list_agents',
  ]) assert.equal(classifyToolAction({ toolName }).subagent, true, toolName);

  for (const toolName of ['functions.request_user_input', 'functions.update_plan']) {
    assert.equal(classifyToolAction({ toolName }).subagent, false, toolName);
  }
});

test('the local core status tool is observational rather than a subagent action', () => {
  const action = classifyToolAction({ toolName: 'omp_core_subagent_status', text: '{}' });

  assert.equal(action.subagent, false);
  assert.equal(action.workspaceWrite, false);
  assert.equal(action.testExecution, false);
  assert.equal(action.networkAccess, false);
  assert.equal(action.externalWrite, false);
});

test('trusted namespaced executors retain shell and direct-write semantics', () => {
  const touch = classifyToolAction({ toolName: 'functions.exec_command', text: 'touch generated.txt' });
  assert.equal(touch.workspaceWrite, true);
  assert.equal(touch.definiteWorkspaceMutation, true);
  assert.equal(classifyToolAction({ toolName: 'functions.exec_command', text: 'git commit -m test' }).workspaceWrite, true);

  const custom = classifyToolAction({ toolName: 'functions.exec_command', text: './scripts/custom.sh' });
  assert.equal(custom.opaqueEffects, true);
  assert.equal(custom.unverifiableNetworkEffects, true);
  assert.equal(custom.unverifiableWorkspaceEffects, true);

  const tests = classifyToolAction({ toolName: 'functions.exec_command', text: 'npm test' });
  assert.equal(tests.testExecution, true);
  assert.equal(tests.unverifiableWorkspaceEffects, true);
  assert.equal(classifyToolAction({ toolName: 'functions.exec_command', text: 'curl https://example.com' }).networkAccess, true);
  assert.equal(classifyToolAction({ toolName: 'functions.exec_command', text: 'rm -rf cache' }).irreversible, true);
  assert.equal(classifyToolAction({ toolName: 'functions.apply_patch', text: 'src/router.js' }).workspaceWrite, true);

  const remoteExec = classifyToolAction({ toolName: 'github.exec_command', text: 'touch generated.txt' });
  assert.equal(remoteExec.networkAccess, true);
  assert.equal(remoteExec.definiteWorkspaceMutation, false);
});

test('unknown provider mutations fail closed as external writes instead of local workspace edits', () => {
  for (const toolName of [
    'google_drive_update_file',
    'google_calendar_create_event',
    'box_upload_file',
    'figma_update_file',
    'teams_send_message',
    'sharepoint_update_item',
    'stripe_create_payment',
    'shopify_update_product',
    'atlassian_rovo_update_issue',
  ]) {
    const action = classifyToolAction({ toolName });
    assert.equal(action.externalWrite, true, toolName);
    assert.equal(action.networkAccess, true, toolName);
    assert.equal(action.workspaceWrite, false, toolName);
    assert.equal(action.definiteWorkspaceMutation, false, toolName);
  }
});

test('unknown provider reads expose unverifiable network effects while exact local platform tools remain local', () => {
  for (const toolName of [
    'google_drive_get_file',
    'google_calendar_list_events',
    'box_download_file',
    'figma_get_file',
    'teams_search_messages',
    'sharepoint_get_item',
    'stripe_get_balance',
    'shopify_get_product',
    'atlassian_rovo_search_issues',
    'untrusted.exec_command',
  ]) {
    const action = classifyToolAction({ toolName });
    assert.equal(action.networkAccess, false, toolName);
    assert.equal(action.externalWrite, false, toolName);
    assert.equal(action.unverifiableNetworkEffects, true, toolName);
    assert.equal(action.workspaceWrite, false, toolName);
  }

  for (const toolName of [
    'read',
    'grep',
    'functions.update_plan',
    'todo',
    'functions.todo',
    'functions.create_goal',
    'functions.update_goal',
    'collaboration.send_message',
    'collaboration.followup_task',
    'collaboration.list_agents',
    'omp_core_resolve_classification',
    'omp_test_gate',
    'writing_quality_check',
    'writing_logic_check',
    'fact_check_evidence',
    'fact_check_analyze',
    'fact_check_report',
    'omp_config_doctor',
    'omp_config_assets',
  ]) {
    const action = classifyToolAction({ toolName });
    assert.equal(action.networkAccess, false, toolName);
    assert.equal(action.externalWrite, false, toolName);
    assert.equal(action.unverifiableNetworkEffects, false, toolName);
    assert.equal(action.workspaceWrite, false, toolName);
  }
});

test('browser-check payloads expose artifact, embedded shell, and remote interaction effects', () => {
  const classifyBrowser = (input) => classifyToolAction({
    toolName: 'omp_test_browser_check',
    text: JSON.stringify({ input }),
  });

  const local = classifyBrowser({ baseUrl: 'http://127.0.0.1:3000', scenarios: [] });
  assert.equal(local.testExecution, true);
  assert.equal(local.unverifiableWorkspaceEffects, true);
  assert.equal(local.definiteWorkspaceMutation, false);
  assert.equal(local.networkAccess, true);
  assert.equal(local.externalWrite, false);

  const destructive = classifyBrowser({
    baseUrl: 'http://localhost:3000',
    serverCommand: 'rm -rf cache',
    scenarios: [],
  });
  assert.equal(destructive.workspaceWrite, true);
  assert.equal(destructive.definiteWorkspaceMutation, true);
  assert.equal(destructive.irreversible, true);

  const remoteCommand = classifyBrowser({
    baseUrl: 'http://localhost:3000',
    serverCommand: 'curl -X POST -d data https://example.com/api',
    scenarios: [],
  });
  assert.equal(remoteCommand.networkAccess, true);
  assert.equal(remoteCommand.externalWrite, true);

  const delegated = classifyBrowser({
    baseUrl: 'http://localhost:3000',
    serverCommand: 'codex',
    scenarios: [],
  });
  assert.equal(delegated.subagent, true);

  const remoteTarget = classifyBrowser({
    baseUrl: 'https://staging.example.com',
    scenarios: [{ action: 'click', selector: '#submit' }],
  });
  assert.equal(remoteTarget.networkAccess, true);
  assert.equal(remoteTarget.externalWrite, true);
});

test('non-MCP remote provider tools require network authority', () => {
  for (const toolName of [
    'github_get_issue',
    'slack_search_messages',
    'notion_read_page',
    'aws_describe_instances',
    'database_query',
  ]) assert.equal(classifyToolAction({ toolName }).networkAccess, true, toolName);

  assert.equal(classifyToolAction({ toolName: 'filesystem_read_file' }).networkAccess, false);
  assert.equal(classifyToolAction({ toolName: 'mcp__filesystem__read_file' }).networkAccess, false);
});

test('generic remote API payloads classify mutations and fail closed when effects are unknown', () => {
  for (const input of [
    { toolName: 'mcp__github__api', text: '{"method":"POST","path":"repos/org/repo/issues"}' },
    { toolName: 'mcp__github__graphql', text: '{"query":"mutation CreateIssue { createIssue(input: {}) { id } }"}' },
    { toolName: 'mcp__slack__api_call', text: '{"method":"chat.postMessage","channel":"C123"}' },
    { toolName: 'mcp__notion__request', text: '{"method":"PATCH","path":"/v1/pages/page-id"}' },
    { toolName: 'github_api', text: '{"httpMethod":"DELETE","path":"repos/org/repo/issues/1"}' },
    { toolName: 'database_query', text: '{"query":"UPDATE users SET active = false"}' },
  ]) {
    const action = classifyToolAction(input);
    assert.equal(action.networkAccess, true, `${input.toolName}: ${input.text}`);
    assert.equal(action.externalWrite, true, `${input.toolName}: ${input.text}`);
  }

  for (const input of [
    { toolName: 'mcp__github__api', text: '{"path":"repos/org/repo/issues"}' },
    { toolName: 'mcp__github__graphql', text: '{}' },
    { toolName: 'mcp__slack__api_call', text: '{"channel":"C123"}' },
    { toolName: 'mcp__notion__request', text: '{"path":"/v1/pages/page-id"}' },
    { toolName: 'github_api', text: '{}' },
    { toolName: 'database_query', text: '{}' },
  ]) {
    const action = classifyToolAction(input);
    assert.equal(action.networkAccess, true, input.toolName);
    assert.equal(action.externalWrite, true, input.toolName);
    assert.equal(action.opaqueEffects, true, input.toolName);
  }
});

test('generic remote API payloads allow only explicit read-only operations as observations', () => {
  for (const input of [
    { toolName: 'mcp__github__api', text: '{"method":"GET","path":"repos/org/repo/issues/1"}' },
    { toolName: 'mcp__github__graphql', text: '{"query":"query Issue { repository { issue(number: 1) { id } } }"}' },
    { toolName: 'mcp__slack__api_call', text: '{"method":"conversations.history","channel":"C123"}' },
    { toolName: 'mcp__notion__request', text: '{"method":"GET","path":"/v1/pages/page-id"}' },
    { toolName: 'database_query', text: '{"query":"SELECT * FROM users"}' },
  ]) {
    const action = classifyToolAction(input);
    assert.equal(action.networkAccess, true, `${input.toolName}: ${input.text}`);
    assert.equal(action.externalWrite, false, `${input.toolName}: ${input.text}`);
    assert.equal(action.opaqueEffects, false, `${input.toolName}: ${input.text}`);
  }
});

test('detects commands that mask exit status or request dry-run semantics', () => {
  for (const command of [
    'npm test || true',
    'npm test || :',
    'npm test; exit 0',
    "npm test; printf '42 tests passed\\n'",
    'npm test && echo passed',
    'npm test | tee out.log',
    'npm test > test.log',
    'set +e; npm test',
    'vitest --passWithNoTests',
  ]) {
    assert.equal(hasUnsafeResultMasking(command), true, command);
  }
  assert.equal(hasUnsafeResultMasking('npm test'), false);
  assert.equal(isDryRunAction('git push --dry-run origin main'), true);
  assert.equal(isDryRunAction('npm publish --dry-run'), true);
  for (const command of [
    'make -n test',
    'make --dry-run test',
    'make --question test',
    'just --dry-run test',
    'task --dry test',
    'task --summary test',
    'turbo run test --dry-run',
    'ctest -N',
    'ninja -n test',
    './gradlew test --dry-run',
    'ctest --show-only',
    'ninja --dry-run test',
    'turbo run test --dry',
    'turbo run test --dry=json',
    'cargo test --no-run',
  ]) {
    assert.equal(isDryRunAction(command), true, command);
    assert.equal(classifyTestExecutionScope({ toolName: 'bash', text: command }), 'none', command);
  }
  assert.equal(isDryRunAction('git push origin main'), false);
});

test('upload forms and dependency fetch commands require network authorization', () => {
  for (const command of [
    'curl -F file=@artifact https://example.com/upload',
    'curl --upload-file artifact https://example.com/upload',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, true, command);
  }
  for (const command of [
    'npm install',
    'pnpm add lodash',
    'pip install requests',
    'cargo fetch',
    'go get example.com/module',
    'git submodule update --init',
    'apt-get update',
    '/usr/bin/curl https://example.com',
    'bash -c "curl https://example.com"',
    'git -C . fetch origin',
    'npm i',
    'npm ci',
    'pip3 install requests',
    'python -m pip install requests',
    'go mod download',
    'npx jest',
    'npm exec jest',
    '/usr/bin/env curl https://example.com',
    'timeout 30 curl https://example.com',
    'node -e "require(\'https\').get(\'https://example.com\')"',
  ]) {
    assert.equal(classify(command).networkAccess, true, command);
  }
});

test('wrapped release commands and provider mutations remain external writes', () => {
  for (const command of [
    '/usr/bin/git push origin main',
    'git -C . push origin main',
    'bash -c "git push origin main"',
    'gh api --method POST repos/org/repo/issues',
    'gh api --method=POST repos/org/repo/issues',
    'gh api -XPOST repos/org/repo/issues',
    'npm run deploy',
    'omp plugin upgrade omp-enhancer-core',
    'curl --json \'{"ok":true}\' https://example.com',
    'curl -dfoo https://example.com',
    'curl --request=POST https://example.com',
    'http POST https://example.com ok=true',
    'aws s3 cp artifact s3://bucket/path --acl private',
    'aws lambda update-function-code --function-name app --zip-file fileb://app.zip',
    'kubectl set image deployment/web web=registry.example.com/web:2',
    'kubectl scale deployment/web --replicas=3',
    'kubectl annotate deployment/web owner=platform',
    'kubectl label deployment/web tier=frontend',
    'kubectl rollout restart deployment/web',
    'kubectl exec deployment/web -- touch /tmp/changed',
    'helm rollback web 2',
  ]) assert.equal(classify(command).externalWrite, true, command);
});

test('kubectl and helm read-only observations are not confused with cluster mutations', () => {
  for (const command of [
    'kubectl get deployment/web -o json',
    'kubectl rollout status deployment/web',
    'kubectl auth can-i get deployments',
    'helm status web',
    'helm template web ./chart',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, false, command);
  }
});

test('provider global flags cannot hide external mutations', () => {
  for (const command of [
    'kubectl --context prod delete deployment/web',
    'kubectl --namespace prod scale deployment/web --replicas=0',
    'helm --kube-context prod rollback web 2',
    'helm --namespace prod uninstall web',
    'aws --profile prod iam delete-user --user-name alice',
    'gcloud --project prod projects delete prod',
    'az --subscription prod group delete --name production',
    'gh repo delete org/repo --yes',
  ]) assert.equal(classify(command).externalWrite, true, command);
});

test('download and read-only flags are not confused with external upload flags', () => {
  const curlFailFast = classify('curl -f https://example.com/data');
  assert.equal(curlFailFast.networkAccess, true);
  assert.equal(curlFailFast.externalWrite, false);
  const download = classify('aws s3 cp s3://bucket/object ./object');
  assert.equal(download.networkAccess, true);
  assert.equal(download.externalWrite, false);
  assert.equal(download.workspaceWrite, true);
});

test('dynamic deployment entrypoints conservatively require network and external-write authority', () => {
  for (const command of [
    './deploy.sh',
    './scripts/deploy-prod.sh --confirm',
    'make deploy',
    'just deploy',
    'node deploy.js',
    'node scripts/release-prod.mjs',
    'python deploy.py',
    'python3 scripts/publish_release.py',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, true, command);
  }
});

test('compound release verification scripts remain local automation while real release targets stay external', () => {
  for (const command of [
    'npm run test:release',
    'npm run verify-release',
    'npm run build:release',
    'npm run release:dry-run',
    'make release-check',
    'make deploy --dry-run',
    './scripts/deploy-dry-run.sh',
    'node scripts/verify-release.js',
    'python scripts/build_release.py',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, false, command);
    assert.equal(action.externalWrite, false, command);
    assert.equal(action.opaqueEffects, false, command);
    assert.equal(action.unverifiableNetworkEffects, true, command);
    assert.equal(action.unverifiableWorkspaceEffects, true, command);
  }

  for (const command of [
    'npm run deploy',
    'npm run publish',
    'npm run release',
    'make deploy',
    'make release',
    './deploy.sh',
    'node scripts/release-prod.mjs',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, true, command);
    assert.equal(action.opaqueEffects, true, command);
  }
});

test('ordinary local test and build entrypoints are not treated as external mutations', () => {
  for (const command of [
    './test.sh',
    './scripts/build.sh',
    './setup.sh',
    'make test',
    'make build',
    'just test',
    'just build',
    'node build.js',
    'node scripts/test-runner.js',
    'python build.py',
    'python3 scripts/test_runner.py',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, false, command);
    assert.equal(action.externalWrite, false, command);
    assert.equal(action.opaqueEffects, false, command);
    assert.equal(action.unverifiableNetworkEffects, true, command);
  }
});

test('local dev-server runners require network authority without becoming external mutations', () => {
  for (const command of ['npm start', 'npm run dev', 'pnpm serve', 'make dev']) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, false, command);
    assert.equal(action.opaqueEffects, false, command);
  }
});

test('database migration runners stay local-release-neutral but require network awareness and irreversible approval', () => {
  for (const command of [
    'npm run migrate',
    'make migration',
    'python tools/migrate.py',
    './scripts/migration.sh',
  ]) {
    const action = classify(command);
    assert.equal(action.externalWrite, false, command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.irreversible, true, command);
    assert.equal(action.opaqueEffects, false, command);
  }
});

test('inline Node HTTP clients distinguish reads from remote mutations', () => {
  for (const command of [
    `node -e "fetch('https://example.com', { method: 'POST' })"`,
    `node -e "fetch('https://example.com', { method: 'PATCH' })"`,
    `node -e "require('https').request('https://example.com', { method: 'DELETE' }).end()"`,
    `node -e "const https=require('https'); https.request({hostname:'example.com', method:'PUT'}).end()"`,
    `node -e "require('axios').post('https://example.com', {ok:true})"`,
    `node -e "axios.patch('https://example.com', {ok:true})"`,
    `node -e "axios.request({url:'https://example.com', method:'DELETE'})"`,
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, true, command);
  }

  for (const command of [
    `node -e "require('https').get('https://example.com', () => {})"`,
    `node -e "require('axios').get('https://example.com')"`,
    `node -e "fetch('https://example.com')"`,
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, false, command);
  }
});

test('opaque script execution is surfaced when side effects cannot be proven from the command', () => {
  for (const command of [
    'node scripts/custom.js',
    'python tools/custom.py',
    'bash scripts/custom.sh',
    './scripts/custom.sh',
    'npm run custom-task',
    'make custom-target',
  ]) assert.equal(classify(command).opaqueEffects, true, command);

  for (const command of [
    'node --check src/index.js',
    'node scripts/test-runner.js',
    'python build.py',
    './scripts/build.sh',
    'npm run lint',
    'make test',
    'npm start',
    'npm run dev',
    'npm run migrate',
    'git status --short',
  ]) assert.equal(classify(command).opaqueEffects, false, command);
});

test('command-bearing programs and unknown shell actions expose unverifiable test effects', () => {
  for (const command of [
    "awk 'BEGIN { system(\"npm test\") }'",
    "rg --pre 'npm test' parser .",
    "rg --pre='npm test' parser .",
    "php -r 'system(\"npm test\");'",
    "lua -e 'os.execute(\"npm test\")'",
    "tar --checkpoint=1 --checkpoint-action=exec='npm test' -cf out.tar src",
    "git -c alias.verify='!npm test' verify",
    "git -c diff.external='npm test' diff",
    "GIT_EXTERNAL_DIFF='npm test' git diff",
    "GIT_SSH_COMMAND='npm test' git ls-remote origin",
    "NODE_OPTIONS='--require ./test-hook.js' node --check src/index.js",
    "env -i GIT_EXTERNAL_DIFF='npm test' git diff",
    "env -u CI GIT_EXTERNAL_DIFF='npm test' git diff",
    "sudo -u runner GIT_EXTERNAL_DIFF='npm test' git diff",
    "command GIT_EXTERNAL_DIFF='npm test' git diff",
    "env 'GIT_EXTERNAL_DIFF=npm test' git diff",
    "sudo -u runner 'GIT_EXTERNAL_DIFF=npm test' git diff",
    'rg -n parser *',
    'rg -n parser src/{a,b}.js',
    'git ls-remote origin refs/heads/*',
    "sh -c 'rg -n parser *'",
    "eval 'rg -n parser *'",
    'rg -n parser @(src)',
    'rg -n parser +(src)',
    'rg -n parser !(vendor)',
    'rg -n parser <(printf src)',
    "sh -c 'rg -n parser <(printf src)'",
    "sed 's/x/npm test/e' file",
    "sed -n '1e npm test' file",
    "awk -v cmd='npm test' 'BEGIN { cmd | getline }'",
    "awk 'BEGIN { cmd=\"npm test\"; print \"x\" | cmd }'",
    'npm run lint',
    'npm run typecheck',
    'pnpm lint',
    'yarn typecheck',
    'bun run lint',
    'make lint',
  ]) {
    const action = classify(command);
    assert.equal(action.unverifiableTestEffects, true, command);
  }

  for (const command of [
    "rg 'parser' src",
    "rg -n parser '*.js'",
    'rg -n parser \\*.js',
    'git status --short',
    'cp README.md README.copy.md',
    'git ls-remote origin refs/heads/main',
    "sh -c 'rg -n parser src'",
    "sh -c \"rg -n parser '*.js'\"",
    "rg -n parser 'a<(b'",
    'rg -n parser \\<\\(literal',
  ]) assert.equal(classify(command).unverifiableTestEffects, false, command);

  assert.equal(classify("awk '{ print $1 }' data.txt").unverifiableTestEffects, true);

  assert.equal(classify('custom-local-cli --check').unverifiableTestEffects, true);
  assert.equal(classify('CI=1 rg parser src').unverifiableTestEffects, true);
});

test('common network and database clients always require network authority', () => {
  for (const command of [
    'ping -c 1 127.0.0.1',
    'nc -z localhost 5432',
    'netcat -z localhost 6379',
    'telnet localhost 25',
    'openssl s_client -connect example.com:443',
    'dig example.com',
    'nslookup example.com',
    `psql -d app -c 'SELECT 1'`,
    `mysql app -e 'SELECT 1'`,
    'redis-cli GET health',
    `mongosh app --eval 'db.health.findOne()'`,
  ]) assert.equal(classify(command).networkAccess, true, command);
});

test('unknown native and shell automation exposes unverifiable network effects', () => {
  for (const command of [
    'custom-native --probe',
    '/opt/tools/custom-native --probe',
    'node scripts/custom.js',
    'python tools/custom.py',
    './scripts/custom.sh',
    'npm run custom-task',
    'make custom-target',
    'npm test',
    'npm run build',
    'npm run format',
    'make test',
    'make build',
    'node scripts/build.js',
    'python build.py',
    'cargo build',
    'cargo test',
    'go build ./...',
    'go test ./...',
    'mvn verify',
    './gradlew check',
  ]) assert.equal(classify(command).unverifiableNetworkEffects, true, command);

  for (const command of [
    'git status --short',
    'rg -n route src',
    'touch generated.txt',
    `node -e "require('fs').writeFileSync('x', 'y')"`,
    'node --check src/index.js',
    'eslint src',
    'ruff check .',
    'git diff --stat',
  ]) assert.equal(classify(command).unverifiableNetworkEffects, false, command);
});

test('repository-controlled automation exposes unverifiable workspace effects', () => {
  for (const command of [
    'npm test',
    'npm run build',
    'npm run format',
    'npm run lint',
    'make test',
    'make package',
    'node scripts/build.js',
    'python tools/package.py',
    './test.sh',
    './scripts/setup.sh',
    'cargo build',
    'go test ./...',
    'mvn verify',
    './gradlew check',
  ]) assert.equal(classify(command).unverifiableWorkspaceEffects, true, command);

  for (const command of [
    'git status --short',
    'rg -n route src',
    'node --check src/index.js',
    'eslint src',
    'ruff check .',
    'custom-native --probe',
  ]) assert.equal(classify(command).unverifiableWorkspaceEffects, false, command);
});

test('high-frequency deployment CLIs are external writes while read probes stay observational', () => {
  for (const command of [
    'vercel deploy --prod',
    'netlify deploy --prod',
    'firebase deploy',
    'flyctl deploy',
    'pulumi up --yes',
    'ansible-playbook deploy.yml',
    'nomad job run deploy.nomad',
    'glab release create v1.0.0',
    'heroku releases:rollback',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, true, command);
  }
  assert.equal(classify('heroku releases:rollback').irreversible, true);

  for (const command of [
    'netlify status',
    'firebase projects:list',
    'flyctl status',
    'pulumi preview',
    'nomad job status app',
    'glab release view v1.0.0',
    'heroku releases',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, false, command);
  }
  for (const command of ['vercel --version', 'ansible-playbook --syntax-check deploy.yml']) {
    const action = classify(command);
    assert.equal(action.networkAccess, false, command);
    assert.equal(action.externalWrite, false, command);
    assert.equal(action.workspaceWrite, false, command);
  }
});

test('database CLI mutations are external writes while read queries remain observations', () => {
  for (const command of [
    `psql -d app -c 'INSERT INTO jobs(id) VALUES (1)'`,
    `psql --command='UPDATE jobs SET done = true' app`,
    `mysql app -e 'DELETE FROM jobs WHERE id = 1'`,
    `mysql --execute='CREATE TABLE jobs(id int)' app`,
    'redis-cli SET health ok',
    'redis-cli HSET user:1 name Ada',
    `mongosh app --eval 'db.users.insertOne({name:"Ada"})'`,
    `mongosh app --eval 'db.users.updateOne({id:1}, {$set:{ok:true}})'`,
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, true, command);
  }

  for (const command of [
    `psql -d app -c 'SELECT * FROM jobs'`,
    `mysql app -e 'SHOW TABLES'`,
    'redis-cli GET health',
    'redis-cli INFO',
    `mongosh app --eval 'db.users.find({id:1})'`,
    `mongosh app --eval 'db.users.countDocuments({})'`,
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, false, command);
    assert.equal(action.workspaceWrite, false, command);
  }
});

test('destructive database CLI operations require irreversible approval', () => {
  for (const command of [
    `psql -d app -c 'DELETE FROM jobs'`,
    `psql -d app -c 'DROP TABLE jobs'`,
    `mysql app -e 'TRUNCATE TABLE jobs'`,
    'redis-cli FLUSHALL',
    'redis-cli DEL health',
    `mongosh app --eval 'db.users.deleteMany({})'`,
    `mongosh app --eval 'db.dropDatabase()'`,
  ]) {
    const action = classify(command);
    assert.equal(action.externalWrite, true, command);
    assert.equal(action.irreversible, true, command);
  }
});

test('remote transfer direction and SSH command semantics distinguish reads from writes', () => {
  for (const command of [
    'scp artifact.tar user@example.com:/srv/releases/',
    'rsync -av dist/ user@example.com:/srv/app/',
    'sftp user@example.com',
    `ssh user@example.com 'systemctl restart app'`,
    'ssh user@example.com custom-remote-command',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, true, command);
  }

  for (const command of [
    'scp user@example.com:/srv/app/config.json ./config.json',
    'rsync -av user@example.com:/srv/app/logs/ ./logs/',
    `ssh user@example.com 'cat /etc/os-release'`,
    'ssh user@example.com git show HEAD',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, false, command);
  }
  for (const command of [
    `ssh user@example.com 'cat /etc/os-release'`,
    'ssh user@example.com git show HEAD',
  ]) assert.equal(classify(command).workspaceWrite, false, command);
});

test('remote deletion and rsync --delete require irreversible approval', () => {
  for (const command of [
    'rsync -av --delete dist/ user@example.com:/srv/app/',
    'rsync -av --delete user@example.com:/srv/app/ ./mirror/',
    `ssh user@example.com 'rm -rf /srv/app/cache'`,
    `ssh user@example.com 'find /srv/app/cache -type f -delete'`,
  ]) {
    const action = classify(command);
    assert.equal(action.irreversible, true, command);
  }
});

test('framework migration runners require network awareness and irreversible approval', () => {
  for (const command of [
    'alembic upgrade head',
    'npx prisma migrate deploy',
    'bundle exec rails db:migrate',
    './bin/rails db:rollback',
    'php artisan migrate',
    'dotnet ef database update',
    'flyway migrate',
    'liquibase update',
    'diesel migration run',
    'typeorm migration:run',
    'knex migrate:latest',
    'sequelize db:migrate',
    'dbmate up',
    'goose up',
    'atlas migrate apply',
    'python manage.py migrate',
    './manage.py migrate',
  ]) {
    const action = classify(command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.irreversible, true, command);
  }
});

test('agent CLI execution is delegated work while probes remain ordinary observations', () => {
  for (const command of [
    `codex exec 'Inspect the project'`,
    `omp -p 'Inspect the project'`,
    `omp --prompt 'Inspect the project'`,
    `pi -p 'Inspect the project'`,
    `pi --prompt='Inspect the project'`,
    `claude -p 'Inspect the project'`,
    `opencode run 'Inspect the project'`,
    `gemini -p 'Inspect the project'`,
    `aider --message 'Inspect the project'`,
    `goose run 'Inspect the project'`,
    `amp -x 'Inspect the project'`,
    `cursor-agent -p 'Inspect the project'`,
    `q chat --no-interactive 'Inspect the project'`,
  ]) {
    const action = classify(command);
    assert.equal(action.subagent, true, command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.opaqueEffects, true, command);
  }

  for (const command of [
    'codex --version',
    'codex --help',
    'omp --version',
    'omp models',
    'pi --help',
    'claude --version',
    'opencode models',
    'gemini --version',
    'aider --help',
    'goose --version',
    'amp --help',
    'cursor-agent --version',
    'q --help',
  ]) {
    const action = classify(command);
    assert.equal(action.subagent, false, command);
    assert.equal(action.networkAccess, false, command);
    assert.equal(action.workspaceWrite, false, command);
    assert.equal(action.opaqueEffects, false, command);
    assert.equal(action.unverifiableNetworkEffects, false, command);
  }
});

test('interactive agent CLI sessions are delegated after probe and admin exclusions', () => {
  for (const command of [
    'codex',
    'pi',
    'claude',
    'opencode',
    'gemini',
    'aider src/router.js',
    'goose session',
    'amp',
    'cursor-agent',
    'q chat',
    'omp',
    'omp session',
  ]) {
    const action = classify(command);
    assert.equal(action.subagent, true, command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.opaqueEffects, true, command);
  }

  for (const command of [
    'omp plugin list',
    'omp plugin upgrade omp-enhancer-core',
    'omp config',
    'omp models',
    'omp read skill://security-review',
  ]) assert.equal(classify(command).subagent, false, command);
});

test('additional test runners are recognized without confusing lint and build commands', () => {
  for (const command of [
    'tox',
    '/usr/bin/tox -q',
    'python -m nox',
    'bundle exec rspec',
    './vendor/bin/phpunit',
    'mix test',
    'swift test',
    'bazel test //...',
    'npx playwright test',
    'pnpm exec cypress run',
    'npm exec mocha',
    'flutter test',
    'zig build test',
    'python -m unittest',
    'nose2',
    'behave',
    'robot tests/',
    'dotnet vstest tests.dll',
    'xcodebuild test -scheme App',
    'sbt test',
    'lein test',
    'mvn verify',
    './mvnw verify',
    'gradle check',
    './gradlew check',
    'make check',
  ]) assert.equal(classify(command).testExecution, true, command);

  for (const command of [
    'ruff check .',
    'mix compile',
    'swift build',
    'bazel build //...',
    'npx playwright --version',
    'pnpm exec cypress version',
    'flutter build web',
    'zig build',
    'python -m compileall src',
    'dotnet build',
    'xcodebuild build -scheme App',
    'sbt compile',
    'lein uberjar',
    'mvn package',
    'gradle build',
    'make lint',
  ]) assert.equal(classify(command).testExecution, false, command);
});

test('read commands with output-file flags are definite workspace mutations', () => {
  for (const command of [
    'git diff --output diff.patch',
    'git show --output=commit.txt HEAD',
    'git log --output history.txt',
    'find . -type f -fprint files.txt',
    `find . -type f -fprintf files.txt '%p\\n'`,
    'find . -type f -fls files.ls',
    'find . -type f -fprint0 files.bin',
    'curl -o response.json https://example.com',
    'curl --output=response.json https://example.com',
    'curl -O https://example.com/archive.tgz',
    'curl --remote-name https://example.com/archive.tgz',
    'curl --remote-header-name -O https://example.com/download',
    'curl --remote-name-all https://example.com/a https://example.com/b',
  ]) {
    const action = classify(command);
    assert.equal(action.workspaceWrite, true, command);
    assert.equal(action.definiteWorkspaceMutation, true, command);
  }

  for (const command of [
    'git diff',
    'git show HEAD',
    'git log -n 5',
    'find . -type f -print',
    `find . -type f -printf '%p\\n'`,
    'find . -type f -ls',
    'curl https://example.com',
    'curl --output - https://example.com',
  ]) {
    const action = classify(command);
    assert.equal(action.workspaceWrite, false, command);
    assert.equal(action.definiteWorkspaceMutation, false, command);
  }
});

test('piped deletion and disk-formatting commands require irreversible approval', () => {
  for (const command of [
    'find cache -type f -print0 | xargs -0 rm -f',
    `printf '%s\\0' cache/a cache/b | xargs -0 rm -f`,
    'find cache -type f -print0 | parallel -0 rm',
    'parallel rm ::: cache/a cache/b',
    'dd if=/dev/zero of=disk.img bs=1M count=1',
    'wipefs -a /dev/sdb',
    'mkfs.ext4 /dev/sdb',
    'mkfs -t ext4 /dev/sdb',
    'docker compose down -v',
    'docker-compose down --volumes',
    'podman volume rm app-data',
    'podman volume prune -f',
  ]) assert.equal(classify(command).irreversible, true, command);

  for (const command of [
    'find cache -type f -print0',
    `printf '%s\\n' cache/a | xargs echo`,
    'parallel echo ::: cache/a cache/b',
    'dd if=input.bin status=none',
    'wipefs --no-act /dev/sdb',
    'mkfs.ext4 --help',
    'docker compose down',
    'docker-compose stop',
    'podman volume ls',
    'podman volume inspect app-data',
  ]) assert.equal(classify(command).irreversible, false, command);
});

test('release verification commands are exact read-only network observations', () => {
  for (const command of [
    'npm view package-name version',
    'npm info package-name version',
    'npm view package-name@1.2.3 version --registry https://registry.npmjs.org',
    'npm view package-name dist-tags --json --registry https://registry.npmjs.org',
    'npm view @scope/package-name dist-tags --registry=https://registry.npmjs.org --json',
    'omp plugin list --json',
    'docker manifest inspect registry.example.com/app:1',
    'docker buildx imagetools inspect registry.example.com/app:1',
    'gh release view v1.0.0 --json tagName,isDraft',
    'kubectl get deployment/web -o json',
    'helm status web --namespace prod',
    'git ls-remote origin refs/heads/main',
  ]) {
    const action = classify(command);
    assert.equal(action.workspaceWrite, false, command);
    assert.equal(action.definiteWorkspaceMutation, false, command);
    assert.equal(action.opaqueEffects, false, command);
    assert.equal(action.networkAccess, true, command);
    assert.equal(action.externalWrite, false, command);
  }

  for (const command of [
    'npm view package-name dist-tags',
    'npm view package-name dist-tags --json',
    'npm view package-name dist-tags --registry https://registry.npmjs.org',
    'npm view package-name dist-tags --json --registry http://registry.npmjs.org',
    'npm info package-name dist-tags --json --registry https://registry.npmjs.org',
  ]) assert.equal(classify(command).workspaceWrite, true, command);
});

function pick(action) {
  return { networkAccess: action.networkAccess, externalWrite: action.externalWrite };
}
