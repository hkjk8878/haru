// ─────────────────────────────────────────────
//  하루 — 아이폰 홈 화면 위젯 (Scriptable 용)
//
//  쓰는 법
//  1) 앱스토어에서 무료 앱 "Scriptable" 설치
//  2) Scriptable 열기 → 오른쪽 위 ＋ → 이 파일 내용 전부 붙여넣기
//  3) 아래 URL 줄을 하루 앱 설정 탭에서 복사한 주소로 바꾸기
//  4) 이름을 "하루"로 저장
//  5) 홈 화면 길게 누르기 → ＋ → Scriptable → 위젯 크기 고르기
//     → 위젯 길게 누르기 → "위젯 편집" → Script: 하루
// ─────────────────────────────────────────────

const URL = "https://haru-alarm.hkjk8878.workers.dev/summary?room=여기에_동기화_코드";

// 색
const SKY   = new Color("#56B7F2");
const PINK  = new Color("#F2789A");
const GREEN = new Color("#34D399");
const GOLD  = new Color("#E5B15E");
const INK   = new Color("#E9EBF2");
const MUTED = new Color("#8A90A0");
const BG    = new Color("#181B22");
const LINE  = new Color("#272B35");

let data = null;
try {
  const r = new Request(URL);
  r.timeoutInterval = 8;
  data = await r.loadJSON();
} catch (e) {
  data = null;
}

const w = new ListWidget();
w.backgroundColor = BG;
w.setPadding(14, 14, 14, 14);
w.url = "https://hkjk8878.github.io/haru/";

if (!data || data.error) {
  const t = w.addText("하루");
  t.font = Font.boldSystemFont(15);
  t.textColor = INK;
  w.addSpacer(6);
  const e = w.addText(data && data.error ? data.error : "불러오지 못했어요");
  e.font = Font.systemFont(11);
  e.textColor = MUTED;
  e.lineLimit = 3;
} else {
  const size = config.widgetFamily || "medium";
  const hb = data.habit || { done: 0, total: 0 };
  const td = data.todo || { done: 0, total: 0, list: [] };
  const mn = data.money || { spent: 0, budget: 0, left: 0 };
  const pct = hb.total ? hb.done / hb.total : 0;

  // 머리줄
  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText(data.off ? "오늘은 쉬는 날" : "오늘");
  title.font = Font.boldSystemFont(14);
  title.textColor = data.off ? GOLD : INK;
  head.addSpacer();
  if (data.next) {
    const nx = head.addText(data.next.at + " " + data.next.label);
    nx.font = Font.systemFont(10);
    nx.textColor = MUTED;
    nx.lineLimit = 1;
  }
  w.addSpacer(9);

  // 습관 진행 막대
  const barW = size === "small" ? 126 : (size === "large" ? 300 : 300);
  const bar = w.addStack();
  bar.layoutHorizontally();
  bar.size = new Size(barW, 8);
  bar.cornerRadius = 4;
  bar.backgroundColor = LINE;
  if (pct > 0) {
    const fill = bar.addStack();
    fill.size = new Size(Math.max(6, Math.round(barW * pct)), 8);
    fill.cornerRadius = 4;
    fill.backgroundColor = SKY;
  }
  w.addSpacer(7);

  const line1 = w.addStack();
  const l1 = line1.addText(`습관 ${hb.done}/${hb.total}`);
  l1.font = Font.mediumSystemFont(12);
  l1.textColor = SKY;
  line1.addSpacer(10);
  const l2 = line1.addText(`할 일 ${td.done}/${td.total}`);
  l2.font = Font.mediumSystemFont(12);
  l2.textColor = PINK;

  if (size !== "small") {
    line1.addSpacer(10);
    const l3 = line1.addText(
      mn.budget ? `남은 예산 ${short(mn.left)}` : `지출 ${short(mn.spent)}`
    );
    l3.font = Font.mediumSystemFont(12);
    l3.textColor = mn.budget && mn.left < 0 ? PINK : GREEN;
  }

  // 남은 할 일 · 일정
  const rows = [];
  (data.events || []).forEach(e => rows.push({ c: SKY, t: `${e.t} ${e.n}` }));
  (td.list || []).forEach(x => rows.push({ c: PINK, t: `○ ${x}` }));
  const max = size === "large" ? 6 : (size === "medium" ? 3 : 2);

  if (rows.length) {
    w.addSpacer(9);
    rows.slice(0, max).forEach(r => {
      const s = w.addStack();
      const dot = s.addText("•");
      dot.font = Font.systemFont(11);
      dot.textColor = r.c;
      s.addSpacer(5);
      const tx = s.addText(r.t);
      tx.font = Font.systemFont(11);
      tx.textColor = INK;
      tx.lineLimit = 1;
      w.addSpacer(3);
    });
  } else {
    w.addSpacer(9);
    const done = w.addText(hb.total && hb.done >= hb.total ? "오늘 할 것 다 했어요" : "남은 게 없어요");
    done.font = Font.systemFont(11);
    done.textColor = MUTED;
  }

  // 연속 기록 (큰 위젯만)
  if (size === "large" && (data.streaks || []).length) {
    w.addSpacer(8);
    const st = w.addStack();
    data.streaks.forEach((x, i) => {
      if (i) st.addSpacer(8);
      const s = st.addText(`🔥 ${x.n} ${x.d}일`);
      s.font = Font.systemFont(11);
      s.textColor = GOLD;
    });
  }

  w.addSpacer();
  const foot = w.addText(hhmm());
  foot.font = Font.systemFont(9);
  foot.textColor = MUTED;
  foot.rightAlignText();
}

w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();

function short(n) {
  n = Math.round(n || 0);
  const neg = n < 0 ? "-" : "";
  n = Math.abs(n);
  if (n >= 10000) return neg + (Math.round(n / 1000) / 10) + "만";
  if (n >= 1000) return neg + (Math.round(n / 100) / 10) + "천";
  return neg + n;
}
function hhmm() {
  const d = new Date();
  const p = x => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} 기준`;
}
