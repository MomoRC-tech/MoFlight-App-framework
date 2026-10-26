import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,AppState,Animated,Easing,Pressable,StyleSheet,View} from 'react-native';
import {Label,colors} from './theme';
import {SymbolIcon} from './SymbolIcon';
import {syncStageText,type SyncProgress as Progress,type IdleSyncNotice} from './sync-progress';
import {reduceSyncEstimate,snapshotSyncEstimate,syncEstimateNow,type SyncEstimateState} from './sync-estimate';
import {SYNC_RING_SIZE,SYNC_RING_STROKE,syncRingSegments,type SyncRingSegment} from './sync-progress-geometry';

export function useReducedMotion(){
  const [reduced,setReduced]=useState(true);
  useEffect(()=>{let current=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(current)setReduced(value);}).catch(()=>{});
    const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{current=false;sub.remove();};},[]);
  return reduced;
}
export function useForeground(){
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>setForeground(state==='active'));return()=>sub.remove();},[]);
  return foreground;
}
export function SyncShine({active}:{active:boolean}){
  active=useForeground()&&active;
  const reduced=useReducedMotion(),position=useRef(new Animated.Value(0)).current;
  useEffect(()=>{position.setValue(0);if(!active||reduced)return;const animation=Animated.loop(Animated.timing(position,{toValue:1,duration:2200,easing:Easing.linear,useNativeDriver:true}));animation.start();return()=>animation.stop();},[active,reduced,position]);
  if(!active||reduced)return null;
  return <Animated.View pointerEvents="none" accessible={false} style={[styles.shine,{transform:[{translateX:position.interpolate({inputRange:[0,1],outputRange:[-60,170]})},{skewX:'-20deg'}]}]}/>;
}
/** The only timer lives in these small display leaves, never in the library coordinator. */
export function useSyncEstimateDisplay(estimate:SyncEstimateState|undefined,foreground:boolean){
  const [local,setLocal]=useState({source:estimate,value:estimate});
  const current=local.source===estimate?local.value:estimate;
  // Count evidence may replace an elapsed projection with a smaller fraction.
  // Keep that correction in the model while preserving the already displayed
  // estimate for this attempt; it must never alter learned duration samples.
  const displayed=useRef<{runId:string;scope:string;fraction:number}|null>(null);
  if(!current||current.fraction===null)displayed.current=null;
  else displayed.current={runId:current.runId,scope:current.scope,fraction:
    displayed.current?.runId===current.runId&&displayed.current.scope===current.scope?Math.max(displayed.current.fraction,current.fraction):current.fraction};
  const latest=useRef(current);latest.current=current;
  useEffect(()=>{
    const initial=latest.current;
    if(!foreground||!initial||initial.status!=='active'||initial.fraction===null)return;
    const startedAt=syncEstimateNow();let current=true;
    const timer=setInterval(()=>{if(!current)return;setLocal(previous=>{
      const value=previous.source===estimate?previous.value:estimate;
      return {source:estimate,value:value?reduceSyncEstimate(value,{type:'tick',runId:value.runId,at:initial.now+Math.max(0,syncEstimateNow()-startedAt)}):value};
    });},500);
    return()=>{current=false;clearInterval(timer);};
  },[estimate,foreground]);
  return current?{...snapshotSyncEstimate(current),fraction:displayed.current?.fraction??current.fraction}:null;
}
function estimateText(value:ReturnType<typeof snapshotSyncEstimate>|null){
  return value?.estimated&&value.fraction!==null?`Gesamt ca. ${Math.floor(value.fraction*100)} %${value.overrun?' · Dauert länger als erwartet':''}`:'';
}
function WaveSegments({segments,color}:{segments:readonly SyncRingSegment[];color:string}){
  return <>{segments.map((segment,index)=>{
    // Overlapping round caps form a continuous stroke through every wave join.
    const width=segment.length+SYNC_RING_STROKE;
    return <View key={index} style={{position:'absolute',width,height:SYNC_RING_STROKE,borderRadius:SYNC_RING_STROKE/2,
      left:(segment.from.x+segment.to.x)/2-width/2,top:(segment.from.y+segment.to.y)/2-SYNC_RING_STROKE/2,
      backgroundColor:color,transform:[{rotate:`${segment.angle}deg`}]}}/>;
  })}</>;
}
/** Unknown work rotates a wavy arc; known estimates use their actual path fraction. */
export function SyncActivityIndicator({progress}:{progress?:Progress}={}){
  const reduced=useReducedMotion(),foreground=useForeground(),rotation=useRef(new Animated.Value(0)).current;
  const estimate=useSyncEstimateDisplay(progress?.estimate,foreground&&(!progress||progress.state==='active'));
  const fraction=estimate?.fraction??null,working=!progress||progress.state==='active';
  useEffect(()=>{rotation.setValue(0);if(reduced||!foreground||!working||fraction!==null)return;const animation=Animated.loop(Animated.timing(rotation,{toValue:1,duration:1200,easing:Easing.linear,useNativeDriver:true}));animation.start();return()=>animation.stop();},[reduced,foreground,working,fraction,rotation]);
  const known=fraction!==null,value=known?Math.max(0,Math.min(estimate?.status==='success'?1:.99,fraction)):.28;
  return <View testID={known?'sync-estimated-ring':'sync-activity-ring'} accessible={false} importantForAccessibility="no-hide-descendants" style={styles.ringFrame}>
    {known&&<WaveSegments segments={syncRingSegments(1)} color={colors.border}/>}
    {known?<WaveSegments segments={syncRingSegments(value)} color={colors.cyan}/>:
      <Animated.View style={[styles.ringFrame,{transform:[{rotate:rotation.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']})}]}]}>
        <WaveSegments segments={syncRingSegments(value)} color={colors.cyan}/>
      </Animated.View>}
  </View>;
}
function SyncCurrentLine({current,estimate,active}:{current:string;estimate?:SyncEstimateState;active:boolean}){
  const value=useSyncEstimateDisplay(estimate,active),suffix=estimateText(value);
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Label style={styles.current}>{current}{suffix?` · ${suffix}`:''}</Label></View>;
}
/** Work retains two semantic rows; settled advice has explicit Details and no acknowledgement. */
export function SyncProgress({progress,notice=null,retry,details,cancel,canCancel=false}:{progress:Progress;notice?:IdleSyncNotice|null;retry:()=>void;details:()=>void;cancel?:()=>void;canCancel?:boolean}){
  const reduced=useReducedMotion(),reveal=useRef(new Animated.Value(0)).current,pulse=useRef(new Animated.Value(1)).current;
  const foreground=useForeground();
  const working=progress.state==='active'||progress.state==='waiting';
  const visible=progress.state!=='idle'||notice!==null,active=foreground&&progress.state==='active';
  const [mounted,setMounted]=useState(visible);
  useEffect(()=>{if(visible)setMounted(true);const animation=Animated.timing(reveal,{toValue:visible?1:0,duration:reduced?0:180,useNativeDriver:true});animation.start(({finished})=>{if(finished&&!visible)setMounted(false);});return()=>animation.stop();},[visible,reduced,reveal]);
  useEffect(()=>{pulse.setValue(1);if(!active||reduced)return;const animation=Animated.loop(Animated.sequence([Animated.timing(pulse,{toValue:.65,duration:850,useNativeDriver:true}),Animated.timing(pulse,{toValue:1,duration:850,useNativeDriver:true})]));animation.start();return()=>animation.stop();},[active,reduced,pulse]);
  if(!mounted)return null;
  const failed=progress.state==='failed'||progress.state==='partial';
  const current=progress.message??(progress.current?syncStageText(progress.current,false,progress.count):'Wird fortgesetzt …');
  const spokenEstimate=estimateText(progress.estimate?snapshotSyncEstimate(progress.estimate):null);
  if(!working){
    const localFailure=notice?.kind==='read-error';
    const caption=localFailure?notice.caption:failed?(progress.state==='partial'?'Teilweise aktualisiert':'Synchronisierung fehlgeschlagen'):notice?.caption;
    const description=localFailure?notice.description:failed?current:notice?.description;
    if(!caption)return null;
    return <View testID="sync-notice" style={[styles.box,styles.notice]}>
      <View accessible accessibilityLabel={`${caption}. ${description??''}`} style={styles.noticeCopy}><Label style={styles.noticeLabel}>{caption}</Label></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${caption}. Details öffnen. ${description??''}`} onPress={details} style={styles.action}><Label style={styles.link}>Details</Label></Pressable>
      {failed&&!localFailure&&<Pressable accessibilityRole="button" accessibilityLabel="Synchronisierung erneut versuchen" onPress={retry} style={styles.action}><SymbolIcon name="refresh" size={22}/></Pressable>}
    </View>;
  }
  return <Animated.View testID="sync-progress" style={[styles.box,{opacity:reveal,transform:[{translateY:reveal.interpolate({inputRange:[0,1],outputRange:[-12,0]})}]}]}>
    <View style={cancel?{paddingRight:48}:undefined} accessibilityLiveRegion="polite" accessible accessibilityLabel={`${progress.last?syncStageText(progress.last,true,progress.lastCount)+' ':''}${current}${spokenEstimate?`. ${spokenEstimate}`:''}`}>
      <Label style={styles.previous}>{progress.last?`✓ ${syncStageText(progress.last,true,progress.lastCount)}`:' '}</Label>
      <Animated.View style={{opacity:pulse}}><SyncCurrentLine current={current} estimate={progress.estimate} active={active}/></Animated.View>
    </View>
    {cancel&&<Pressable accessibilityRole="button" accessibilityLabel="Synchronisierung abbrechen" disabled={!canCancel} accessibilityState={{disabled:!canCancel}} onPress={cancel} style={styles.cancel}><SymbolIcon name="close" size={20}/></Pressable>}
  </Animated.View>;
}
const styles=StyleSheet.create({
  box:{width:'100%',maxWidth:960,alignSelf:'center',paddingHorizontal:18,paddingVertical:6,backgroundColor:colors.card,borderBottomWidth:1,borderColor:colors.border,borderBottomLeftRadius:12,borderBottomRightRadius:12},
  previous:{fontSize:11,lineHeight:16,color:colors.muted},current:{fontSize:12,lineHeight:18,color:colors.text},
  notice:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8},
  noticeCopy:{flexGrow:1,flexShrink:1,flexBasis:140},
  noticeLabel:{fontSize:14,lineHeight:20,color:'#ffc477'},
  link:{fontSize:14,lineHeight:20,color:colors.cyan},
  action:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},
  cancel:{position:'absolute',right:4,top:0,width:48,minHeight:48,alignItems:'center',justifyContent:'center'},
  shine:{position:'absolute',top:0,bottom:0,width:28,backgroundColor:'#baf9e436',borderLeftWidth:1,borderRightWidth:1,borderColor:'#d5ffee70'},
  ringFrame:{width:SYNC_RING_SIZE,height:SYNC_RING_SIZE},
});
