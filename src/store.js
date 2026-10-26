// -----------------------------------------------------------------------------
// The memory of what was already reported, saved under /data.
//
// The container rootfs is read-only: /data is the one writable volume, and it
// survives updates. DATA_DIR overrides it (tests, local runs). A file that
// cannot be read or written is logged and otherwise ignored: losing it only
// means the next read records instead of reporting.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

const FILE = 'memory.json';

export function dataDir() {
  return process.env.DATA_DIR || '/data';
}

export async function loadMemory(dir = dataDir()) {
  try {
    return JSON.parse(await readFile(join(dir, FILE), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn(`Memory file unreadable, starting afresh: ${err.message}`);
    }
    return null;
  }
}

export async function saveMemory(memory, dir = dataDir()) {
  try {
    await mkdir(dir, { recursive: true });
    // Written next to the file then renamed: a stop in the middle never
    // leaves half a file behind.
    const temporary = join(dir, `${FILE}.tmp`);
    await writeFile(temporary, JSON.stringify(memory));
    await rename(temporary, join(dir, FILE));
  } catch (err) {
    logger.warn(`Memory file could not be saved: ${err.message}`);
  }
}
