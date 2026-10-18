from pathlib import Path
import json, subprocess, sys, time
sys.path.insert(0,str(Path.cwd()))
from scripts.ui_agent import Device,read,write,ROOT,RUNS
out=RUNS/'acceptance-20261018'; operator=out/'operator'
adb=Path.home()/'AppData/Local/Android/Sdk/platform-tools/adb.exe'
d=Device(adb,'emulator-5558');d.verify()
before={'display':d.display(),'network':d.network(),'identity':d.identity()};write(operator/'before.json',before)
base=[sys.executable,str(ROOT/'scripts/ui_agent.py')]
build=ROOT/'build/import-preview/android-fixed/build.json'
results=[]
def call(*args,good=True):
 p=subprocess.run([*base,*map(str,args)],capture_output=True,text=True,encoding='utf-8',timeout=90)
 if good and p.returncode:raise RuntimeError(p.stderr+p.stdout)
 return p
for name,seconds,actions in [('idle',7,3),('budget',60,1)]:
 session=out/name
 started=call('start','--serial',d.serial,'--build',build,'--output',session,'--seconds',seconds,'--actions',actions)
 write(operator/(name+'-start.json'),json.loads(started.stdout))
 first=call('action','--session',session,'--json',json.dumps({'op':'viewport','name':'min'}))
 if name=='budget':
  rejected=call('action','--session',session,'--json',json.dumps({'op':'back'}),good=False)
  assert rejected.returncode!=0
  (operator/'budget-rejection.txt').write_text(rejected.stderr,encoding='utf-8')
 until=time.monotonic()+45
 while read(session/'report.json')['status']=='running':
  if time.monotonic()>until:raise TimeoutError('Guardian did not close')
  time.sleep(.2)
 report=read(session/'report.json');expected='timed_out' if name=='idle' else 'action_limit'
 assert report['status']==expected,report
 assert report['actions_used']==1 and report['captures_used']==0
 assert d.display()==before['display'] and d.network()==before['network'] and d.identity()==before['identity']
 # Guardian releases its lock after writing the final report.
 until=time.monotonic()+3
 while (RUNS/'synthetic.lock').exists() and time.monotonic()<until:time.sleep(.05)
 assert not (RUNS/'synthetic.lock').exists()
 results.append({'probe':name,'status':report['status'],'actions_used':report['actions_used'],'restored_and_preserved':True,'report':str(session/'report.json')})
write(operator/'native-probes.json',{'application_build':str(build),'results':results,'original_state':before})
print(json.dumps(results,ensure_ascii=False))
