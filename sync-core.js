(function(root){
 'use strict';
 const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const safe=k=>typeof k==='string'&&k.length<200&&!['__proto__','prototype','constructor'].includes(k)&&!['@__proto__','@prototype','@constructor'].includes(k);
 const keyed=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&[...a,...b].length>0&&[...a,...b].every(x=>obj(x)&&typeof x.id==='string');
 function diff(a,b,path=[]){
  if(equal(a,b))return [];
  if(keyed(a,b)){
   const am=new Map(a.map(x=>[x.id,x])),bm=new Map(b.map(x=>[x.id,x]));
   return [...new Set([...am.keys(),...bm.keys()])].flatMap(id=>diff(am.get(id),bm.get(id),[...path,'@'+id]));
  }
  if(obj(a)&&obj(b))return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>{if(!safe(k))throw Error('Invalid key');return diff(a[k],b[k],[...path,k]);});
  if(!path.length)throw Error('Root replacement is forbidden');
  return [{path,...(b===undefined?{del:true}:{value:copy(b)})}];
 }
 function validate(op){
  if(!op||typeof op.id!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(op.id)||typeof op.actor!=='string'||!Number.isSafeInteger(op.clock)||op.clock<0||!Array.isArray(op.changes)||op.changes.length>10000)throw Error('Invalid operation');
  for(const c of op.changes)if(!Array.isArray(c.path)||!c.path.length||c.path.length>25||!c.path.every(safe)||(!c.del&&!Object.hasOwn(c,'value')))throw Error('Invalid path');
  return op;
 }
 function apply(data,c){
  let at=data;
  for(let i=0;i<c.path.length;i++){
   const k=c.path[i],last=i===c.path.length-1,next=c.path[i+1];
   if(k.startsWith('@')){
    if(!Array.isArray(at))throw Error('Expected record list');
    const id=k.slice(1);let n=at.findIndex(x=>x&&x.id===id);
    if(last){if(c.del){if(n>=0)at.splice(n,1);}else{const value=copy(c.value);if(!obj(value)||value.id!==id)throw Error('Invalid record');if(n>=0)at[n]=value;else at.push(value);}return;}
    if(n<0)return;at=at[n];
   }else{
    if(last){if(c.del)delete at[k];else at[k]=copy(c.value);return;}
    if(!at[k]||typeof at[k]!=='object'){if(c.del)return;at[k]=next.startsWith('@')?[]:{};}at=at[k];
   }
  }
 }
 function replay(seed,operations){
  const data=copy(seed||{}),unique=new Map();operations.forEach(op=>{validate(op);if(unique.has(op.id)&&!equal(unique.get(op.id),op))throw Error('Operation ID reused');unique.set(op.id,op);});
  [...unique.values()].sort((a,b)=>a.clock-b.clock||a.actor.localeCompare(b.actor)||a.id.localeCompare(b.id)).forEach(op=>op.changes.forEach(c=>apply(data,c)));
  return data;
 }
 function reconcileUnknown(server,local){
  if(keyed(server,local)){const result=copy(server),seen=new Set(server.map(x=>x.id));local.forEach(x=>{if(!seen.has(x.id))result.push(copy(x));});return result;}
  if(obj(server)&&obj(local)){const result=copy(server);for(const k of Object.keys(local)){if(!safe(k))continue;result[k]=Object.hasOwn(server,k)?reconcileUnknown(server[k],local[k]):copy(local[k]);}return result;}
  return server===undefined?copy(local):copy(server);
 }
 const api={diff,replay,validate,reconcileUnknown,copy,equal};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.HaruSyncCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
