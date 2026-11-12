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
