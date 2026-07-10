import { getCapabilities } from './capabilities.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RevealOptions {
  reducedMotion?: boolean;
  stepMs?: number;
  write?: (s: string) => void;
}

export async function typeReveal(lines: string[], opts: RevealOptions = {}): Promise<void> {
  const write = opts.write ?? ((s: string) => { process.stdout.write(s); });
  const reduced = opts.reducedMotion ?? getCapabilities().reducedMotion;

  if (reduced) {
    write(lines.join('\n') + '\n');
    return;
  }

  const stepMs = opts.stepMs ?? 45;
  for (const line of lines) {
    write(line + '\n');
    await sleep(stepMs);
  }
}
