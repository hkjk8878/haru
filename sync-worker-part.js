/* Build helper: this file is embedded into worker.js; do not deploy it alone. */
const syncDeviceFields=['push','sync','notify','theme','collapsed','homeView','homeLast','homeStart','homeSummary'];
function syncClean(data){const copy=HaruSyncCore.copy(data||{});syncDeviceFields.forEach(k=>delete copy[k]);return copy;}
async function syncList(kv,prefix){
 const out=[];let cursor;
 do{const page=await kv.list({prefix,...(cursor?{cursor}:{})});out.push(...page.keys);cursor=page.list_complete?null:page.cursor;}while(cursor);
 return out;
}
async function syncReadV2(kv,room,ops=[],known=[]){
 const prefix='sync2:'+room+':';let seedOperation=null;
 const legacyRaw=await kv.get('data:'+room);
 if(legacyRaw){
  const legacy=JSON.parse(legacyRaw),clean=syncClean(legacy.data),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(clean)));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const id='seed_'+String(legacy.rev||0)+'_'+hash.slice(0,24),key=prefix+'op:'+id;
  const changes=HaruSyncCore.diff({},clean);seedOperation={id,actor:'seed_'+String(legacy.rev||0).padStart(16,'0'),clock:0,changes};
  if(!await kv.get(key)&&changes.length)await kv.put(key,JSON.stringify(seedOperation));
 }
 const acknowledged=[];
 for(const op of ops){
  HaruSyncCore.validate(op);const key=prefix+'op:'+op.id,value=JSON.stringify(op),old=await kv.get(key);
  if(old&&old!==value)throw Error('동일한 변경 번호에 다른 내용이 있어요');
  if(!old)await kv.put(key,value);acknowledged.push(op.id);
 }
 const keys=await syncList(kv,prefix+'op:'),seen=new Set(known),missing=keys.filter(k=>!seen.has(k.name.slice((prefix+'op:').length))),all=[];
 const selected=missing.slice(0,100);
 for(let i=0;i<selected.length;i+=25){const values=await Promise.all(selected.slice(i,i+25).map(k=>kv.get(k.name)));values.forEach(value=>{if(value)all.push(JSON.parse(value));});}
 const byId=new Map([...all,...(seedOperation&&seedOperation.changes.length&&!seen.has(seedOperation.id)?[seedOperation]:[]),...ops].map(op=>[op.id,op]));
 return {ok:true,protocol:2,seed:{},hasData:keys.length>0||byId.size>0,ops:[...byId.values()],acked:acknowledged,more:missing.length>selected.length,at:new Date().toISOString()};
}
async function syncEndpoint(req,env){
 const text=await req.text();if(text.length>2000000)return json({error:'한 번에 보낼 내용이 너무 커요'},413);
 let body;try{body=JSON.parse(text);}catch(e){return json({error:'잘못된 요청'},400);}
 const room=String(body.room||'').trim();if(!/^[A-Za-z0-9._-]{4,40}$/.test(room))return json({error:'동기화 코드 형식 확인'},400);
 const ops=body.ops||[];if(!Array.isArray(ops)||ops.length>25)return json({error:'변경 개수 확인'},400);
 try{return json(await syncReadV2(env.HARU,room,ops,Array.isArray(body.known)?body.known:[]));}catch(e){return json({error:String(e.message||e)},400);}
}
async function syncKeepLegacy(kv,room,body,server){
 const at=new Date().toISOString(),id=crypto.randomUUID().replace(/-/g,'');
 await kv.put('recovery:'+room+':'+at+':'+id,JSON.stringify({at,kind:'legacy-before-upload',server:server?.data||null,data:body.data}));
 if(server&&(server.rev||0)>(body.rev||0))return;
 {const changes=HaruSyncCore.diff(syncClean(server?.data),syncClean(body.data));if(changes.length)await syncReadV2(kv,room,[{id,actor:'legacy',clock:Date.now(),changes}]);}
}
