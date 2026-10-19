// Child-process interruption fixture. Called only with a newly created test file.
import { readFile, lstat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { nodeDriver } from './sqlite-driver.ts';
import { HistoryProofStore, type ProofPermit } from '../../apps/platform-lab/src/vereinsflieger/history-proof-store.ts';
import { PROOF_CANDIDATE } from '../../apps/platform-lab/src/vereinsflieger/history-proof-selection.ts';
import { requireProof, type ImportCommand } from '../../apps/platform-lab/src/vereinsflieger/history-proof-model.ts';
import { proofHash } from './history-proof-host.ts';
const [path,requestPath]=process.argv.slice(2);
requireProof(path&&requestPath&&resolve(path).startsWith(resolve(tmpdir()))&&basename(dirname(path)).startsWith('moflight-history-proof-')&&PROOF_CANDIDATE.test(basename(path)),'Unsafe crash fixture path');
requireProof((await lstat(path)).isFile()&&dirname(requestPath)===dirname(path),'Missing crash fixture');
const c=JSON.parse(await readFile(requestPath,'utf8')) as ImportCommand;
const permit:ProofPermit={mode:'synthetic-only',ownerId:c.ownerId,storeId:c.storeId,leaseId:'fixture-child',scopeIds:[c.capture.scope.scopeId],writable:true};
const store=await HistoryProofStore.open(nodeDriver(path),c.ownerId,c.storeId,proofHash,()=>permit,async stage=>{if(stage==='after-commit') process.exit(27);});
await store.commit(c);
throw new Error('Crash checkpoint was not reached');
