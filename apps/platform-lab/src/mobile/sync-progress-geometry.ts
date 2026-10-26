/** Bounded native line geometry: no graphics dependency or per-frame JS drawing. */
export const SYNC_RING_SIZE=32;
export const SYNC_RING_STROKE=2.5;
type Point={x:number;y:number};
export interface SyncRingSegment {from:Point;to:Point;length:number;angle:number}
const segmentCount=128,waves=8,radius=12.5,amplitude=1.4;
function point(index:number):Point{
  const angle=index/segmentCount*Math.PI*2-Math.PI/2;
  const distance=radius+amplitude*Math.sin(index/segmentCount*Math.PI*2*waves);
  return {x:SYNC_RING_SIZE/2+distance*Math.cos(angle),y:SYNC_RING_SIZE/2+distance*Math.sin(angle)};
}
const fullRing:readonly SyncRingSegment[]=Array.from({length:segmentCount},(_,index)=>{
  const from=point(index),to=point(index+1),dx=to.x-from.x,dy=to.y-from.y;
  return {from,to,length:Math.hypot(dx,dy),angle:Math.atan2(dy,dx)*180/Math.PI};
});
export const SYNC_RING_PATH_LENGTH=fullRing.reduce((sum,segment)=>sum+segment.length,0);
/** Clip by actual polyline length, including an exact partial final segment. */
export function syncRingSegments(fraction:number):readonly SyncRingSegment[]{
  const value=Number.isFinite(fraction)?Math.max(0,Math.min(1,fraction)):0;
  if(value===1)return fullRing;
  let remaining=SYNC_RING_PATH_LENGTH*value;
  const result:SyncRingSegment[]=[];
  for(const segment of fullRing){
    if(remaining<=0)break;
    if(remaining>=segment.length){result.push(segment);remaining-=segment.length;continue;}
    const ratio=remaining/segment.length;
    result.push({...segment,to:{x:segment.from.x+(segment.to.x-segment.from.x)*ratio,y:segment.from.y+(segment.to.y-segment.from.y)*ratio},length:remaining});
    break;
  }
  return result;
}
