// Geometry adapted from the user-supplied liquid-loop.html motion study.
// Build-time only: marching squares never runs on the browser main thread.
const STEP = 0.95;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const POSES=[[0,199.788,149.997,37.435,37.26,0,0.0,0.0,1.0],[8,199.368,150.005,37.522,37.273,0,0.0,0.0,1.0],[16,195.865,150.007,37.406,37.244,0,0.0,0.0,1.0],[20,191.86,149.998,37.403,37.257,0,0.0,0.0,1.0],[24,185.071,149.545,37.352,37.389,0,0.0,0.0,1.0],[25,182.874,149.209,37.658,37.245,2,0.0,0.0,1.0],[26,179.945,148.713,37.313,37.261,3.925,31.057,0.1,26.786],[27,176.85,148.0,37.406,35.602,4.994,31.843,13.885,10.111],[28,173.074,147.024,37.325,32.863,6.372,39.312,12.133,13.45],[29,168.514,145.705,37.257,31.41,7.887,47.626,11.259,16.552],[30,162.869,143.879,36.817,31.419,9.425,61.055,8.284,28.0],[31,157.471,141.703,36.976,31.424,11.069,64.483,9.275,1.5],[32,151.661,139.071,36.868,31.658,12.708,68.823,9.146,1.5],[34,141.402,132.667,36.961,33.051,16.604,77.815,9.118,1.5],[36,134.126,125.36,37.917,34.481,20.548,62.152,7.941,1.5],[37,131.479,121.534,37.492,35.512,22.591,36.427,11.932,11.901],[38,130.76,118.097,37.367,36.269,23.001,0.0,0.0,1.0],[40,136.901,114.842,37.394,37.205,50.965,0.0,0.0,1.0],[41,142.757,115.0,37.308,36.421,33.323,0.0,0.0,1.0],[42,148.789,115.817,38.228,35.007,34.498,0.0,0.0,1.0],[43,156.154,118.059,37.531,33.89,36.096,-36.606,13.813,11.243],[44,163.524,121.139,37.303,32.661,38.464,-49.311,12.564,19.179],[45,170.765,124.895,37.185,31.645,40.835,-61.591,11.857,24.0],[46,177.825,129.309,36.888,31.336,43.173,-71.654,12.684,1.5],[48,189.058,138.126,36.826,31.495,47.98700000000002,-88.505,14.761,1.5],[50,194.78,143.475,36.79,31.584,52.73399999999998,-97.442,18.179,1.5],[52,197.599,146.671,37.035,33.254,57.27499999999998,-101.844,18.395,1.5],[54,198.955,148.474,37.185,35.261,61.56200000000001,-102.581,14.977,1.5],[56,199.58,149.562,37.385,37.03,65.43400000000003,-100.28,12.839,1.5],[58,199.879,150.236,37.4,36.784,68.59500000000003,-94.728,11.399,1.5],[59,200.019,150.554,37.339,35.972,69.56,-90.45,10.844,1.5],[60,200.156,150.971,37.277,35.163,69.97000000000003,-85.006,10.371,1.5],[61,200.317,151.47,37.119,34.336,70.29700000000003,-77.535,9.881,1.5],[62,200.497,152.048,37.276,33.405,71.098,-67.297,9.507,9.054],[63,200.632,152.601,37.489,32.668,72.226,-50.737,9.878,19.042],[64,200.967,154.094,36.992,31.91,73.806,-25.787,15.0,7.028],[66,201.519,157.4,36.887,31.49,76.6,0.0,0.0,1.0],[68,202.044,163.22,36.882,31.56,80.101,0.0,0.0,1.0],[70,202.189,172.473,36.85,31.505,84.403,0.0,0.0,1.0],[71,201.671,177.437,36.679,31.704,85.711,18.213,12.0,12.566],[72,200.845,182.557,37.265,32.63,88.309,27.951,14.0,7.502],[73,199.664,187.312,37.455,33.864,90.164,35.068,13.245,10.681],[74,198.128,191.291,37.491,35.129,92.312,39.365,12.432,14.675],[75,196.341,194.6,37.595,36.359,94.446,41.061,12.922,14.938],[76,194.415,196.688,37.707,37.316,96.668,43.077,12.805,16.773],[77,192.547,196.865,37.729,37.115,98.777,45.58,13.074,18.146],[78,190.99,195.165,37.69,36.2,101.082,49.735,13.24,20.596],[79,189.922,192.075,37.642,35.161,103.306,54.495,13.764,21.841],[80,189.249,188.064,37.499,34.215,105.439,59.928,14.719,23.25],[81,189.007,183.582,37.18,33.322,107.74,65.73,15.955,24.0],[82,189.154,179.097,37.324,32.292,110.019,70.355,18.007,5.094],[84,190.691,169.81,36.943,31.586,114.595,80.322,18.712,1.5],[86,192.846,162.445,36.922,31.592,119.242,88.059,15.55,1.5],[88,194.553,157.771,37.005,31.628,123.839,92.891,13.294,1.5],[90,195.926,154.809,37.008,31.883,128.501,95.309,11.812,1.5],[92,197.085,152.88,37.124,32.851,133.096,95.998,10.788,1.5],[94,198.031,151.535,37.242,33.932,137.611,95.202,9.932,1.5],[96,198.735,150.792,37.351,35.002,142.247,92.648,9.405,1.5],[98,199.194,150.347,37.409,36.103,146.778,88.277,9.0,1.5],[100,199.55,150.118,37.552,37.033,151.276,81.209,9.088,1.5],[101,199.637,150.034,37.572,37.313,153.463,76.139,9.252,1.5],[102,199.627,150.035,37.581,37.358,155.56,69.781,9.131,1.5],[103,199.363,150.137,37.985,37.25,157.79,60.525,9.348,12.912],[104,199.498,150.064,37.767,37.331,159.622,46.809,11.27,17.495],[105,199.63,150.032,37.593,37.333,161.859,32.562,9.971,14.751],[106,199.736,149.989,37.51,37.294,172.973,0.0,0.0,1.0],[110,199.738,150.004,37.479,37.298,175.202,0.0,0.0,1.0],[114,199.783,150.001,37.441,37.26,170.106,0.0,0.0,1.0],[118,199.788,149.997,37.435,37.26,180,0.0,0.0,1.0]];
function makeTrack(rows){
 const slopes=rows.map(r=>r.map(()=>0));
 for(let j=1;j<rows[0].length;j++){
  const d=rows.slice(1).map((r,i)=>(r[j]-rows[i][j])/(r[0]-rows[i][0]));
  slopes[0][j]=d[0];slopes.at(-1)[j]=d.at(-1);
  for(let i=1;i<rows.length-1;i++){
   if(d[i-1]*d[i]<=0){slopes[i][j]=0;continue;}
   const a=rows[i][0]-rows[i-1][0],b=rows[i+1][0]-rows[i][0];
   slopes[i][j]=(3*(a+b))/((2*b+a)/d[i-1]+(b+2*a)/d[i]);
  }
 }
 return f=>{
  let i=0;while(i<rows.length-2&&rows[i+1][0]<f)i++;
  const a=rows[i],b=rows[i+1],h=b[0]-a[0],u=clamp((f-a[0])/h,0,1),v=u*u,w=v*u;
  return a.slice(1).map((x,j)=>{j++;return (2*w-3*v+1)*x+(w-2*v+u)*h*slopes[i][j]+(-2*w+3*v)*b[j]+(w-v)*h*slopes[i+1][j];});
 };
}
const poseAt = makeTrack(POSES);
const fmt=n=>Math.abs(n)<.0001?'0':n.toFixed(2);
function ellipsePath(x,y,a,b,angle){
 const t=angle*Math.PI/180,dx=a*Math.cos(t),dy=a*Math.sin(t);
 return `M${fmt(x+dx)},${fmt(y+dy)}A${fmt(a)},${fmt(b)} ${fmt(angle)} 1 0 ${fmt(x-dx)},${fmt(y-dy)}A${fmt(a)},${fmt(b)} ${fmt(angle)} 1 0 ${fmt(x+dx)},${fmt(y+dy)}Z`;
}
function contour(p){
 const [cx,cy,a,b,angle,d,r,k]=p,t=angle*Math.PI/180,cs=Math.cos(t),sn=Math.sin(t),sx=cx+d*cs,sy=cy+d*sn;
 if(r<0.01)return ellipsePath(cx,cy,a,b,angle);
 // An exact analytic path is cheaper when the two fields cannot touch.
 if(Math.abs(d)>a+r+k*.6+2)return ellipsePath(cx,cy,a,b,angle)+ellipsePath(sx,sy,r,r,0);
 const field=(x,y)=>{
  const dx=x-cx,dy=y-cy,u=dx*cs+dy*sn,v=-dx*sn+dy*cs;
  const q=(Math.hypot(u/a,v/b)-1)*b,z=Math.hypot(u-d,v)-r,h=Math.max(k-Math.abs(q-z),0)/k;
  return Math.min(q,z)-h*h*k*.25;
 };
 // Marching squares evaluates an analytic smooth union, at arbitrary time.
 // It produces vector outlines, including separate islands after a pinch.
 const pad=7,extent=Math.max(a,b),x0=Math.floor(Math.min(cx-extent,sx-r)-pad),y0=Math.floor(Math.min(cy-extent,sy-r)-pad);
 const nx=Math.ceil((Math.max(cx+extent,sx+r)+pad-x0)/STEP),ny=Math.ceil((Math.max(cy+extent,sy+r)+pad-y0)/STEP),stride=nx+1;
 const values=new Float32Array(stride*(ny+1));
 for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++)values[y*stride+x]=field(x0+x*STEP,y0+y*STEP);
 const nodes=new Map();
 const edge=(x,y,e,v)=>{
  let key,x1=x,y1=y,x2=x,y2=y,n1,n2;
  if(e===0){key=`h${x},${y}`;x2++;n1=v[0];n2=v[1];}
  else if(e===1){key=`v${x+1},${y}`;x1++;x2++;y2++;n1=v[1];n2=v[2];}
  else if(e===2){key=`h${x},${y+1}`;y1++;x2++;y2++;n1=v[3];n2=v[2];}
  else{key=`v${x},${y}`;y2++;n1=v[0];n2=v[3];}
  if(!nodes.has(key)){const u=n1/(n1-n2);nodes.set(key,{x:x0+(x1+(x2-x1)*u)*STEP,y:y0+(y1+(y2-y1)*u)*STEP,to:[],used:false});}
  return key;
 };
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const i=y*stride+x,v=[values[i],values[i+1],values[i+stride+1],values[i+stride]],edges=[];
  for(let e=0;e<4;e++)if((v[e]<0)!==(v[(e+1)%4]<0))edges.push(e);
  if(!edges.length)continue;
  let pairs;
  if(edges.length===2)pairs=[edges];
  else{const center=field(x0+(x+.5)*STEP,y0+(y+.5)*STEP);pairs=((v[0]<0)===(center<0))?[[0,1],[2,3]]:[[0,3],[1,2]];}
  for(const pair of pairs){const a=edge(x,y,pair[0],v),b=edge(x,y,pair[1],v);nodes.get(a).to.push(b);nodes.get(b).to.push(a);}
 }
 let path='';
 for(const [start,node] of nodes){
  if(node.used)continue;let key=start,previous=null,count=0;
  do{
   const n=nodes.get(key);if(!n||n.used)break;n.used=true;
   path+=(count++?'L':'M')+fmt(n.x)+','+fmt(n.y);
   const next=n.to.find(q=>q!==previous);previous=key;key=next;
  }while(key&&key!==start&&count<=nodes.size);
  path+='Z';
 }
 return path;
}
export function cursorPath(frame) {
  const pose = poseAt(frame);
  // Anchor the main blob to the actual pointer; retain squash and droplets.
  pose[0] = 0;
  pose[1] = 0;
  // Enlarge the satellite without scaling the main blob. Move its center out
  // by the added radius so the inner gap and the separation rhythm survive.
  // Ease that offset to zero inside the main blob for a smooth reabsorption.
  const addedRadius = pose[6] * 0.45;
  const separation = clamp(Math.abs(pose[5]) / pose[2], 0, 1);
  const emergence = separation * separation * (3 - 2 * separation);
  pose[5] += Math.sign(pose[5]) * addedRadius * emergence;
  pose[6] += addedRadius;
  // A slightly broader neck keeps the larger droplet's stretch/pinch fluid.
  pose[7] *= 1.2;
  return contour(pose);
}
