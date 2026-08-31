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

const TE = new TextEncoder();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });

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
    if (a.at === t.hm && Array.isArray(a.dow) && a.dow.includes(t.dow)) out.push(a);
  });
  (rec.dated || []).forEach(a => {
    if (a.at === t.hm && a.date === t.date) out.push(a);
  });
  return out;
}

/* ── 알림 발송 본체 ── */
async function runAlarms(env) {
  if (!env.HARU || !env.VAPID_JWK) return { sent: 0, note: '설정 미완료' };
  let sent = 0, checked = 0, cursor;
  do {
    const list = await env.HARU.list({ prefix: 'sub:', cursor });
    cursor = list.list_complete ? null : list.cursor;
    for (const k of list.keys) {
      const raw = await env.HARU.get(k.name);
      if (!raw) continue;
      let rec;
      try { rec = JSON.parse(raw); } catch (e) { continue; }
      checked++;
      const due = dueAlarms(rec);
      for (const a of due) {
        try {
          const status = await push(env, rec.sub, {
            title: a.title || '하루',
            body: a.body || '',
            tag: (a.k || 'haru') + ':' + Date.now()
          });
          if (status >= 200 && status < 300) sent++;
          if (status === 404 || status === 410) await env.HARU.delete(k.name);
        } catch (e) { /* 한 건 실패해도 나머지는 계속 */ }
      }
    }
  } while (cursor);
  return { sent, checked };
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
        tz: typeof b.tz === 'number' ? b.tz : 0,
        weekly: (b.weekly || []).slice(0, 300),
        dated: (b.dated || []).slice(0, 500),
        updated: new Date().toISOString()
      };
      await env.HARU.put('sub:' + b.id, JSON.stringify(rec));
      return json({ ok: true, weekly: rec.weekly.length, dated: rec.dated.length });
    }

    if (url.pathname === '/test' && req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch (e) { return json({ error: '잘못된 요청' }, 400); }
      const raw = b && b.id ? await env.HARU.get('sub:' + b.id) : null;
      if (!raw) return json({ error: '등록된 기기가 없어요. 앱에서 알림 켜기를 먼저 누르세요.' }, 404);
      const rec = JSON.parse(raw);
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
      if (b && b.id) await env.HARU.delete('sub:' + b.id);
      return json({ ok: true });
    }

    return json({ error: '없는 주소' }, 404);
  },

  /* ── 매분 실행 (Cron 또는 /tick 호출) ── */
  async scheduled(event, env, ctx) {
    await runAlarms(env);
  }
};
