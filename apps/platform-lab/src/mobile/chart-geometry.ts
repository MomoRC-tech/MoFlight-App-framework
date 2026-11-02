export interface TrendPoint { index:number; x:number; y:number; value:number }
export interface TrendSegment { points:TrendPoint[]; line:string; area:string }

/** A bounded presentation curve: controls stay at endpoint heights, with no invented extrema. */
export function trendGeometry(values:readonly (number|null)[], uncertain:readonly boolean[], width:number,height:number,range:readonly [number,number]) {
  const padding=12, span=range[1]-range[0]||1;
  const x=(index:number)=>values.length<2?width/2:padding+index/(values.length-1)*Math.max(0,width-2*padding);
  const y=(value:number)=>padding+(range[1]-value)/span*Math.max(0,height-2*padding);
  const points:TrendPoint[]=[],groups:TrendPoint[][]=[];let group:TrendPoint[]=[];
  const flush=()=>{if(group.length)groups.push(group);group=[];};
  values.forEach((value,index)=>{
    if(value===null||!Number.isFinite(value)){flush();return;}
    const point={index,x:x(index),y:y(value),value};points.push(point);
    if(uncertain[index]){flush();groups.push([point]);return;}
    group.push(point);
  });flush();
  const segments:TrendSegment[]=groups.map(points=>{
    const first=points[0]!,last=points.at(-1)!;
    let line=`M ${first.x} ${first.y}`;
    for(let i=1;i<points.length;i++){
      const a=points[i-1]!,b=points[i]!,dx=(b.x-a.x)*.42;
      line+=` C ${a.x+dx} ${a.y}, ${b.x-dx} ${b.y}, ${b.x} ${b.y}`;
    }
    return {points,line,area:`${line} L ${last.x} ${y(0)} L ${first.x} ${y(0)} Z`};
  });
  return {points,segments,x,y};
}
