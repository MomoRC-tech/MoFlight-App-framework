import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

/** Run the shared, stateless native presentation against the caller's React leaves. */
export function loadFlightPresentation(modules:Record<string,unknown>) {
  const result:Record<string,unknown>={};
  for(const name of ['FlightCard','FlightDetails']) {
    const source=ts.transpileModule(readFileSync(new URL(`../../apps/platform-lab/src/mobile/${name}.tsx`,import.meta.url),'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
    }).outputText;
    const exports:Record<string,unknown>={};
    runInNewContext(source,{exports,require:(id:string)=>{if(!(id in modules))throw new Error(`Unexpected flight presentation dependency ${id}`);return modules[id];}});
    result[`./${name}`]=exports;
  }
  return result;
}
