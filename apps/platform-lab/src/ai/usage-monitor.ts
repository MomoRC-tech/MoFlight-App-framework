import {validateAiBudget,type AiBudget} from '../../../../packages/ai-contracts/src/index.ts';
/** Visible-only read refresh. This has no inference/retry/Send port. */
export class AiUsageMonitor {
 private generation=0;private stopTimer:(()=>void)|null=null;
 constructor(private readonly ports:{read():Promise<unknown>;now():string;updated(value:AiBudget,at:string):void;stale():void;
  schedule(work:()=>void,ms:number):()=>void}) {}
 start() {
  this.stop();const generation=this.generation;let pending=false;
  const tick=async()=>{if(generation!==this.generation||pending)return;pending=true;
   try{const value=validateAiBudget(await this.ports.read());if(generation===this.generation)this.ports.updated(value,this.ports.now());}
   catch{if(generation===this.generation)this.ports.stale();}
   finally{pending=false;}
  };
  this.stopTimer=this.ports.schedule(()=>{void tick();},10000);void tick();
 }
 stop(){this.generation++;this.stopTimer?.();this.stopTimer=null;}
}
