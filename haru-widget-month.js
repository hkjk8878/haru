// ─────────────────────────────────────────────
//  하루 — 한 달 달력 위젯 (Scriptable 용)
//
//  ※ 큰(Large) 위젯 전용입니다. 중간·작은 크기는 글자가 안 들어가요.
//
//  1) URL 을 하루 앱 설정 탭 → 홈 화면 위젯 → 주소 복사하기 로 바꾸세요
//  2) Scriptable 에 붙여넣고 "하루 달력" 으로 저장
//  3) 홈 화면 → 큰 위젯 추가 → 위젯 편집 → Script: 하루 달력
// ─────────────────────────────────────────────

const URL  = "https://haru-alarm.hkjk8878.workers.dev/summary?room=여기에_동기화_코드";
const OPEN = "https://hkjk8878.github.io/haru/";

const SKY   = new Color("#56B7F2");
const PINK  = new Color("#F2789A");
const GOLD  = new Color("#E5B15E");
const INK   = new Color("#E9EBF2");
const MUTED = new Color("#8A90A0");
const FAINT = new Color("#5A6070");
const BG    = new Color("#181B22");
const CELL  = new Color("#1F232C");

let data = null;
try {
  /* 위젯이 예전 응답을 붙잡지 않도록 매번 다른 주소로 요청한다 */
  const bust = (URL.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now();
  const r = new Request(URL + bust);
  r.timeoutInterval = 8;
  r.headers = { "cache-control": "no-cache", "pragma": "no-cache" };
  data = await r.loadJSON();
} catch (e) { data = null; }

const w = new ListWidget();
w.backgroundColor = BG;
w.setPadding(9, 9, 9, 9);
w.url = OPEN;

if (!data || data.error || !data.month) {
  const t = w.addText("하루 달력");
  t.font = Font.boldSystemFont(15); t.textColor = INK;
  w.addSpacer(6);
  const e = w.addText(data && data.error ? data.error : "불러오지 못했어요");
  e.font = Font.systemFont(11); e.textColor = MUTED; e.lineLimit = 3;
} else {
  const mo = data.month;
  const [y, m] = mo.ym.split("-").map(Number);
  const hb = data.habit || { done: 0, total: 0 };
  const td = data.todo || { done: 0, total: 0 };

  /* 머리 */
  const head = w.addStack();
  head.centerAlignContent();
  const ttl = head.addText(`${m}월`);
  ttl.font = Font.boldSystemFont(14);
  ttl.textColor = INK;
  head.addSpacer();
  const sub = head.addText(`습관 ${hb.done}/${hb.total} · 할 일 ${td.done}/${td.total}`);
  sub.font = Font.systemFont(9.5);
  sub.textColor = MUTED;
  w.addSpacer(5);

  /* 요일 */
  const hd = w.addStack();
  ["일","월","화","수","목","금","토"].forEach((d, i) => {
    const c = hd.addStack();
    c.size = new Size(45, 11);
    c.centerAlignContent();
    const t = c.addText(d);
    t.font = Font.systemFont(8);
    t.textColor = (i === 0 || i === 6) ? PINK : FAINT;
  });
  w.addSpacer(3);

  /* 날짜 칸 */
  const cells = [];
  for (let i = 0; i < mo.lead; i++) cells.push(null);
  for (let i = 1; i <= mo.days; i++) cells.push(i);
  while (cells.length % 7) cells.push(null);
  const rowsN = cells.length / 7;
  const cellH = rowsN >= 6 ? 44 : 52;

  for (let r = 0; r < rowsN; r++) {
    const row = w.addStack();
    for (let c = 0; c < 7; c++) {
      const d = cells[r * 7 + c];
      const cell = row.addStack();
      cell.layoutVertically();
      cell.size = new Size(45, cellH);
      cell.setPadding(2, 3, 2, 1);
      if (d == null) { cell.addText(" "); continue; }

      const isToday = d === mo.today;
      if (isToday) { cell.backgroundColor = SKY; cell.cornerRadius = 6; }
      else { cell.backgroundColor = CELL; cell.cornerRadius = 6; }

      const num = cell.addText(String(d));
      num.font = isToday ? Font.boldSystemFont(9.5) : Font.systemFont(9.5);
      num.textColor = isToday ? new Color("#0A1017") : ((c === 0 || c === 6) ? PINK : INK);

      const raw = (mo.it || {})[d];
      /* 할 일(k==='t')은 달력에 넣지 않는다 */
      const keep = raw ? (raw.a || []).filter(x => x.k !== "t") : [];
      const hidden = raw ? (raw.m || 0) + ((raw.a || []).length - keep.length) : 0;
      const info = keep.length ? { a: keep, m: raw.m || 0 } : null;
      if (info) {
        info.a.forEach(x => {
          const t = cell.addText(x.t);
          t.font = Font.systemFont(7.5);
          t.lineLimit = 1;
          t.minimumScaleFactor = 0.9;
          t.textColor = isToday ? new Color("#0A1017")
            : (x.c ? new Color(x.c) : (x.k === "g" ? GOLD : SKY));
        });
        if (info.m) {
          const mm = cell.addText(`+${info.m}`);
          mm.font = Font.systemFont(7);
          mm.textColor = isToday ? new Color("#0A1017") : FAINT;
        }
      }
    }
    w.addSpacer(2);
  }

  w.addSpacer();
  const foot = w.addText(hhmm(data && data.at));
  foot.font = Font.systemFont(8);
  foot.textColor = FAINT;
  foot.rightAlignText();
}

w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w);
else await w.presentLarge();
Script.complete();

function hhmm(at) {
  const p = x => String(x).padStart(2, "0");
  const now = new Date();
  const cur = `${p(now.getHours())}:${p(now.getMinutes())}`;
  if (!at) return `${cur} 확인`;
  const d = new Date(at);
  const dat = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return `기록 ${dat} · 확인 ${cur}`;
}
