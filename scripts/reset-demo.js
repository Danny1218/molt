import { rm, mkdir, copyFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function resetDemo() {
  console.log('Resetting TRIPWIRE demo...');

  try {
    // Clear artifacts
    const artifactsPath = join(__dirname, '../artifacts/runs');
    if (existsSync(artifactsPath)) {
      await rm(artifactsPath, { recursive: true, force: true });
      console.log('✓ Cleared run artifacts');
    }
    await mkdir(artifactsPath, { recursive: true });

    // Clear repair inbox
    const inboxPath = join(__dirname, '../data/tripwire/repair');
    if (existsSync(inboxPath)) {
      await rm(inboxPath, { recursive: true, force: true });
      console.log('✓ Cleared repair inbox');
    }

    // Remove all strategies except v1
    const strategiesPath = join(__dirname, '../data/tripwire/strategies');
    const files = await readdir(strategiesPath);
    
    for (const file of files) {
      if (file.endsWith('_test.md') && file !== 'v1_test.md') {
        await rm(join(strategiesPath, file));
        console.log(`✓ Removed strategy: ${file}`);
      }
    }

    console.log('\n✓ Demo reset complete!');
    console.log('Run `npm start` to begin fresh with strategy v1.');

  } catch (err) {
    console.error('Reset failed:', err);
    process.exit(1);
  }
}

resetDemo();
