/* v132: durable field operations; no whole-copy selection. */
let haruSyncState=null,haruSyncApplying=false,haruSyncRunning=false,haruSyncRetry=0,haruSyncWake=null;
let haruSyncObserved=null,haruSyncStatus='연결 확인 중',haruSyncRecovery={};
const haruDeviceFields=['push','sync','notify','theme','collapsed','homeView','homeLast','homeStart','homeSummary'];
const haruOldSyncPayload=syncPayload;
syncPayload=function(){const data=haruOldSyncPayload();haruDeviceFields.forEach(k=>delete data[k]);return data;};
const haruSyncCopy=x=>HaruSyncCore.copy(x);
const haruSyncKey=()=>KEY+':sync2:'+S.sync.room;
function haruSyncPersist(){
 if(!haruSyncState)return;
 const key=haruSyncKey();
 if(STORE.mode()==='local'){
  const old=JSON.parse(localStorage.getItem(key)||'null');
  if(old&&old.room===haruSyncState.room)haruSyncState.ops={...old.ops,...haruSyncState.ops};
  localStorage.setItem(key,JSON.stringify(haruSyncState));
 }else STORE.set(key,JSON.stringify(haruSyncState)).catch(()=>haruSyncSetStatus('기기에 저장하지 못했어요 · 백업 필요'));
}
function haruSyncSetStatus(text){haruSyncStatus=text;const el=document.getElementById('haru-sync-status');if(el)el.textContent=text;}
function haruSyncOperation(changes){
 if(!changes.length)return;
 const clock=Math.max(Date.now(),(haruSyncState.clock||0)+1,...Object.values(haruSyncState.ops).map(o=>o.clock+1));
 const id=crypto.randomUUID().replace(/-/g,'');
 const op={id,actor:haruSyncState.actor,clock,changes};haruSyncState.clock=clock;haruSyncState.ops[id]=op;return op;
}
function haruSyncCapture(){
 if(haruSyncApplying||!haruSyncState||haruSyncState.room!==S.sync.room)return;
 try{
  const current=syncPayload();
  if(haruSyncObserved){const changes=HaruSyncCore.diff(haruSyncObserved,current);if(changes.length){haruSyncOperation(changes);haruSyncPersist();haruSyncSetStatus('기기에 저장됨 · 서버에 보내는 중');}}
  haruSyncObserved=haruSyncCopy(current);
 }catch(e){saveFailed=true;haruSyncSetStatus('기기 저장 공간을 확인해 주세요 · 백업 필요');}
}
async function haruSyncInit(){
 const keys=[':conflict',':before-conflict-choice',':before-sync-v132',':recovery-history'];
 for(const suffix of keys){try{const value=await STORE.get(KEY+suffix);if(value)haruSyncRecovery[suffix]=JSON.parse(value);}catch(e){}}
 if(!haruSyncRecovery[':before-sync-v132']){
  const before=JSON.stringify(S);await STORE.set(KEY+':before-sync-v132',before);haruSyncRecovery[':before-sync-v132']=JSON.parse(before);
 }
 if(!S.sync.room){haruSyncSetStatus('동기화 연결 필요 · 기록은 기기에 저장됨');return;}
 const raw=await STORE.get(haruSyncKey());haruSyncState=raw?JSON.parse(raw):null;
 if(!haruSyncState){
  let base=null;try{base=S.sync.base?JSON.parse(S.sync.base):null;}catch(e){}
  if(base)haruDeviceFields.forEach(k=>delete base[k]);
  haruSyncState={room:S.sync.room,actor:crypto.randomUUID().replace(/-/g,''),clock:0,ops:{},acked:[],seed:null,initialBase:base};
  // A known previous sync baseline lets us distinguish a deletion from a stale copy.
  if(base)haruSyncOperation(HaruSyncCore.diff(base,syncPayload()));
  haruSyncPersist();
 }
 haruSyncObserved=haruSyncCopy(syncPayload());
 // A legacy collision should no longer disable synchronization forever.
 if(haruConflict&&S.push.url&&S.sync.protocol!==2)S.sync.on=true;
 S.sync.protocol=2;
 if(!S.sync.on)haruSyncSetStatus('동기화 꺼짐 · 기기에 저장됨');
 setInterval(()=>{if(!document.hidden)syncStart();},12000);
}
async function haruSyncRequest(body){
 const url=(S.push.url||'').trim().replace(/\/+$/,'');if(!url)throw Error('서버 주소 필요');
 const res=await fetch(url+'/sync-v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:S.sync.room,...body}),signal:AbortSignal.timeout(25000)});
 const data=await res.json();if(!res.ok||!data.ok)throw Error(data.error||'서버 연결 실패');return data;
}
async function haruSyncArchive(before,after){
 if(HaruSyncCore.equal(before,after))return;
 const history=haruSyncRecovery[':recovery-history']||[];
 history.push({at:new Date().toISOString(),data:haruSyncCopy(before)});
 while(history.length>8)history.shift();
 await STORE.set(KEY+':recovery-history',JSON.stringify(history));haruSyncRecovery[':recovery-history']=history;
}
async function haruSyncRun(silent=true){
 if(haruSyncRunning||!S.sync.room||!S.sync.on||!S.push.url)return false;
 haruSyncRunning=true;const room=S.sync.room;
 try{
  if(!haruSyncState||haruSyncState.room!==room)await haruSyncInit();
  haruSyncCapture();haruSyncPersist();
  const acked=new Set(haruSyncState.acked||[]),pending=Object.values(haruSyncState.ops).filter(op=>!acked.has(op.id)).slice(0,25);
  const response=await haruSyncRequest({ops:pending,known:Object.keys(haruSyncState.ops).filter(id=>acked.has(id))});
  if(S.sync.room!==room)return false;
  // Capture edits made while the network request was in flight before applying its result.
  haruSyncCapture();haruSyncState.seed=haruSyncState.seed||response.seed||{};
  for(const op of response.ops||[]){HaruSyncCore.validate(op);haruSyncState.ops[op.id]=op;}
  haruSyncState.acked=[...new Set([...haruSyncState.acked,...(response.ops||[]).map(op=>op.id)])];
  haruSyncState.acked=[...new Set([...haruSyncState.acked,...(response.acked||[])])];
  if(!haruSyncState.initialized&&!response.more){
   if(!haruSyncState.initialBase||response.hasData===false){
    const remote=HaruSyncCore.replay(haruSyncState.seed,Object.values(haruSyncState.ops));
    haruSyncOperation(HaruSyncCore.diff(remote,HaruSyncCore.reconcileUnknown(remote,syncPayload())));
   }
   haruSyncState.initialized=true;
  }
  haruSyncPersist();
  if(response.more){haruSyncSetStatus('기록을 안전하게 불러오는 중');haruSyncSchedule(500);return true;}
  const before=syncPayload(),merged=HaruSyncCore.replay(haruSyncState.seed,Object.values(haruSyncState.ops));
  await haruSyncArchive(before,merged);
  // Archive may involve asynchronous storage; capture one more time so these edits also survive.
  haruSyncCapture();const final=HaruSyncCore.replay(haruSyncState.seed,Object.values(haruSyncState.ops));
  haruSyncApplying=true;const keep={};haruDeviceFields.forEach(k=>keep[k]=S[k]);
  S=migrate(final);haruDeviceFields.forEach(k=>{if(keep[k]!==undefined)S[k]=keep[k];});
  haruSyncObserved=haruSyncCopy(syncPayload());S.sync.base=JSON.stringify(haruSyncObserved);lastSyncJSON=S.sync.base;S.sync.at=nowHM();S.sync.error='';
  haruSyncPersist();save();haruSyncApplying=false;
  const left=Object.keys(haruSyncState.ops).filter(id=>!haruSyncState.acked.includes(id)).length;
  haruSyncRetry=0;haruSyncSetStatus(left?'기기에 저장됨 · 서버에 보내는 중':'동기화됨 · '+S.sync.at);
  if(!HaruSyncCore.equal(before,syncPayload()))render();if(!silent)toast('변경 내용을 동기화했어요');
  if(left||response.more)haruSyncSchedule(500);return true;
 }catch(e){
  haruSyncApplying=false;S.sync.error=String(e.message||e);haruSyncSetStatus('기기에 저장됨 · 연결되면 자동 재시도');
  haruSyncRetry=Math.min(60000,haruSyncRetry?haruSyncRetry*2:2000);haruSyncSchedule(haruSyncRetry);return false;
 }finally{haruSyncRunning=false;}
}
function haruSyncSchedule(delay=700){clearTimeout(haruSyncWake);haruSyncWake=setTimeout(()=>haruSyncRun(true),delay);}
syncAuto=function(){if(S.sync.on){haruSyncCapture();if(haruSyncState&&Object.keys(haruSyncState.ops).some(id=>!haruSyncState.acked.includes(id)))haruSyncSchedule();}};
syncUp=function(silent){return haruSyncRun(silent);};
syncDown=function(silent){return haruSyncRun(silent);};
syncStart=function(){return haruSyncRun(true);};
window.addEventListener('online',()=>{if(S.sync.on)haruSyncSchedule(0);});
window.addEventListener('pagehide',()=>haruSyncCapture());
window.addEventListener('storage',e=>{if(haruSyncState&&e.key===haruSyncKey()&&S.sync.on)haruSyncSchedule(100);});

function haruRecoveryRecords(){
 const found=new Map(),visited=new Set();
 function visit(o,source){if(!o||typeof o!=='object'||visited.has(o))return;visited.add(o);
  if(Array.isArray(o.money))for(const r of o.money)if(r.date==='2026-11-01'&&r.id&&!S.money.some(x=>x.id===r.id))found.set(r.id,{record:r,source});
  for(const k of ['local','server','data','current'])visit(o[k],source);
  if(o.sync?.base){try{visit(JSON.parse(o.sync.base),source+' 동기화 기준');}catch(e){}}
  if(Array.isArray(o))o.forEach(x=>visit(x,source));
 }
 Object.entries(haruSyncRecovery).forEach(([key,value])=>visit(value,key));return [...found.values()];
}
haruConflictCard=function(){return '';};
const haruSyncPreviousSettings=vSet;
vSet=function(){const candidates=haruRecoveryRecords();return `<section class="haru-board"><h2>기기 동기화</h2><p id="haru-sync-status" role="status">${esc(haruSyncStatus)}</p><div class="haru-actions"><button data-sync2="now">지금 동기화</button><button data-sync2="recovery">복구 자료 내려받기</button></div>${candidates.length?`<p>보관 사본에서 11월 1일 기록 ${candidates.length}건을 찾았어요.</p><button class="addbtn" data-sync2="restore">누락된 11월 1일 기록 복원</button>`:''}</section>`+haruSyncPreviousSettings();};
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-sync2]');if(!b)return;
 if(b.dataset.sync2==='now')await haruSyncRun(false);
 if(b.dataset.sync2==='restore'){
  const before=syncPayload(),candidates=haruRecoveryRecords();if(!candidates.length)return;
  await haruSyncArchive(before,{restore:true});candidates.forEach(c=>{if(!S.money.some(r=>r.id===c.record.id))S.money.push(haruSyncCopy(c.record));});save();render();toast(candidates.length+'건을 복원했어요');
 }
 if(b.dataset.sync2==='recovery'){
  for(const suffix of [':conflict',':before-conflict-choice',':before-sync-v132',':recovery-history']){try{const raw=await STORE.get(KEY+suffix);if(raw)haruSyncRecovery[suffix]=JSON.parse(raw);}catch(e){}}
  const data={format:'haru-recovery-v2',at:new Date().toISOString(),current:haruSyncCopy(S),snapshots:haruSyncRecovery,journal:haruSyncState};
  await sendFile('하루-전체복구자료-'+today()+'.json',JSON.stringify(data,null,2),'application/json','복구 자료를 저장했어요');
 }
});
