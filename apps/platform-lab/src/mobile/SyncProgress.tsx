import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,AppState,Animated,Easing,Pressable,StyleSheet,View} from 'react-native';
import {Label,colors} from './theme';
import {SymbolIcon} from './SymbolIcon';
import {syncLabels,type SyncProgress as Progress} from './sync-progress';

export function useReducedMotion(){
  const [reduced,setReduced]=useState(true);
  useEffect(()=>{let current=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(current)setReduced(value);}).catch(()=>{});
    const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{current=false;sub.remove();};},[]);
  return reduced;
}
function useForeground(){
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
/** Two semantic rows; large text wraps without clipping. No completion acknowledgement. */
export function SyncProgress({progress,retry,details,cancel,canCancel=false}:{progress:Progress;retry:()=>void;details:()=>void;cancel?:()=>void;canCancel?:boolean}){
  const reduced=useReducedMotion(),reveal=useRef(new Animated.Value(0)).current,pulse=useRef(new Animated.Value(1)).current;
  const foreground=useForeground();
  const visible=progress.state!=='idle',active=foreground&&progress.state==='active';
  const [mounted,setMounted]=useState(visible);
  useEffect(()=>{if(visible)setMounted(true);const animation=Animated.timing(reveal,{toValue:visible?1:0,duration:reduced?0:180,useNativeDriver:true});animation.start(({finished})=>{if(finished&&!visible)setMounted(false);});return()=>animation.stop();},[visible,reduced,reveal]);
  useEffect(()=>{pulse.setValue(1);if(!active||reduced)return;const animation=Animated.loop(Animated.sequence([Animated.timing(pulse,{toValue:.65,duration:850,useNativeDriver:true}),Animated.timing(pulse,{toValue:1,duration:850,useNativeDriver:true})]));animation.start();return()=>animation.stop();},[active,reduced,pulse]);
  if(!mounted)return null;
  const failed=progress.state==='failed'||progress.state==='partial';
  const current=progress.message??(progress.current?syncLabels[progress.current].active:'Wird fortgesetzt …');
  if(failed)return <View style={[styles.box,{borderRadius:12,marginHorizontal:12,width:undefined,alignSelf:'stretch',borderWidth:1}]}><Pressable accessibilityRole="button" accessibilityLabel={`Sync unvollständig. ${current} Details öffnen`} onPress={details} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:8}}><Label style={{color:'#ffc477'}}>●</Label><Label style={[styles.current,{flex:1,color:'#ffc477'}]}>Sync unvollständig</Label><SymbolIcon name="right" size={18}/></Pressable><View style={styles.actions}><Pressable accessibilityRole="button" onPress={retry} style={styles.action}><Label style={{color:colors.cyan}}>Erneut versuchen</Label></Pressable></View></View>;
  return <Animated.View testID="sync-progress" style={[styles.box,{opacity:reveal,transform:[{translateY:reveal.interpolate({inputRange:[0,1],outputRange:[-12,0]})}]}]}>
    <View style={cancel&&!failed?{paddingRight:48}:undefined} accessibilityLiveRegion="polite" accessible accessibilityLabel={`${progress.last?syncLabels[progress.last].done+' ':''}${current}`}>
      <Label style={styles.previous}>{progress.last?`✓ ${syncLabels[progress.last].done}`:' '}</Label>
      <Animated.View style={{opacity:pulse}}><Label style={styles.current}>{current}</Label></Animated.View>
    </View>
    {cancel&&!failed&&<Pressable accessibilityRole="button" accessibilityLabel="Synchronisierung abbrechen" disabled={!canCancel} accessibilityState={{disabled:!canCancel}} onPress={cancel} style={styles.cancel}><SymbolIcon name="close" size={20}/></Pressable>}
    {failed&&<View style={styles.actions}><Pressable accessibilityRole="button" onPress={retry} style={styles.action}><Label>Erneut versuchen</Label></Pressable><Pressable accessibilityRole="button" onPress={details} style={styles.action}><Label>Details</Label></Pressable></View>}
  </Animated.View>;
}
const styles=StyleSheet.create({
  box:{width:'100%',maxWidth:960,alignSelf:'center',paddingHorizontal:18,paddingVertical:6,backgroundColor:colors.card,borderBottomWidth:1,borderColor:colors.border,borderBottomLeftRadius:12,borderBottomRightRadius:12},
  previous:{fontSize:11,lineHeight:16,color:colors.muted},current:{fontSize:12,lineHeight:18,color:colors.text},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:12},action:{minHeight:48,justifyContent:'center'},
  cancel:{position:'absolute',right:4,top:0,width:48,minHeight:48,alignItems:'center',justifyContent:'center'},
  shine:{position:'absolute',top:0,bottom:0,width:28,backgroundColor:'#baf9e436',borderLeftWidth:1,borderRightWidth:1,borderColor:'#d5ffee70'},
});
