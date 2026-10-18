/* v123: existing screens share the same data, storage and backup format. */
let haruConflict=null;
const haruOriginalHeader=header, haruOriginalDday=ddayStrip, haruOriginalMoney=vMoney;
const haruOriginalSet=vSet, haruOriginalTodo=tabTodo, haruOriginalTodoSheet=todoSheet;
const haruOriginalMcat=mcatSheet, haruOriginalRender=render;
const haruKinds={unset:'미지정',essential:'필수',flex:'조절 가능',once:'일회성'};
header=function(){
  const html=haruOriginalHeader();
  if(S.homeSummary===false)return html;
  const start=html.indexOf('<button class="yearbar"'), finish=html.indexOf('</button>',start);
  return start<0?html:html.slice(0,start)+html.slice(finish+9);
};
ddayStrip=function(){return S.homeSummary===false?haruOriginalDday():`<details class="haru-summary"><summary>목표와 연간 진행률 보기</summary>${haruOriginalDday()}<p class="haru-muted">${yearLeft().y}년 · ${yearLeft().left}일 남음</p></details>`;};
render=function(){haruOriginalRender();document.body.classList.toggle('haru-money',tab==='money');};
function haruData(){
  const rows=moneyIn(moneyMonth).map(x=>({...x}));
  // Unposted recurring items are obligations, not actual expenses.
  fixedOf(moneyMonth).forEach(f=>{
    if(!S.money.some(x=>x.fx===f.id+':'+moneyMonth))rows.push({id:'expected-'+f.id,type:f.type||'out',catId:f.catId,amount:fixAmt(f,moneyMonth),date:moneyMonth+'-'+pad(fixDayOf(f,moneyMonth)),plan:true,memo:f.name+' (미기록 고정 항목)'});
  });
  const budgets=Object.fromEntries(S.mcats.map(c=>[c.id,catBudFor(moneyMonth,c.id)]));
  const a=HaruFinance.analyze({ym:moneyMonth,today:today(),cats:S.mcats,current:rows,previous:moneyIn(prevYM(moneyMonth)),budget:budgetFor(moneyMonth),categoryBudgets:budgets});
  return {...a,rows};
}
function haruGoalCard(){
  const wk=monStart(today()), g=(S.moneyGoals||{})[wk];
  if(!g)return '';
  const end=addDays(wk,6), months=[monthOf(wk),monthOf(end)];
  const rs=[...new Set(months)].flatMap(ym=>moneyIn(ym)).filter(r=>!r.plan&&r.type==='out'&&!isSaving(r)&&r.catId===g.catId&&r.date>=wk&&r.date<=today()&&r.date<=end);
  const used=sum(rs,r=>r.amount), left=g.limit-used, name=mcatOf(g.catId).name;
  return `<div class="haru-insight"><b>이번 주 한 가지 · ${esc(name)}</b><br>${md(wk)}–${md(end)} · 목표 ${won(g.limit)} / 기록 ${won(used)}<br><span class="${left<0?'haru-danger':''}">${left>=0?won(left)+' 남음':won(-left)+' 초과'}</span>
    <div class="haru-progress"><i style="width:${g.limit?Math.min(100,used/g.limit*100):used?100:0}%"></i></div><div class="haru-actions"><button data-haru="goal">목표 수정</button></div><small>입력한 지출 기준입니다. 기록 누락 시 실제 소비와 다를 수 있어요.</small></div>`;
}
function haruMoneyBoard(a){
  const top=a.categories.filter(c=>c.amount>0).slice(0,3);
  const candidate=a.candidate;
  const compare=a.hasComparison?`${a.previousYM} ${a.compareDay}일까지 ↔ ${moneyMonth} ${a.currentCompareDay}일까지`:'비교할 지난달 지출 기록이 부족해요';
  const delta=n=>n===null?'—':(n>0?'+':'')+won(n);
  const obligation=a.planned+a.futureBooked;
  const kpi=(label,value)=>`<div><small>${label}</small><strong>${value}</strong></div>`;
  return `<div class="top"><div class="datenav"><div><h1>돈 관리 한눈에</h1><p class="sub">기록 → 비교 → 이번 주 한 가지</p></div><button class="pill g" data-newtx="1">＋ 기록</button></div></div>
    <section class="haru-board"><div class="calnav"><button data-mmonth="${prevYM(moneyMonth)}" aria-label="지난달">‹</button><b>${moneyMonth.replace('-','년 ')}월</b><button data-mmonth="${addYM(moneyMonth,1)}" aria-label="다음달">›</button></div>
    <div class="haru-kpis">${kpi('월 소비 예산',a.budget?won(a.budget):'설정 필요')}${kpi('기준일까지 실제 지출',won(a.spent))}${kpi('예정·미반영 소비',won(obligation))}${kpi('예정까지 반영한 여유',a.available===null?'예산 설정 후':won(a.available))}</div>
    <p class="haru-muted">${a.future?'미래 달 · 실제 지출 집계 전':`${moneyMonth}-${pad(a.end)}까지 기록 기준`} · 저축은 소비와 별도</p>
    <div class="haru-actions"><button data-budget="1">월 예산 설정</button><button data-haru="csv-summary">분류표 CSV</button><button data-haru="csv-records">상세 기록 CSV</button></div>
    <div class="haru-kpis haru-secondary">${kpi('수입',won(a.income))}${kpi('저축·투자',won(a.savings))}${kpi('기록상 수지',won(a.income-a.spent-a.savings))}${kpi('예산 사용률',a.budget?Math.round(a.spent/a.budget*100)+'%':'—')}</div>
    <details class="haru-muted"><summary>집계 기준 · 실제 통장 잔액과 달라요</summary><p>기록상 수지는 수입−소비−저축입니다. 예정·미반영 소비는 예정 기록 + 미기록 고정비 + 미래 날짜 소비입니다. 예정과 고정비를 따로 중복 등록하면 이중 계산될 수 있어요. 저축·투자는 소비 예산에서 제외합니다.</p></details></section>
    <div class="haru-money-grid"><section class="haru-board"><h2>어디를 줄이면 좋을까?</h2>
    <p class="haru-muted">${esc(compare)} · 입력된 기록만 비교하며, 누락 여부는 알 수 없어요.</p>
    ${top.length?`<div class="haru-insight"><b>지출 상위 3개</b><br>${top.map((c,i)=>`${i+1}. ${esc(c.name)} ${won(c.amount)} (${Math.round(c.share*100)}%)`).join('<br>')}</div>`:'<p class="haru-muted">지출을 기록하면 큰 항목부터 정리해 드립니다.</p>'}
    ${candidate?`<div class="haru-insight"><b>먼저 살펴볼 항목 · ${esc(candidate.name)}</b><br>${candidate.over?`분류 예산보다 ${won(candidate.over)} 초과했어요.`:candidate.delta>0?`지난달 비교 기간보다 ${won(candidate.delta)} 늘었어요.`:'조절 가능한 항목 중 지출 규모가 커요.'}<br>이 분류의 기록액을 20% 줄이면 ${won(Math.round(candidate.amount*.2))} 차이가 납니다. 실현을 보장하는 예측은 아니에요.
      <div class="haru-actions"><button data-haru="goal">이번 주 한 가지 목표 정하기</button></div></div>`:`<p class="haru-muted">아래 표에서 분류 이름을 누르고 ‘조절 가능’을 지정해 주세요. 필수·일회성·미지정 항목은 절약 후보로 고르지 않습니다.</p>`}
    ${haruGoalCard()}</section>
    <section class="haru-board"><h2>시트처럼 보는 분류별 현황</h2><p class="haru-muted">분류 이름을 누르면 성격과 예산을 수정할 수 있어요. 작은 화면에서는 표를 옆으로 밀어 보세요.</p>
    <div class="haru-table-wrap" tabindex="0" role="region" aria-label="분류별 소비 비교표"><table class="haru-table"><thead><tr><th>분류 · 성격</th><th>기준일까지 지출</th><th>분류 예산</th><th>비교 기간 증감</th><th>기록 수</th><th>초과액</th></tr></thead><tbody>
    ${a.categories.map(c=>`<tr><td><button data-editmcat="${esc(c.id)}">${esc(c.name)}</button><br><small>${haruKinds[c.kind]||'미지정'}</small></td><td>${won(c.amount)}</td><td>${c.budget?won(c.budget):'미설정'}</td><td>${delta(c.delta)}</td><td>${c.count}건</td><td class="${c.over?'haru-danger':''}">${c.over?won(c.over):'—'}</td></tr>`).join('')}</tbody></table></div>
    <p class="haru-muted">할부는 해당 월 회차 금액 기준입니다. 기록 수는 방문 횟수와 다를 수 있습니다. ${esc(compare)}</p></section></div>`;
}
vMoney=function(){const a=haruData();return haruMoneyBoard(a)+`<details class="haru-summary"><summary>상세 기록·고정비·할부·예정 관리 열기</summary>${haruOriginalMoney().replace('남은 돈<b','기록상 수지<b')}</details>`;};
mcatSheet=function(id){haruOriginalMcat(id);const c=S.mcats.find(x=>x.id===id);const box=document.getElementById('outBox');if(box)box.insertAdjacentHTML('beforeend',`<div class="field"><label for="haru-kind">소비 성격</label><select id="haru-kind">${Object.entries(haruKinds).map(([v,n])=>`<option value="${v}" ${(c?.spendKind||'unset')===v?'selected':''}>${n}</option>`).join('')}</select><p class="tip">‘조절 가능’으로 지정한 소비에서만 절약 후보를 골라요.</p></div>`);};
vSet=function(){return `<section class="haru-board"><h2>나에게 맞는 첫 화면</h2><div class="haru-settings"><label for="haru-home">앱을 열었을 때</label><select id="haru-home">${[['todo','할 일 먼저'],['routine','루틴 먼저'],['last','마지막으로 본 오늘 화면']].map(([v,n])=>`<option value="${v}" ${(S.homeStart||'todo')===v?'selected':''}>${n}</option>`).join('')}</select></div><div class="haru-actions"><button data-haru="summary">${S.homeSummary===false?'목표·연간 진행률 접기':'목표·연간 진행률 항상 펼치기'}</button></div></section>${haruConflictCard()}${haruOriginalSet()}`;};
tabTodo=function(){
  const core=todosOn(view).filter(t=>t.core), done=core.filter(t=>t.done).length;
  const held=S.todos.filter(t=>t.held&&!t.done);
  return `<section class="haru-board"><h2>오늘 핵심 ${done}/${core.length}</h2><p class="haru-muted">할 일 이름을 눌러 핵심을 최대 3개 골라 보세요. 전부 못해도 다음 할 일부터 다시 시작하면 됩니다.</p>${core.length?core.map(t=>`<div class="haru-task"><button data-todo="${esc(t.id)}" class="haru-small">${t.done?'✓ 완료':'○'} ${esc(t.title)}</button></div>`).join(''):''}<div class="haru-actions"><button data-haru="organize">미완료·보류 정리${held.length?' · 보류 '+held.length+'개':''}</button></div></section>${haruOriginalTodo()}`;
};
todoSheet=function(id){haruOriginalTodoSheet(id);const t=S.todos.find(x=>x.id===id);if(!t)return;document.getElementById('sheet').insertAdjacentHTML('beforeend',`<div class="haru-actions"><button data-haru="core" data-id="${esc(id)}">${t.core?'★ 핵심 해제':'☆ 오늘 핵심으로 (최대 3개)'}</button><button data-haru="task-today" data-id="${esc(id)}">오늘</button><button data-haru="task-week" data-id="${esc(id)}">이번 주</button><button data-haru="task-hold" data-id="${esc(id)}">보류</button></div>`);};
function haruOrganize(){
  const ts=S.todos.filter(t=>!t.done&&(t.held||t.date<=today()||t.wk));
  openSheet(`<h2>한꺼번에 밀리지 않도록</h2><p class="hint">오늘 할 것만 골라 오세요. 보류는 삭제나 완료가 아닙니다.</p>${ts.map(t=>`<div class="haru-task"><p>${esc(t.title)}</p><small>${t.held?'보류':t.wk?'주간':esc(t.date)}</small><div class="haru-actions">${[['today','오늘'],['week','이번 주'],['hold','보류']].map(([v,n])=>`<button data-haru="task-${v}" data-organize="1" data-id="${esc(t.id)}">${n}</button>`).join('')}</div></div>`).join('')||'<p>정리할 미완료 항목이 없어요.</p>'}<button class="cancel" data-close="1">닫기</button>`);
}
async function haruHoldConflict(j){
  const snapshot={local:JSON.parse(JSON.stringify(syncPayload())),server:j.data,rev:j.rev||0,at:new Date().toISOString(),room:S.sync.room};
  await STORE.set(KEY+':conflict',JSON.stringify(snapshot));
  haruConflict=snapshot;S.sync.on=false;clearTimeout(syncTimer);save();render();
  toast('동기화를 멈추고 두 기록을 보관했어요. 설정에서 선택해 주세요.');
}
function haruConflictCard(){return haruConflict?`<section class="haru-board"><h2>동기화 충돌 기록 보관됨</h2><p class="haru-muted">${esc(haruConflict.at)} · 두 사본을 먼저 내려받을 수 있습니다. 선택 시 전체 기록이 선택한 사본으로 바뀝니다. 선택한 뒤에도 보관 사본은 유지합니다.</p><div class="haru-actions"><button data-haru="conflict-export">두 사본 내려받기</button><button data-haru="conflict-local">이 기기 사본 사용</button><button data-haru="conflict-server">서버 사본 사용</button></div></section>`:'';}
function haruGoalSheet(){
  const a=haruData(), wk=monStart(today()), g=S.moneyGoals?.[wk];
  const cats=S.mcats.filter(c=>c.type==='out'&&!c.sv&&c.spendKind==='flex');
  if(!cats.length){toast('먼저 분류의 소비 성격을 조절 가능으로 지정해 주세요.');return;}
  openSheet(`<h2>이번 주 한 가지</h2><p class="hint">${md(wk)}–${md(addDays(wk,6))}에 쓸 상한 금액을 직접 정하세요.</p><p id="err" class="err"></p><div class="field"><label for="haru-goal-cat">줄여볼 분류</label><select id="haru-goal-cat">${cats.map(c=>`<option value="${esc(c.id)}" ${c.id===(g?.catId||a.candidate?.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label for="haru-goal-limit">이번 주 소비 상한 (원)</label><input id="haru-goal-limit" type="number" min="0" step="1000" value="${g?.limit??''}" placeholder="예: 20000"></div><div class="actions"><button class="cancel" data-close="1">취소</button><button class="save" data-haru="goal-save">목표 저장</button></div>`);
}
document.addEventListener('change',e=>{if(e.target.id==='haru-home'){S.homeStart=e.target.value;save();toast('다음 실행부터 적용해요.');}});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-haru]');if(!b)return;const action=b.dataset.haru;
  if(action==='summary'){S.homeSummary=S.homeSummary===false;save();render();}
  if(action==='organize')haruOrganize();
  if(action==='goal')haruGoalSheet();
  if(action==='goal-save'){
    const input=document.getElementById('haru-goal-limit'),n=Number(input.value);
    if(input.value.trim()===''||!Number.isFinite(n)||n<0)return showErr('0 이상의 금액을 적어 주세요.');
    S.moneyGoals||={};S.moneyGoals[monStart(today())]={catId:document.getElementById('haru-goal-cat').value,limit:Math.round(n)};save();closeSheet();render();
  }
  if(action==='core'){
    const t=S.todos.find(x=>x.id===b.dataset.id);if(!t)return;
    if(!t.core&&todosOn(view).filter(x=>x.core).length>=3){toast('핵심은 최대 3개예요. 하나를 해제해 주세요.');return;}
    t.core=!t.core;if(t.core){t.date=view;t.wk='';t.held=false;}save();closeSheet();render();
  }
  if(action.startsWith('task-')){
    const t=S.todos.find(x=>x.id===b.dataset.id);if(!t)return;
    if(t.done&&action==='task-hold'){toast('완료한 일은 완료 체크를 해제한 뒤 보류해 주세요.');return;}
    t.core=false;t.held=action==='task-hold';t.date=action==='task-today'?today():'';t.wk=action==='task-week'?monStart(today()):'';t.time='';t.notify='';
    save();render();if(b.dataset.organize)haruOrganize();else closeSheet();
  }
  if(action==='csv-summary'||action==='csv-records'){
    const a=haruData();let rows;
    if(action==='csv-summary')rows=[['분류','소비 성격','기준일까지 지출','분류 예산','전월 비교 금액','증감','기록 수','예산 초과','현재 비교 기준일','전월 비교 기준일'],...a.categories.map(c=>[c.name,haruKinds[c.kind],c.amount,c.budget||'',a.hasComparison?c.before:'',c.delta??'',c.count,c.over,moneyMonth+'-'+pad(a.currentCompareDay),a.previousYM+'-'+pad(a.compareDay)])];
    else rows=[['날짜','종류','분류','금액','메모','상태','할부 회차'],...a.rows.map(r=>[r.date,r.type==='in'?'수입':isSaving(r)?'저축·투자':'소비',mcatOf(r.catId).name,r.amount,r.memo||'',r.plan?'예정':r.date>today()?'미래 날짜 기록':'기록됨',r.instI||''])];
    await sendFile(`하루-${moneyMonth}-${action==='csv-summary'?'분류표':'기록'}.csv`,HaruFinance.csv(rows),'text/csv;charset=utf-8','CSV를 저장했어요');
  }
  if(action==='conflict-export'&&haruConflict)await sendFile('하루-충돌-두사본.json',JSON.stringify(haruConflict,null,2),'application/json','두 사본을 저장했어요');
  if((action==='conflict-local'||action==='conflict-server')&&haruConflict){
    if(!confirm('선택한 사본으로 현재 전체 기록을 바꾸고 동기화할까요? 지금까지 추가로 수정한 내용은 먼저 백업하세요.'))return;
    await STORE.set(KEY+':before-conflict-choice',JSON.stringify(S));
    const c=haruConflict;S.sync.room=c.room;adopt(JSON.parse(JSON.stringify(action==='conflict-local'?c.local:c.server)),c.rev);save();render();
    if(action==='conflict-local')await syncUp(false);else toast('서버 사본을 적용했어요.');
  }
});
