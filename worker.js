/* ─────────────────────────────────────────────
   하루 — 알림 서버 (Cloudflare Worker)
   이 파일 전체를 클라우드플레어 워커 편집기에 붙여넣으세요.

   필요한 설정
   - KV 네임스페이스를 만들어 변수 이름 HARU 로 연결
   - 환경 변수 VAPID_PUBLIC   : keygen.html에서 만든 공개 열쇠
   - 환경 변수 VAPID_JWK      : keygen.html에서 만든 비밀 열쇠 (JSON 한 줄)
   - 환경 변수 VAPID_SUBJECT  : mailto:내이메일@example.com
   - Cron Trigger 에 * * * * * (매분)
   ───────────────────────────────────────────── */

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
 root.HaruSyncCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);

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
 try{return json(await syncReadD1(env.HARU,env.HARU_SYNC_DB,room,ops,body.cursor||0));}catch(e){return json({error:String(e.message||e)},400);}
}
async function syncKeepLegacy(kv,room,body,server,db){
 const at=new Date().toISOString(),id=crypto.randomUUID().replace(/-/g,'');
 await kv.put('recovery:'+room+':'+at+':'+id,JSON.stringify({at,kind:'legacy-before-upload',server:server?.data||null,data:body.data}));
 if(server&&(server.rev||0)>(body.rev||0))return;
 {const changes=HaruSyncCore.diff(syncClean(server?.data),syncClean(body.data));if(changes.length&&db)await syncReadD1(kv,db,room,[{id,actor:'legacy',clock:Date.now(),changes}]);}
}

/* Durable journal in D1. KV is read only to migrate the legacy snapshot. */
const syncDbReady=new WeakSet();
async function syncReadD1(kv,db,room,ops=[],cursor=0){
 if(!db)throw Error('동기화 서버를 준비하고 있어요. 기기 기록은 보관됩니다.');
 if(!syncDbReady.has(db)){
  await db.batch([
   db.prepare('CREATE TABLE IF NOT EXISTS haru_sync_ops (seq INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(room,id))'),
   db.prepare('CREATE INDEX IF NOT EXISTS haru_sync_room_seq ON haru_sync_ops(room,seq)')
  ]);syncDbReady.add(db);
 }
 cursor=Number.isSafeInteger(cursor)&&cursor>=0?cursor:0;
 if(cursor>0&&!ops.length){
  const head=await db.prepare('SELECT MAX(seq) AS seq FROM haru_sync_ops WHERE room=?').bind(room).first();
  if(head?.seq===cursor)return {ok:true,protocol:2,backend:'d1',seed:{},hasData:true,ops:[],acked:[],cursor,more:false,at:new Date().toISOString()};
 }
 // Bootstrap reads the legacy snapshot. Active legacy uploads are mirrored into D1 by syncKeepLegacy.
 const legacyRaw=cursor===0?await kv.get('data:'+room):null,writes=[];
 if(legacyRaw){
  const legacy=JSON.parse(legacyRaw),clean=syncClean(legacy.data),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(clean)));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const id='seed_'+String(legacy.rev||0)+'_'+hash.slice(0,24),changes=HaruSyncCore.diff({},clean);
  if(changes.length&&!await db.prepare('SELECT id FROM haru_sync_ops WHERE room=? AND id=?').bind(room,id).first()){
   writes.push(db.prepare('INSERT OR IGNORE INTO haru_sync_ops(room,id,payload) VALUES(?,?,?)').bind(room,id,JSON.stringify({id,actor:'seed_'+String(legacy.rev||0).padStart(16,'0'),clock:0,changes})));
  }
 }
 for(const op of ops){
  HaruSyncCore.validate(op);const value=JSON.stringify(op),old=await db.prepare('SELECT payload FROM haru_sync_ops WHERE room=? AND id=?').bind(room,op.id).first();
  if(old&&old.payload!==value)throw Error('동일한 변경 번호에 다른 내용이 있어요');
  if(!old)writes.push(db.prepare('INSERT OR IGNORE INTO haru_sync_ops(room,id,payload) VALUES(?,?,?)').bind(room,op.id,value));
 }
 if(writes.length)await db.batch(writes);
 const rows=(await db.prepare('SELECT seq,payload FROM haru_sync_ops WHERE room=? AND seq>? ORDER BY seq LIMIT 101').bind(room,Number.isSafeInteger(cursor)&&cursor>=0?cursor:0).all()).results;
 const selected=rows.slice(0,100),hasData=selected.length>0||!!await db.prepare('SELECT seq FROM haru_sync_ops WHERE room=? LIMIT 1').bind(room).first();
 return {ok:true,protocol:2,backend:'d1',seed:{},hasData,ops:selected.map(row=>JSON.parse(row.payload)),acked:ops.map(op=>op.id),cursor:selected.at(-1)?.seq||cursor,more:rows.length>100,at:new Date().toISOString()};
}

const TE = new TextEncoder();
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json',...CORS}});

/* ── base64url ── */
function b64u(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function ub64(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function cat(...arrs) {
  const n = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

/* ── VAPID 인증 헤더 ── */
async function vapid(env, endpoint) {
  const jwk = JSON.parse(env.VAPID_JWK);
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const head = b64u(TE.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(TE.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: env.VAPID_SUBJECT || 'mailto:haru@example.com'
  })));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, TE.encode(head + '.' + body)
  );
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}

/* ── 본문 암호화 (aes128gcm, RFC 8291) ── */
async function encrypt(sub, text) {
  const cliPub = ub64(sub.keys.p256dh);
  const auth = ub64(sub.keys.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const srvPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const cliKey = await crypto.subtle.importKey('raw', cliPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: cliKey }, kp.privateKey, 256));

  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const prk = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: auth, info: cat(TE.encode('WebPush: info\0'), cliPub, srvPub) },
    ikm, 256
  ));
  const prkKey = await crypto.subtle.importKey('raw', prk, 'HKDF', false, ['deriveBits']);
  const cek = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: TE.encode('Content-Encoding: aes128gcm\0') }, prkKey, 128
  ));
  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: TE.encode('Content-Encoding: nonce\0') }, prkKey, 96
  ));

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aes, cat(TE.encode(text), new Uint8Array([2]))
  ));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([srvPub.length]), srvPub, ct);
}

async function push(env, sub, payload) {
  const body = await encrypt(sub, JSON.stringify(payload));
  const auth = await vapid(env, sub.endpoint);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: auth,
      TTL: '300',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream'
    },
    body
  });
  return res.status;
}

/* ── 알림 시각 계산 ── */
function localParts(tzOffsetMin) {
  // tzOffsetMin: 브라우저의 getTimezoneOffset() 값 (한국은 -540)
  const d = new Date(Date.now() - tzOffsetMin * 60000);
  return {
    hm: String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'),
    dow: d.getUTCDay(),
    date: d.toISOString().slice(0, 10)
  };
}
function dueAlarms(rec) {
  const t = localParts(typeof rec.tz === 'number' ? rec.tz : 0);
  const out = [];
  (rec.weekly || []).forEach(a => {
    if (a.at !== t.hm) return;
    if (!Array.isArray(a.dow) || !a.dow.includes(t.dow)) return;
    /* skip = 「이 날만 시각 옮기기」를 해 둔 날짜들. 그 날은 매주 알림을 쉬고,
       dated 쪽에 옮긴 시각으로 따로 들어 있다. */
    if (Array.isArray(a.skip) && a.skip.includes(t.date)) return;
    out.push(a);
  });
  (rec.dated || []).forEach(a => {
    if (a.at === t.hm && a.date === t.date) out.push(a);
  });
  return out;
}

/* Per-device subscriptions and versioned room schedules use D1. */
const alarmReady = new WeakSet();
async function alarmDatabase(env) {
  const db = env.HARU_SYNC_DB;
  if (!db) throw Error('알림 저장소 연결이 필요해요');
  if (!alarmReady.has(db)) {
    await db.batch([
      db.prepare('CREATE TABLE IF NOT EXISTS haru_alarm_devices (id TEXT PRIMARY KEY, room TEXT, payload TEXT, removed INTEGER NOT NULL DEFAULT 0)'),
      db.prepare('CREATE TABLE IF NOT EXISTS haru_alarm_schedules (room TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS haru_alarm_meta (id TEXT PRIMARY KEY, value TEXT NOT NULL)')
    ]);
    alarmReady.add(db);
  }
  return db;
}
async function alarmMigrate(env) {
  const db = await alarmDatabase(env);
  if (await db.prepare("SELECT value FROM haru_alarm_meta WHERE id='migrated'").first()) return;
  const retry = await db.prepare("SELECT value FROM haru_alarm_meta WHERE id='retry'").first();
  if (retry && Number(retry.value) > Date.now()) return;
  try {
    let cursor;
    do {
      const page = await env.HARU.list({prefix:'sub:', cursor});
      for (const key of page.keys) {
        const raw = await env.HARU.get(key.name);
        if (!raw) continue;
        let rec;
        try { rec = JSON.parse(raw); } catch { continue; }
        if (!rec.sub?.endpoint) continue;
        await db.prepare('INSERT OR IGNORE INTO haru_alarm_devices(id,room,payload) VALUES(?,?,?)')
          .bind(key.name.slice(4), rec.room || '', raw).run();
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    await db.prepare("INSERT OR REPLACE INTO haru_alarm_meta(id,value) VALUES('migrated','1')").run();
  } catch {
    await db.prepare("INSERT OR REPLACE INTO haru_alarm_meta(id,value) VALUES('retry',?)")
      .bind(String(Date.now() + 600000)).run();
  }
}
function alarmRoom(room) {
  return typeof room === 'string' && /^[A-Za-z0-9._-]{4,40}$/.test(room) ? room : '';
}
async function alarmRegister(env, id, rec) {
  const db = await alarmDatabase(env);
  await db.prepare("INSERT INTO haru_alarm_devices(id,room,payload,removed) VALUES(?,?,?,0) ON CONFLICT(id) DO UPDATE SET room=COALESCE(NULLIF(excluded.room,''),haru_alarm_devices.room),payload=excluded.payload,removed=0")
    .bind(id, alarmRoom(rec.room), JSON.stringify(rec)).run();
}
async function alarmUnregister(env, id) {
  const db = await alarmDatabase(env);
  await db.prepare("INSERT INTO haru_alarm_devices(id,room,payload,removed) VALUES(?,'',NULL,1) ON CONFLICT(id) DO UPDATE SET payload=NULL,removed=1").bind(id).run();
  await env.HARU.delete('sub:' + id);
}
async function alarmSubscription(env, id) {
  const db = await alarmDatabase(env);
  const saved = await db.prepare('SELECT payload,removed FROM haru_alarm_devices WHERE id=?').bind(id).first();
  if (saved) return saved.removed ? null : JSON.parse(saved.payload);
  const raw = await env.HARU.get('sub:' + id);
  return raw ? JSON.parse(raw) : null;
}
function alarmCleanSchedule(body) {
  const valid = a => a && typeof a.k === 'string' && typeof a.title === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.at);
  if (!Array.isArray(body.weekly) || !Array.isArray(body.dated) ||
      body.weekly.length > 1000 || body.dated.length > 20000 ||
      !body.weekly.every(a => valid(a) && Array.isArray(a.dow) && a.dow.every(d => Number.isInteger(d) && d >= 0 && d < 7)) ||
      !body.dated.every(a => valid(a) && /^\d{4}-\d{2}-\d{2}$/.test(a.date))) throw Error('알림 시간표 형식을 확인해 주세요');
  return {tz:typeof body.tz === 'number' ? body.tz : -540, weekly:body.weekly, dated:body.dated};
}
async function alarmPublish(env, body) {
  const room = alarmRoom(body.room);
  if (!room || !Number.isSafeInteger(body.revision) || body.revision < 0) throw Error('동기화 번호가 필요해요');
  const db = await alarmDatabase(env), schedule = alarmCleanSchedule(body);
  // Conditional insertion makes an older or incompletely merged client unable to replace the current schedule.
  const result = await db.prepare(
    'INSERT INTO haru_alarm_schedules(room,revision,payload) SELECT ?,?,? WHERE ?=(SELECT COALESCE(MAX(seq),0) FROM haru_sync_ops WHERE room=?) ON CONFLICT(room) DO UPDATE SET revision=excluded.revision,payload=excluded.payload WHERE excluded.revision>=haru_alarm_schedules.revision'
  ).bind(room,body.revision,JSON.stringify(schedule),body.revision,room).run();
  return {ok:true, accepted:Number(result.meta?.changes ?? result.changes ?? 0) > 0};
}
async function alarmRecipients(env) {
  await alarmMigrate(env);
  const db = await alarmDatabase(env);
  const rows = (await db.prepare('SELECT d.id,d.payload,d.room,s.payload AS schedule,s.revision,(SELECT COALESCE(MAX(seq),0) FROM haru_sync_ops o WHERE o.room=d.room) AS currentRevision FROM haru_alarm_devices d LEFT JOIN haru_alarm_schedules s ON s.room=d.room WHERE d.removed=0').all()).results;
  const recipients = rows.flatMap(row => {
    const rec = JSON.parse(row.payload);
    // New shared-room clients wait for the matching schedule instead of sending stale reminders.
    if (row.room) {
      if (!row.schedule || row.revision !== row.currentRevision) return [];
      Object.assign(rec, JSON.parse(row.schedule));
    }
    return [{id:row.id, rec}];
  });
  const isPhone = rec => rec.device === 'phone' || /\.push\.apple\.com\//.test(rec.sub?.endpoint || '');
  return recipients.sort((a,b) => Number(isPhone(b.rec)) - Number(isPhone(a.rec)));
}

/* Send to each registered device using the shared room schedule. */
async function runAlarms(env) {
  if (!env.HARU || !env.VAPID_JWK) return {sent:0, checked:0};
  const recipients = await alarmRecipients(env);
  let sent = 0;
  for (const {id,rec} of recipients) {
    for (const alarm of dueAlarms(rec)) {
      try {
        const status = await push(env,rec.sub,{
          title:alarm.title||'하루',body:alarm.body||'',
          tag:(alarm.k||'haru')+':'+localParts(rec.tz).date+':'+alarm.at
        });
        if (status>=200 && status<300) sent++;
        if (status===404 || status===410) {await alarmUnregister(env,id);break;}
      } catch {}
    }
  }
  return {sent,checked:recipients.length};
}

/* ── 라우팅 ── */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/' || url.pathname === '/health') {
      const ok = !!(env.VAPID_PUBLIC && env.VAPID_JWK && env.HARU);
      return json({
        ok,
        haru: '알림 서버가 살아 있어요',
        serverVersion: 'v152',
        syncProtocol: 2,
        syncStorage: 'd1',
        syncReady: !!env.HARU_SYNC_DB,
        alarmStorage: 'd1',
        sharedAlarms: true,
        설정: {
          공개열쇠: !!env.VAPID_PUBLIC,
          비밀열쇠: !!env.VAPID_JWK,
          연락처: env.VAPID_SUBJECT || '(없음)',
          저장소KV: !!env.HARU
        }
      }, ok ? 200 : 500);
    }

    if (url.pathname === '/tick') {
      const r = await runAlarms(env);
      const t = localParts(-540);
      return json({ ok: true, 지금: t.hm, 보낸알림: r.sent, 등록기기: r.checked });
    }

    if (url.pathname === '/alarm-schedule' && req.method === 'POST') {
      try { return json(await alarmPublish(env, await req.json())); }
      catch(error) {return json({error:String(error.message||error)},400);}
    }

    if (url.pathname === '/sync-v2' && req.method === 'POST') return syncEndpoint(req, env);

    /* ── 기기 사이 기록 동기화 ── */
    if (url.pathname === '/sync' && req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch (e) { return json({ error: '잘못된 요청' }, 400); }
      const room = String((b && b.room) || '').trim();
      if (!/^[A-Za-z0-9._-]{4,40}$/.test(room)) return json({ error: '동기화 코드 형식이 맞지 않아요' }, 400);
      const key = 'data:' + room;

      // 서버에 있는 것 읽기
      const raw = await env.HARU.get(key);
      let server = null;
      if (raw) { try { server = JSON.parse(raw); } catch (e) { server = null; } }

      // 올려보낸 것이 없으면 서버 것만 돌려줌 (내려받기)
      if (!b.data) {
        return json({ ok: true, data: server ? server.data : null, rev: server ? server.rev : 0 });
      }

      await syncKeepLegacy(env.HARU, room, b, server, env.HARU_SYNC_DB);

      const myRev = typeof b.rev === 'number' ? b.rev : 0;
      const svRev = server ? server.rev : 0;

      // 서버가 더 최신이면 내 것을 덮지 않고 서버 것을 내려줌
      if (svRev > myRev) {
        return json({ ok: true, stale: true, data: server.data, rev: svRev });
      }

      const rev = svRev + 1;
      await env.HARU.put(key, JSON.stringify({ rev, data: b.data, at: new Date().toISOString() }));
      return json({ ok: true, saved: true, rev });
    }

    /* 위젯용 요약 저장·조회 */
    if (url.pathname === '/summary') {
      const room = String(url.searchParams.get('room') || '').trim();
      if (!/^[A-Za-z0-9._-]{4,40}$/.test(room)) return json({ error: 'room 형식이 맞지 않아요' }, 400);
      const key = 'sum:' + room;

      if (req.method === 'POST') {
        let b;
        try { b = await req.json(); } catch (e) { return json({ error: '잘못된 요청' }, 400); }
        await env.HARU.put(key, JSON.stringify({ ...b, at: new Date().toISOString() }));
        return json({ ok: true });
      }

      const raw = await env.HARU.get(key);
      if (!raw) return json({ error: '아직 올라온 요약이 없어요' }, 404);
      return new Response(raw, {
        headers: { 'content-type': 'application/json; charset=utf-8',
                   'access-control-allow-origin': '*',
                   'cache-control': 'no-store' }
      });
    }

    if (url.pathname === '/key') {
      if (!env.VAPID_PUBLIC) return json({ error: 'VAPID_PUBLIC 환경 변수가 없어요' }, 500);
      return json({ key: env.VAPID_PUBLIC });
    }

    if (url.pathname === '/register' && req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch (e) { return json({ error: '잘못된 요청' }, 400); }
      if (!b || !b.id || !b.sub || !b.sub.endpoint) return json({ error: 'id와 sub가 필요해요' }, 400);
      const rec = {
        sub: b.sub,
        room: alarmRoom(b.room),
        device: b.device==='phone'?'phone':'desktop',
        tz: typeof b.tz === 'number' ? b.tz : 0,
        weekly: (b.weekly || []).slice(0, 300),
        dated: (b.dated || []).slice(0, 500),
        updated: new Date().toISOString()
      };
      await alarmRegister(env,b.id,rec);
      return json({ ok: true, weekly: rec.weekly.length, dated: rec.dated.length });
    }

    if (url.pathname === '/test' && req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch (e) { return json({ error: '잘못된 요청' }, 400); }
      const rec = b && b.id ? await alarmSubscription(env,b.id) : null;
      if (!rec) return json({ error: '등록된 기기가 없어요. 앱에서 알림 켜기를 먼저 누르세요.' }, 404);
      const t = localParts(rec.tz);
      const status = await push(env, rec.sub, {
        title: '하루 알림 테스트',
        body: `잘 연결됐어요. 지금 ${t.hm} 입니다.`,
        tag: 'haru-test'
      });
      return json({ ok: status >= 200 && status < 300, status });
    }

    if (url.pathname === '/unregister' && req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch (e) { b = null; }
      if (b && b.id) await alarmUnregister(env,b.id);
      return json({ ok: true });
    }

    return json({ error: '없는 주소' }, 404);
  },

  /* ── 매분 실행 (Cron 또는 /tick 호출) ── */
  async scheduled(event, env, ctx) {
    await runAlarms(env);
  }
};
