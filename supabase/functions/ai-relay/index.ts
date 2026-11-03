import {createEdgeRelay} from './edge-entry.ts';

const handler=await createEdgeRelay({get:name=>Deno.env.get(name)});
Deno.serve({onListen:()=>{}},handler);
