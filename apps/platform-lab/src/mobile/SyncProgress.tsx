import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,AppState,Animated,Easing,Pressable,StyleSheet,View} from 'react-native';
import {Label,colors} from './theme';
import {SymbolIcon} from './SymbolIcon';
import {syncStageText,type SyncProgress as Progress,type IdleSyncNotice} from './sync-progress';

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
/** Flat indeterminate progress in the action; static arc with reduced motion. */
export function SyncActivityIndicator(){
  const reduced=useReducedMotion(),foreground=useForeground(),rotation=useRef(new Animated.Value(0)).current;
  useEffect(()=>{rotation.setValue(0);if(reduced||!foreground)return;const animation=Animated.loop(Animated.timing(rotation,{toValue:1,duration:1200,easing:Easing.linear,useNativeDriver:true}));animation.start();return()=>animation.stop();},[reduced,foreground,rotation]);
  return <Animated.View testID="sync-activity-ring" accessible={false} importantForAccessibility="no" style={[styles.ring,{transform:[{rotate:rotation.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']})}]}]}/>;
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
    <View style={cancel?{paddingRight:48}:undefined} accessibilityLiveRegion="polite" accessible accessibilityLabel={`${progress.last?syncStageText(progress.last,true,progress.lastCount)+' ':''}${current}`}>
      <Label style={styles.previous}>{progress.last?`✓ ${syncStageText(progress.last,true,progress.lastCount)}`:' '}</Label>
      <Animated.View style={{opacity:pulse}}><Label style={styles.current}>{current}</Label></Animated.View>
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
  ring:{width:32,height:32,borderRadius:16,borderWidth:3,borderColor:colors.cyan,borderRightColor:'transparent',borderBottomColor:'transparent'},
});
