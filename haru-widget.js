// ─────────────────────────────────────────────
//  하루 — 아이폰 홈 화면 위젯 (Scriptable 용)
//
//  1) URL 을 하루 앱 설정 탭 → 홈 화면 위젯 → 주소 복사하기 로 바꾸세요
//  2) Scriptable 에 붙여넣고 "하루" 로 저장
//  3) 홈 화면 → 위젯 추가 → Scriptable → 위젯 편집 → Script: 하루
//
//  큰 위젯은 오늘 목록 + 이번 주 5일치 일정을 함께 보여줍니다.
// ─────────────────────────────────────────────

const URL  = "https://haru-alarm.hkjk8878.workers.dev/summary?room=여기에_동기화_코드";
const OPEN = "https://hkjk8878.github.io/haru/";

const SKY   = new Color("#56B7F2");
const PINK  = new Color("#F2789A");
const GREEN = new Color("#34D399");
const GOLD  = new Color("#E5B15E");
const INK   = new Color("#E9EBF2");
const MUTED = new Color("#8A90A0");
const FAINT = new Color("#565C6B");
const BG    = new Color("#181B22");
const LINE  = new Color("#2A2F3A");

let data = null;
try {
  const r = new Request(URL);
  r.timeoutInterval = 8;
  data = await r.loadJSON();
} catch (e) { data = null; }

const size  = config.widgetFamily || "medium";
const small = size === "small";
const large = size === "large";

const w = new ListWidget();
w.backgroundColor = BG;
w.setPadding(10, 12, 10, 12);
w.url = OPEN;

if (!data || data.error) {
  const t = w.addText("하루");
  t.font = Font.boldSystemFont(15); t.textColor = INK;
  w.addSpacer(6);
  const e = w.addText(data && data.error ? data.error : "불러오지 못했어요");
  e.font = Font.systemFont(11); e.textColor = MUTED; e.lineLimit = 3;
} else {
  const hb = data.habit || { done: 0, total: 0 };
  const td = data.todo  || { done: 0, total: 0, list: [] };
  const mn = data.money || { spent: 0, budget: 0, left: 0 };
  const pct = hb.total ? hb.done / hb.total : 0;

  /* 윗줄 */
  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText(data.off ? "쉬는 날" : "오늘");
  title.font = Font.boldSystemFont(12.5);
  title.lineLimit = 1;
  title.textColor = data.off ? GOLD : INK;
  head.addSpacer();
  if (data.next && !small) {
    const nx = head.addText(`${data.next.at} ${data.next.label}`);
    nx.font = Font.systemFont(9.5);
    nx.textColor = MUTED;
    nx.lineLimit = 1;
    nx.minimumScaleFactor = 0.8;
  }
  w.addSpacer(6);

  /* 숫자 줄 */
  const nums = w.addStack();
  nums.centerAlignContent();
  pair(nums, "습관", `${hb.done}/${hb.total}`, SKY);
  nums.addSpacer(small ? 10 : 14);
  pair(nums, "할 일", `${td.done}/${td.total}`, PINK);
  if (!small) {
    nums.addSpacer();
    const box = nums.addStack();
    box.layoutVertically();
    const a = box.addText(`지출 ${short(mn.spent)}`);
    a.font = Font.mediumSystemFont(11); a.textColor = MUTED; a.rightAlignText();
    if (mn.budget) {
      const b = box.addText(`남은 ${short(mn.left)}`);
      b.font = Font.boldSystemFont(12.5);
      b.textColor = mn.left < 0 ? PINK : GREEN;
      b.rightAlignText();
    }
  }
  w.addSpacer(6);

  /* 진행 막대 */
  const barW = small ? 122 : 302;
  const bar = w.addStack();
  bar.size = new Size(barW, 5);
  bar.cornerRadius = 3;
  bar.backgroundColor = LINE;
  if (pct > 0) {
    const fill = bar.addStack();
    fill.size = new Size(Math.max(4, Math.round(barW * pct)), 5);
    fill.cornerRadius = 3;
    fill.backgroundColor = SKY;
  }
  w.addSpacer(9);

  /* 목록 (+ 큰 위젯이면 오른쪽에 달력) */
  const rows = [];
  (data.events || []).forEach(e => rows.push({ c: SKY,  k: e.t, t: e.n }));
  (td.list || []).forEach(x     => rows.push({ c: PINK, k: "○",  t: x }));

  if (large) {
    const box = w.addStack();
    box.layoutVertically();
    listInto(box, rows, 4, 12);
    w.addSpacer(10);

    const cap = w.addStack();
    const cl = cap.addText("이번 주");
    cl.font = Font.boldSystemFont(11);
    cl.textColor = MUTED;
    w.addSpacer(5);

    (data.week || []).slice(1, 6).forEach((dy, i) => {
      if (i) w.addSpacer(5);
      const row = w.addStack();
      row.topAlignContent();

      const dcol = row.addStack();
      dcol.layoutVertically();
      dcol.size = new Size(34, 0);
      const dd = dcol.addText(`${dy.day}일`);
      dd.font = Font.boldSystemFont(11);
      dd.textColor = (dy.dow === "토" || dy.dow === "일") ? PINK : INK;
      const dw = dcol.addText(dy.dow);
      dw.font = Font.systemFont(8.5);
      dw.textColor = FAINT;

      const icol = row.addStack();
      icol.layoutVertically();
      if (!dy.items.length) {
        const e = icol.addText("—");
        e.font = Font.systemFont(10.5);
        e.textColor = FAINT;
      } else {
        dy.items.forEach((it, k) => {
          if (k) icol.addSpacer(2);
          const s2 = icol.addStack();
          s2.centerAlignContent();
          const kk = s2.addText(it.k);
          kk.font = Font.mediumSystemFont(9);
          kk.textColor = it.k === "○" ? PINK : (it.k === "D" ? GOLD : SKY);
          s2.addSpacer(5);
          const tt = s2.addText(it.t);
          tt.font = Font.systemFont(10.5);
          tt.textColor = INK;
          tt.lineLimit = 1;
        });
        if (dy.more) {
          const m = icol.addText(`+${dy.more}`);
          m.font = Font.systemFont(9);
          m.textColor = FAINT;
        }
      }
    });
  } else if (small) {
    const box = w.addStack();
    box.layoutVertically();
    listInto(box, rows, 3, 11);
  } else {
    /* 중간 크기: 좌우 두 칸으로 나눠 8개까지 */
    const cols = w.addStack();
    cols.layoutHorizontally();
    cols.topAlignContent();
    const L = cols.addStack(); L.layoutVertically(); L.size = new Size(146, 0);
    cols.addSpacer(8);
    const R = cols.addStack(); R.layoutVertically(); R.size = new Size(146, 0);
    const half = rows.slice(0, 8);
    listInto(L, half.slice(0, 4), 4, 11);
    if (half.length > 4) listInto(R, half.slice(4), 4, 11, true);
    if (rows.length > 8) {
      R.addSpacer(3);
      const m = R.addText(`+${rows.length - 8}개 더`);
      m.font = Font.systemFont(9.5); m.textColor = MUTED;
    }
  }

  w.addSpacer();
  const foot = w.addText(hhmm());
  foot.font = Font.systemFont(8.5);
  foot.textColor = MUTED;
  foot.rightAlignText();
}

w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w);
else if (large) await w.presentLarge();
else await w.presentMedium();
Script.complete();

/* ── 조각들 ── */
function pair(stack, label, value, color) {
  const s = stack.addStack();
  s.centerAlignContent();
  const l = s.addText(label);
  l.font = Font.systemFont(10.5); l.textColor = MUTED;
  s.addSpacer(4);
  const v = s.addText(value);
  v.font = Font.boldSystemFont(13); v.textColor = color;
}

function listInto(box, rows, max, fs, quiet) {
  if (!rows.length) {
    if (quiet) return;
    const t = box.addText("남은 일정과 할 일이 없어요");
    t.font = Font.systemFont(11); t.textColor = MUTED; t.lineLimit = 2;
    return;
  }
  rows.slice(0, max).forEach((r, i) => {
    if (i) box.addSpacer(4);
    const s = box.addStack();
    s.centerAlignContent();
    const k = s.addText(r.k);
    k.font = Font.mediumSystemFont(fs - 1.5);
    k.textColor = r.c; k.lineLimit = 1;
    s.addSpacer(5);
    const t = s.addText(r.t);
    t.font = Font.systemFont(fs);
    t.textColor = INK; t.lineLimit = 1;
  });
  if (rows.length > max) {
    box.addSpacer(4);
    const m = box.addText(`+${rows.length - max}개 더`);
    m.font = Font.systemFont(10); m.textColor = MUTED;
  }
}

function short(n) {
  n = Math.round(n || 0);
  const neg = n < 0 ? "-" : "";
  n = Math.abs(n);
  if (n >= 10000) return neg + (Math.round(n / 1000) / 10) + "만";
  if (n >= 1000) return neg + (Math.round(n / 100) / 10) + "천";
  return neg + n + "원";
}
function hhmm() {
  const d = new Date();
  const p = x => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} 기준`;
}
