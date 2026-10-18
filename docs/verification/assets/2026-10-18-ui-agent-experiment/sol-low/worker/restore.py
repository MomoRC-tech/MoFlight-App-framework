from run import *
s=json.loads((O/'before.json').read_text())
try:
 x=(O/'04-development.xml').read_text();log('U08 marker visible in Development viewport: '+str('MOFLIGHT_EXPERIMENT_CONTROL_8F2C' in x))
finally:
 import re
 for key,command in [('size','size'),('density','density')]:
  match=re.search(r'Override (?:size|density):\s*(\S+)',s[key]);sh('wm',command,match.group(1) if match else 'reset');log('restore '+command+' '+(match.group(1) if match else 'reset'))
 sh('settings','put','system','font_scale',s['font']);log('restore font '+s['font'])
 time.sleep(1)
 sh('am','force-stop','de.momorc.moflight.lab');log('force-stop only lab app')
 sh('monkey','-p','de.momorc.moflight.lab','-c','android.intent.category.LAUNCHER','1');log('relaunch only lab app');time.sleep(1)
 a={k:sh(*v) for k,v in {'size':['wm','size'],'density':['wm','density'],'font':['settings','get','system','font_scale'],'package':['dumpsys','package','de.momorc.moflight.lab']}.items()};(O/'after.json').write_text(json.dumps(a));dump();(O/'14-restored-overview.xml').write_bytes((O/'latest.xml').read_bytes());tap('Flüge');dump();(O/'15-restored-flights.xml').write_bytes((O/'latest.xml').read_bytes());tap('Übersicht');dump();(O/'16-final-overview.xml').write_bytes((O/'latest.xml').read_bytes())
