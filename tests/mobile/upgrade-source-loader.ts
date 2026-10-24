import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import type * as Fixture from '../../apps/platform-lab/src/development/update-preservation-fixture.ts';

/** Offline historical production modules + explicitly current synthetic inputs. No install/network. */
export function archivedUpgradeWriter(commit: string): typeof Fixture {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Pin a complete historical commit.');
  execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { stdio: 'pipe' });
  const context = createContext({ TextEncoder, TextDecoder, URL, URLSearchParams });
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  function load(path: string): Record<string, unknown> {
    const existing = cache.get(path); if (existing) return existing.exports;
    const source = path.endsWith('/update-preservation-fixture.ts') ? readFileSync(path, 'utf8') :
      execFileSync('git', ['show', `${commit}:${path}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const module = { exports: {} as Record<string, unknown> }; cache.set(path, module);
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const wrapper = runInContext(`(function(module, exports, require) { ${code}\n})`, context, { filename: `${commit}:${path}` });
    wrapper(module, module.exports, (name: string) => {
        if (name === '@moflight/flight-logbook') return load('packages/flight-logbook/src/index.ts');
        if (name === '@moflight/local-data') return load('packages/local-data/src/index.ts');
        if (!name.startsWith('.')) throw new Error(`Unexpected historical fixture dependency: ${name}`);
        const target = posix.normalize(posix.join(posix.dirname(path), name));
        if (target.startsWith('../')) throw new Error('Historical fixture import escapes repository.');
        return load(target.endsWith('.ts') ? target : target + '.ts');
      });
    return module.exports;
  }
  return load('apps/platform-lab/src/development/update-preservation-fixture.ts') as unknown as typeof Fixture;
}
