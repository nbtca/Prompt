import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { env: { XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'nbtca-test-state-')) } },
});
