import { readFile, stat, writeFile } from 'node:fs/promises';
import { summarizeDiagnosticTiming } from '../apps/platform-lab/src/diagnostic-timing.ts';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length) throw new Error('Usage: node --import tsx scripts/flight_loading_timing.ts INPUT.json OUTPUT.json');
if ((await stat(input)).size > 490_000) throw new Error('Diagnostic report exceeds supported size');
const text = await readFile(input, 'utf8');
if (Buffer.byteLength(text) > 490_000) throw new Error('Diagnostic report exceeds supported size');
const report = summarizeDiagnosticTiming(JSON.parse(text));
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.info('Timing-only report written; inclusive phases are not summed.');
