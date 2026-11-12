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
