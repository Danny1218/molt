import chokidar from 'chokidar';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let isRunning = false;

// File watcher for new strategies
export function watchStrategies(port, broadcast) {
  const strategiesPath = join(__dirname, '../data/tripwire/strategies');
  const inboxPath = join(__dirname, '../data/tripwire/repair/inbox.json');

  const watcher = chokidar.watch(strategiesPath, {
    ignoreInitial: true,
    persistent: true
  });

  watcher.on('add', async (path) => {
    // Only trigger on new _test.md files (not v1)
    if (!path.endsWith('_test.md') || path.includes('v1_test.md')) {
      return;
    }

    // Check if we have a repair inbox waiting
    if (!existsSync(inboxPath)) {
      console.log('New strategy detected but no repair inbox found');
      return;
    }

    if (isRunning) {
      console.log('Test already running, skipping...');
      return;
    }

    try {
      isRunning = true;
      
      console.log(`New strategy detected: ${path}`);
      console.log('Automatically re-running TRIPWIRE...');

      broadcast?.({ type: 'auto_rerun', strategy_file: path });

      const { runTripwire } = await import('./runner.js');
      const result = await runTripwire(port, broadcast);

      // Clear inbox after successful run
      await unlink(inboxPath).catch(() => {});

      console.log(`Auto-rerun completed with status: ${result.evaluation.passed ? 'PASS' : 'FAIL'}`);

    } catch (err) {
      console.error('Auto-rerun failed:', err);
      broadcast?.({ type: 'auto_rerun_error', error: err.message });
    } finally {
      isRunning = false;
    }
  });

  console.log('Strategy watcher initialized');
  return watcher;
}
