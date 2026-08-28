#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function inspectInbox() {
  const inboxPath = join(__dirname, '../data/tripwire/repair/inbox.json');

  if (!existsSync(inboxPath)) {
    console.log('No repair inbox found. System has not failed yet.');
    console.log('Run TRIPWIRE from the dashboard to execute strategy v1.');
    return;
  }

  try {
    const inbox = JSON.parse(await readFile(inboxPath, 'utf-8'));

    console.log('═══════════════════════════════════════════════════════');
    console.log('TRIPWIRE REPAIR INBOX');
    console.log('═══════════════════════════════════════════════════════');
    console.log();
    console.log(`Status: ${inbox.status}`);
    console.log(`Run ID: ${inbox.run_id}`);
    console.log(`Timestamp: ${inbox.timestamp}`);
    console.log(`Repair Count: ${inbox.repair_count} / ${inbox.max_repairs}`);
    console.log();
    console.log('───────────────────────────────────────────────────────');
    console.log('USER INTENT');
    console.log('───────────────────────────────────────────────────────');
    console.log(JSON.stringify(inbox.intent, null, 2));
    console.log();
    console.log('───────────────────────────────────────────────────────');
    console.log('CURRENT STRATEGY');
    console.log('───────────────────────────────────────────────────────');
    console.log(`Version: ${inbox.strategy.version}`);
    console.log(`File: ${inbox.strategy.version}_test.md`);
    console.log();
    console.log('───────────────────────────────────────────────────────');
    console.log('KANE RESULT');
    console.log('───────────────────────────────────────────────────────');
    console.log(`Status: ${inbox.kane_result.status}`);
    console.log(`Summary: ${inbox.kane_result.summary}`);
    if (inbox.kane_result.reason) {
      console.log(`Reason: ${inbox.kane_result.reason}`);
    }
    console.log();
    console.log('Final State:');
    console.log(JSON.stringify(inbox.kane_result.final_state || {}, null, 2));
    console.log();
    console.log('───────────────────────────────────────────────────────');
    console.log('EVALUATION - ATTACK RESULTS');
    console.log('───────────────────────────────────────────────────────');
    inbox.evaluation.findings.forEach(finding => {
      const icon = finding.passed ? '✓' : '✗';
      const status = finding.passed ? 'PASS' : 'FAIL';
      console.log(`${icon} ${finding.attack}: ${status}`);
      console.log(`   ${finding.detail}`);
    });
    console.log();
    console.log('───────────────────────────────────────────────────────');
    console.log('NEXT STEPS');
    console.log('───────────────────────────────────────────────────────');
    console.log(`1. Write improved strategy: data/tripwire/strategies/${inbox.next_version}_test.md`);
    console.log(`2. File watcher will auto-detect and rerun`);
    console.log(`3. Evidence: ${inbox.evidence_path}`);
    console.log();
    console.log('═══════════════════════════════════════════════════════');

  } catch (err) {
    console.error('Error reading repair inbox:', err.message);
    process.exit(1);
  }
}

inspectInbox();
