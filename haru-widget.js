// ─────────────────────────────────────────────
//  하루 — 오늘 위젯 (Scriptable 용)
//
//  1) URL 을 하루 앱 설정 탭 → 홈 화면 위젯 → 주소 복사하기 로 바꾸세요
//  2) Scriptable 에 붙여넣고 "하루" 로 저장
//  3) 홈 화면 → 위젯 추가 → 위젯 편집 → Script: 하루
//     When Interacting 은 Open App 그대로 두세요
// ─────────────────────────────────────────────

const URL  = "https://haru-alarm.hkjk8878.workers.dev/summary?room=여기에_동기화_코드";
const OPEN = "https://hkjk8878.github.io/haru/";

const SKY   = new Color("#56B7F2");
const PINK  = new Color("#F2789A");
const GREEN = new Color("#34D399");
const GOLD  = new Color("#E5B15E");
const INK   = new Color("#E9EBF2");
const MUTED = new Color("#8A90A0");
const FAINT = new Color("#5A6070");
const BG    = new Color("#181B22");
const LINE  = new Color("#2A2F3A");

let data = null;
try {
  const bust = (URL.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now();
  const r = new Request(URL + bust);
  r.timeoutInterval = 8;
  r.headers = { "cache-control": "no-cache", "pragma": "no-cache" };
  data = await r.loadJSON();
} catch (e) { data = null; }

const size  = config.widgetFamily || "medium";
const small = size === "small";
const large = size === "large";

const w = new ListWidget();
w.backgroundColor = BG;
w.setPadding(9, 11, 9, 11);
w.url = OPEN;

if (!data || data.error) {
  const t = w.addText("하루");
  t.font = Font.boldSystemFont(14); t.textColor = INK;
  w.addSpacer(5);
  const e = w.addText(data && data.error ? data.error : "불러오지 못했어요");
  e.font = Font.systemFont(11); e.textColor = MUTED; e.lineLimit = 3;
} else {
  const hb = data.habit || { done: 0, total: 0 };
  const td = data.todo  || { done: 0, total: 0, list: [], all: [] };
  const mn = data.money || { spent: 0, budget: 0, left: 0 };
  const pct = hb.total ? hb.done / hb.total : 0;

  /* 첫 줄 — 숫자만 (제목 없음) */
  const top = w.addStack();
  top.centerAlignContent();
  num(top, "습관", `${hb.done}/${hb.total}`, SKY);
  top.addSpacer(11);
  num(top, "할 일", `${td.done}/${td.total}`, PINK);
  if (!small) {
    top.addSpacer();
    const box = top.addStack();
    box.layoutVertically();
    const l1 = box.addText(
      `오늘 ${short(mn.today || 0)} · 달 ${short(mn.spent)}`);
    l1.font = Font.systemFont(9.5);
    l1.textColor = MUTED;
    l1.rightAlignText();
    l1.lineLimit = 1;
    l1.minimumScaleFactor = 0.75;
    if (mn.budget) {
      const l2 = box.addText(`남은 ${short(mn.left)}`);
      l2.font = Font.boldSystemFont(11.5);
      l2.textColor = mn.left < 0 ? PINK : GREEN;
      l2.rightAlignText();
      l2.lineLimit = 1;
      l2.minimumScaleFactor = 0.8;
    }
  }
  w.addSpacer(5);

  /* 진행 막대 */
  const barW = small ? 124 : 300;
  const bar = w.addStack();
  bar.size = new Size(barW, 4);
  bar.cornerRadius = 2;
  bar.backgroundColor = LINE;
  if (pct > 0) {
    const f = bar.addStack();
    f.size = new Size(Math.max(3, Math.round(barW * pct)), 4);
    f.cornerRadius = 2;
    f.backgroundColor = SKY;
  }
  w.addSpacer(7);

  /* 오늘 목록 (일정 + 할 일) */
  const rows = [];
  (data.events || []).forEach(e =>
    rows.push({ c: e.c ? new Color(e.c) : SKY, k: e.t, t: e.n }));
  if (td.all && td.all.length) {
    td.all.forEach(x => rows.push({
      c: x.d ? FAINT : PINK, k: x.d ? "✓" : "○", t: x.t, dim: x.d }));
  } else {
    (td.list || []).forEach(x => rows.push({ c: PINK, k: "○", t: x }));
  }
  rows.sort((a, b) => (a.dim ? 1 : 0) - (b.dim ? 1 : 0));

  if (small) {
    const box = w.addStack(); box.layoutVertically();
    listInto(box, rows, 5, 10.5);
  } else if (!large) {
    twoCols(w, rows, 10, 10.5, 143);
  } else {
    twoCols(w, rows, 8, 11, 148);
    w.addSpacer(8);

    /* 이번 주 일정 — 월~일 두 칸으로 */
    const wk = data.week || [];
    const cols = w.addStack();
    cols.layoutHorizontally();
    cols.topAlignContent();
    const L = cols.addStack(); L.layoutVertically(); L.size = new Size(148, 0);
    cols.addSpacer(6);
    const R = cols.addStack(); R.layoutVertically(); R.size = new Size(148, 0);
    wk.slice(0, 4).forEach((d, i) => dayRow(L, d, i));
    wk.slice(4).forEach((d, i) => dayRow(R, d, i));
  }

  w.addSpacer();
  const foot = w.addText(stamp(data.at));
  foot.font = Font.systemFont(8);
  foot.textColor = FAINT;
  foot.rightAlignText();
}

w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w);
else if (large) await w.presentLarge();
else if (small) await w.presentSmall();
else await w.presentMedium();
Script.complete();

/* ── 조각들 ── */
function num(stack, label, value, color) {
  const s = stack.addStack();
  s.centerAlignContent();
  const l = s.addText(label);
  l.font = Font.systemFont(9.5); l.textColor = MUTED;
  s.addSpacer(3);
  const v = s.addText(value);
  v.font = Font.boldSystemFont(12.5); v.textColor = color;
}

function twoCols(box, rows, max, fs, cw) {
  const cols = box.addStack();
  cols.layoutHorizontally();
  cols.topAlignContent();
  const L = cols.addStack(); L.layoutVertically(); L.size = new Size(cw, 0);
  cols.addSpacer(6);
  const R = cols.addStack(); R.layoutVertically(); R.size = new Size(cw, 0);
  const half = Math.ceil(max / 2);
  listInto(L, rows.slice(0, half), half, fs);
  listInto(R, rows.slice(half, max), half, fs, true);
  if (rows.length > max) {
    const hid = rows.slice(max);
    const left = hid.filter(x => !x.dim).length;
    R.addSpacer(3);
    const m = R.addText(left ? `+${left}개 남음` : `+${hid.length}개 더`);
    m.font = Font.systemFont(9);
    m.textColor = left ? PINK : FAINT;
  }
}

function listInto(box, rows, max, fs, quiet) {
  if (!rows.length) {
    if (quiet) return;
    const t = box.addText("남은 것이 없어요");
    t.font = Font.systemFont(10.5); t.textColor = FAINT; t.lineLimit = 1;
    return;
  }
  rows.slice(0, max).forEach((r, i) => {
    if (i) box.addSpacer(3);
    const s = box.addStack();
    s.centerAlignContent();
    const k = s.addText(r.k);
    k.font = Font.mediumSystemFont(fs - 1.5);
    k.textColor = r.c; k.lineLimit = 1;
    s.addSpacer(4);
    const t = s.addText(r.t);
    t.font = Font.systemFont(fs);
    t.textColor = r.dim ? FAINT : INK;
    t.lineLimit = 1;
  });
}

function dayRow(box, dy, i) {
  if (i) box.addSpacer(4);
  const row = box.addStack();
  row.topAlignContent();

  const d = row.addStack();
  d.layoutVertically();
  d.size = new Size(26, 0);
  const dd = d.addText(String(dy.day));
  dd.font = dy.today ? Font.boldSystemFont(10.5) : Font.systemFont(10.5);
  dd.textColor = dy.today ? SKY : ((dy.dow === "토" || dy.dow === "일") ? PINK : INK);
  const dw = d.addText(dy.dow);
  dw.font = Font.systemFont(8);
  dw.textColor = FAINT;

  const c = row.addStack();
  c.layoutVertically();
  if (!dy.items.length) {
    const e = c.addText("—");
    e.font = Font.systemFont(9.5); e.textColor = FAINT;
    return;
  }
  dy.items.forEach((it, k) => {
    if (k) c.addSpacer(1);
    const t = c.addText(it.t);
    t.font = Font.systemFont(9.5);
    t.textColor = it.c ? new Color(it.c) : SKY;
    t.lineLimit = 1;
  });
  if (dy.more) {
    const m = c.addText(`+${dy.more}`);
    m.font = Font.systemFont(8.5); m.textColor = FAINT;
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
function stamp(at) {
  const p = x => String(x).padStart(2, "0");
  const now = new Date();
  const cur = `${p(now.getHours())}:${p(now.getMinutes())}`;
  if (!at) return `${cur} 확인`;
  const d = new Date(at);
  return `기록 ${p(d.getHours())}:${p(d.getMinutes())} · 확인 ${cur}`;
}
