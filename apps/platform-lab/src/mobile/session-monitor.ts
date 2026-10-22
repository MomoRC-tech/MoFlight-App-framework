/** Foreground-only session checks; never a data-retrieval scheduler. */
export function startSessionMonitor(ports: {
  active: boolean;
  subscribe: (changed: (active: boolean) => void) => () => void;
  check: (current: () => boolean) => Promise<void>;
  schedule: (callback: () => void, milliseconds: number) => () => void;
}) {
  let active=ports.active, stopped=false, generation=0;
  let cancel:(()=>void)|undefined;
  const run=async()=>{
    const version=++generation;
    const current=()=>!stopped&&active&&version===generation;
    if(!current())return;
    try{await ports.check(current);}finally{
      if(current())cancel=ports.schedule(()=>{cancel=undefined;void run();},60_000);
    }
  };
  const unsubscribe=ports.subscribe(next=>{
    if(next===active)return;
    active=next;generation++;cancel?.();cancel=undefined;
    if(active)void run();
  });
  if(active)void run();
  return()=>{stopped=true;generation++;cancel?.();unsubscribe();};
}
