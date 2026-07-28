import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveWorkflowContextTarget } from '../src/workflow-target-files.js';

// Reproduction: symlink-to-file bypass in resolveExistingDirectory
// Bug claim: lstat check allows symlinks pointing to regular files through,
// then realpath resolves to a file path, producing nonsensical join paths.

async function reproduce() {
  const root = await mkdtemp(path.join(tmpdir(), 'symlink-bypass-'));
  
  // Create a regular file
  const realFile = path.join(root, 'target.txt');
  await writeFile(realFile, 'I am a file, not a directory');
  
  // Create a symlink pointing to the file (NOT a directory)
  const symlinkPath = path.join(root, 'symlink-to-file');
  await symlink(realFile, symlinkPath);
  
  console.log('=== Symlink-to-File Bypass Reproduction ===');
  console.log(`Real file: ${realFile}`);
  console.log(`Symlink:   ${symlinkPath}`);
  console.log(`Symlink points to: ${realFile} (a FILE, not a directory)`);
  console.log();
  
  try {
    const result = await resolveWorkflowContextTarget(symlinkPath);
    console.log('BUG CONFIRMED: resolveWorkflowContextTarget returned:');
    console.log(`  result = "${result}"`);
    console.log();
    
    // Show what happens when callers use path.join on this result
    const agentsPath = path.join(result, 'AGENTS.md');
    const catalogPath = path.join(result, 'OMP_ENHANCER_WORKFLOW_CATALOG.md');
    console.log('Downstream path construction (readWorkflowContextTargetFiles):');
    console.log(`  agentsPath   = "${agentsPath}"`);
    console.log(`  catalogPath  = "${catalogPath}"`);
    console.log();
    
    if (result === realFile) {
      console.log('SEVERITY: The returned path IS the file path itself.');
      console.log('  path.join(file.txt, "AGENTS.md") produces a nonsensical path');
      console.log('  that can never resolve to a real file.');
      console.log('  Read operations will silently return null (ENOENT).');
      console.log('  Write operations (mkdir) will throw EEXIST.');
    }
    
    return { confirmed: true, result };
  } catch (error) {
    console.log('FIX ALREADY APPLIED: resolveWorkflowContextTarget threw:');
    console.log(`  ${error.message}`);
    return { confirmed: false, error: error.message };
  }
}

const outcome = await reproduce();
console.log();
console.log(`Bug confirmed: ${outcome.confirmed}`);
process.exit(outcome.confirmed ? 1 : 0);
