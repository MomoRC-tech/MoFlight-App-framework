/** Internal, disposable proof reuse for one Sync. Never serialised or used as
 * authorization: callers must freshly read/check owner, selection and content.
 * Only successful semantic validation may remember a text. */
export type VerificationIdentity = Readonly<{ownerId:string;storeId:string;leaseId:string}>;
export class SyncVerificationScope {
  private closed=false;
  private graph:string|null=null;
  private commands=new Set<string>();
  private commandCharacters=0;
  private readonly identity:VerificationIdentity;
  private hits={graph:0,commands:0};
  // Bounds are UTF-16 code units: at most ~16 MiB of retained text in total.
  private readonly limit=4*1024*1024;
  constructor(identity:VerificationIdentity){this.identity={ownerId:identity.ownerId,storeId:identity.storeId,leaseId:identity.leaseId};}
  private matches(identity:VerificationIdentity){return !this.closed&&identity.ownerId===this.identity.ownerId&&identity.storeId===this.identity.storeId&&identity.leaseId===this.identity.leaseId;}
  activeFor(identity:VerificationIdentity){return this.matches(identity);}
  canCompareGraph(identity:VerificationIdentity,graph:{manifest:unknown;receipts:unknown;records:unknown}){
    if(!this.matches(identity)||this.graph===null||!Array.isArray(graph.receipts)||!Array.isArray(graph.records)||graph.receipts.length+graph.records.length>20_000)return false;
    let characters=0;
    for(const rows of [[graph.manifest],graph.receipts,graph.records])for(const row of rows){
      if(!row||typeof row!=='object'||Array.isArray(row))return false;
      for(const value of Object.values(row)){
        if(typeof value==='string')characters+=value.length;
        else if(typeof value!=='number'&&value!==null)return false;
        if(characters>this.limit)return false;
      }
    }
    return true;
  }
  hasGraph(identity:VerificationIdentity,text:string){const found=this.matches(identity)&&this.graph===text;if(found)this.hits.graph++;return found;}
  rememberGraph(identity:VerificationIdentity,text:string){if(this.matches(identity))this.graph=text.length<=this.limit?text:null;}
  hasCommand(identity:VerificationIdentity,text:string){const found=this.matches(identity)&&this.commands.has(text);if(found)this.hits.commands++;return found;}
  rememberCommand(identity:VerificationIdentity,text:string){
    if(!this.matches(identity)||text.length>this.limit||this.commands.has(text))return;
    while(this.commands.size>=128||this.commandCharacters+text.length>this.limit){
      const first=this.commands.values().next().value;if(first===undefined)break;
      this.commands.delete(first);this.commandCharacters-=first.length;
    }
    this.commands.add(text);this.commandCharacters+=text.length;
  }
  snapshot(){return {graphHits:this.hits.graph,commandHits:this.hits.commands};}
  close(){this.closed=true;this.graph=null;this.commands.clear();this.commandCharacters=0;}
}
