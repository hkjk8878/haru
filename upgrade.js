/* v123: existing screens share the same data, storage and backup format. */
let haruConflict=null;
const haruOriginalHeader=header, haruOriginalDday=ddayStrip, haruOriginalMoney=vMoney;
const haruOriginalSet=vSet, haruOriginalTodo=tabTodo, haruOriginalTodoSheet=todoSheet;
const haruOriginalMcat=mcatSheet, haruOriginalRender=render;
const haruOriginalCalendar=vCal;
const haruOriginalOpenSheet=openSheet,haruOriginalCloseSheet=closeSheet;
const haruKeyboard=HaruUI.watchKeyboard(window,document),haruViewMemory=new Map();
let haruRenderedContext=null,haruEditOrigin=null,haruViewportRestore=null;
const haruViewContext=()=>tab+(tab==='today'?':'+homeTab:'');
haruKeyboard.onClose(()=>{
  const origin=haruViewportRestore;haruViewportRestore=null;
  if(origin&&origin.key===haruViewContext()&&!document.getElementById('sheet').classList.contains('open'))HaruUI.restore(document.getElementById('app'),origin.state,window);
});
document.addEventListener('touchstart',()=>{haruViewportRestore=null;},{passive:true});
document.addEventListener('wheel',()=>{haruViewportRestore=null;},{passive:true});
document.addEventListener('focusin',()=>{haruViewportRestore=null;});
const haruKinds={unset:'미지정',essential:'필수',flex:'조절 가능',once:'일회성',fixed:'고정비'};
function haruIsFixed(r){const c=mcatOf(r.catId);return !!r.fx||c.id==='fix'||c.name==='고정비'||c.spendKind==='fixed';}
function haruEventGroup(c){return /^(일|외주|업무|프리랜서)$/.test(c.name)||c.id==='work'?'work':'personal';}
function haruCalendarInit(){
  const defs=[['일','work','#4E5BD9'],['외주','haru-outsource','#4A5A73'],['약속','meet','#7A55B8'],['여행','trip','#2E7D8F'],['생일','haru-birthday','#A2660C']];
  defs.forEach(([name,id,color])=>{if(!S.ecats.some(c=>c.name===name))S.ecats.push({id:S.ecats.some(c=>c.id===id)?uid():id,name,color});});
}
function haruEventChoices(){return ['일','외주','약속','여행','생일'].map(name=>S.ecats.find(c=>c.name===name)).filter(Boolean);}
header=function(){
  const html=haruOriginalHeader();
  if(S.homeSummary===false)return html;
  const start=html.indexOf('<button class="yearbar"'), finish=html.indexOf('</button>',start);
  return start<0?html:html.slice(0,start)+html.slice(finish+9);
};
ddayStrip=function(){return S.homeSummary===false?haruOriginalDday():`<details class="haru-summary"><summary>목표와 연간 진행률 보기</summary>${haruOriginalDday()}<p class="haru-muted">${yearLeft().y}년 · ${yearLeft().left}일 남음</p></details>`;};
render=function(){
  if(typeof allocationInit==='function'&&allocationInit())save();
  const app=document.getElementById('app'),key=haruViewContext(),same=haruRenderedContext===key;
  if(haruRenderedContext)haruViewMemory.set(haruRenderedContext,HaruUI.capture(app,window));
  const origin=haruEditOrigin?.key===key?haruEditOrigin.state:null;
  const state=origin||haruViewMemory.get(key),focusInput=focusTodo||focusWk;
  haruOriginalRender();document.body.classList.toggle('haru-money',tab==='money');
  HaruUI.restore(app,state,window,(same||!!origin)&&!focusInput);
  haruRenderedContext=key;if(!document.getElementById('sheet').classList.contains('open'))haruEditOrigin=null;haruKeyboard.update();
};
openSheet=function(html){
  const panel=document.getElementById('sheet');
  if(!panel.classList.contains('open'))haruEditOrigin={key:haruViewContext(),state:HaruUI.capture(document.getElementById('app'),window)};
  panel.inert=false;haruOriginalOpenSheet(html);panel.scrollTop=0;
};
closeSheet=function(){
  const origin=haruEditOrigin,panel=document.getElementById('sheet');
  if(origin&&haruKeyboard.isOpen())haruViewportRestore=origin;
  if(panel.contains(document.activeElement))document.activeElement.blur();
  haruOriginalCloseSheet();panel.inert=true;haruKeyboard.update();
  requestAnimationFrame(()=>{
    if(origin&&haruEditOrigin===origin&&!panel.classList.contains('open')){
      if(origin.key===haruViewContext())HaruUI.restore(document.getElementById('app'),origin.state,window);
      haruEditOrigin=null;
    }
  });
};
document.getElementById('sheet').inert=true;
vCal=function(){
  let html=haruOriginalCalendar();
  if(!cfGoal()){const at=html.indexOf('<div class="sechead"><h2>목표</h2>');if(at>=0)html=html.slice(0,at);}
  const fragment=document.createElement('div');fragment.innerHTML=html;
  [...fragment.querySelectorAll('.card')].forEach(card=>{
    const title=card.querySelector('h2')?.textContent;
    if(title==='이 달의 한 줄'){
      if(!card.querySelector('.pastnote')){card.remove();return;}
      const fold=document.createElement('details');fold.className='haru-board haru-fold';fold.innerHTML='<summary>한 줄 기록</summary>';card.replaceWith(fold);fold.appendChild(card);
    }
    if(title==='캘린더로 내보내기'){
      const fold=document.createElement('details');fold.className='haru-board haru-fold';fold.innerHTML='<summary>캘린더 내보내기</summary>';card.querySelector('.empty')?.remove();card.querySelector('header')?.remove();card.replaceWith(fold);fold.appendChild(card);
    }
  });
  return fragment.innerHTML;
};
function haruData(){
  const rows=moneyIn(moneyMonth).map(x=>({...x}));
  // Unposted recurring items are obligations, not actual expenses.
  fixedOf(moneyMonth).forEach(f=>{
    if(!S.money.some(x=>x.fx===f.id+':'+moneyMonth))rows.push({id:'expected-'+f.id,fx:f.id+':'+moneyMonth,type:f.type||'out',catId:f.catId,amount:fixAmt(f,moneyMonth),date:moneyMonth+'-'+pad(fixDayOf(f,moneyMonth)),plan:true,memo:f.name+' (미기록 고정 항목)'});
  });
  const budgets=Object.fromEntries(S.mcats.map(c=>[c.id,catBudFor(moneyMonth,c.id)]));
  const a=HaruFinance.analyze({ym:moneyMonth,today:today(),cats:S.mcats,current:rows,previous:moneyIn(prevYM(moneyMonth)),budget:budgetFor(moneyMonth),categoryBudgets:budgets});
  return {...a,rows};
}
function haruGoalCard(){
  const wk=monStart(today()), g=(S.moneyGoals||{})[wk];
  if(!g)return '';
  const end=addDays(wk,6), months=[monthOf(wk),monthOf(end)];
  const rs=[...new Set(months)].flatMap(ym=>moneyIn(ym)).filter(r=>!r.plan&&r.type==='out'&&!isSaving(r)&&!haruIsFixed(r)&&r.catId===g.catId&&r.date>=wk&&r.date<=today()&&r.date<=end);
  const used=sum(rs,r=>r.amount), left=g.limit-used, name=mcatOf(g.catId).name;
  return `<div class="haru-insight"><b>이번 주 · ${esc(name)}</b><p class="haru-muted">${md(wk)}–${md(end)}</p><p class="haru-goal-amount">${won(used)} / ${won(g.limit)}</p><span class="${left<0?'haru-danger':''}">${left>=0?won(left)+' 남음':won(-left)+' 초과'}</span><div class="haru-progress"><i style="width:${g.limit?Math.min(100,used/g.limit*100):used?100:0}%"></i></div><div class="haru-actions"><button data-haru="goal">목표 수정</button></div></div>`;
}
function haruMoneyBoard(a){
 const delta=n=>n===null?'—':(n>0?'+':'')+won(n);
 const biggest=a.categories.find(c=>c.amount>0), c=a.candidate;
 return `<div class="top"><div class="datenav"><h1>가계부</h1><button class="pill g" data-newtx="1">＋ 기록</button></div></div>
 <section class="haru-board"><div class="calnav"><button data-mmonth="${prevYM(moneyMonth)}" aria-label="지난달">‹</button><b>${Number(moneyMonth.slice(0,4))}년 ${Number(moneyMonth.slice(5))}월</b><button data-mmonth="${addYM(moneyMonth,1)}" aria-label="다음달">›</button></div>
 <div class="haru-living-kpis"><div><span>생활비 예산</span><strong>${a.budget?won(a.budget):'미설정'}</strong></div><div><span>쓴 생활비</span><strong>${won(a.spent)}</strong></div><div class="${a.remaining<0?'haru-danger':''}"><span>남은 생활비</span><strong>${a.remaining===null?'—':won(a.remaining)}</strong></div></div>
 <div class="haru-actions"><button data-budget="1">예산 수정</button></div><p class="haru-muted">고정비·저축 제외</p></section>
 <section class="haru-board haru-brief"><h2>이번 달 소비</h2>
 ${biggest?`<p class="haru-line"><span>가장 많이 쓴 곳</span><b>${esc(biggest.name)} · ${won(biggest.amount)}</b></p>`:'<p class="haru-muted">아직 생활비 기록이 없어요.</p>'}
 ${c?`<p class="haru-line"><span>줄여볼 항목</span><b>${esc(c.name)}</b></p><p class="haru-muted">${c.over?`분류 예산 ${won(c.over)} 초과`:c.delta>0?`전월 같은 기간보다 ${won(c.delta)} 증가`:`이번 달 ${won(c.amount)} 사용`}</p><div class="haru-actions"><button data-haru="goal">주간 목표</button></div>`:''}
 ${haruGoalCard()}</section>
 <details class="haru-board haru-fold"><summary>분류별 자세히 보기</summary><p class="haru-muted">${a.hasComparison?`${a.previousYM} ${a.compareDay}일까지 비교`:'전월 비교 기록 없음'}</p>
 <div class="haru-table-wrap" tabindex="0" role="region" aria-label="생활비 분류표"><table class="haru-table"><thead><tr><th>분류</th><th>쓴 금액</th><th>예산</th><th>전월 대비</th></tr></thead><tbody>${a.categories.map(c=>`<tr><td><button data-editmcat="${esc(c.id)}">${esc(c.name)}</button><br><small>${haruKinds[c.kind]||'미지정'}</small></td><td>${won(c.amount)}</td><td>${c.budget?won(c.budget):'—'}</td><td>${delta(c.delta)}</td></tr>`).join('')}</tbody></table></div><div class="haru-actions"><button data-haru="csv-summary">분류표 저장</button><button data-haru="csv-records">기록 저장</button></div></details>`;
}
vMoney=function(){
 const a=haruData(), legacy=haruOriginalMoney(), start=legacy.indexOf('<details class="card sec2"');
 return haruMoneyBoard(a)+`<details class="haru-board haru-fold"><summary>상세 내역</summary>${start>=0?legacy.slice(start):legacy}</details>`;
};

mcatSheet=function(id){haruOriginalMcat(id);const c=S.mcats.find(x=>x.id===id);const box=document.getElementById('outBox');if(box)box.insertAdjacentHTML('beforeend',`<div class="field"><label for="haru-kind">소비 성격</label><select id="haru-kind">${Object.entries(haruKinds).map(([v,n])=>`<option value="${v}" ${(c?.spendKind||'unset')===v?'selected':''}>${n}</option>`).join('')}</select><p class="tip">‘조절 가능’으로 지정한 소비에서만 절약 후보를 골라요.</p></div>`);};
vSet=function(){return `<section class="haru-board"><h2>나에게 맞는 첫 화면</h2><div class="haru-settings"><label for="haru-home">앱을 열었을 때</label><select id="haru-home">${[['todo','할 일 먼저'],['routine','루틴 먼저'],['last','마지막으로 본 오늘 화면']].map(([v,n])=>`<option value="${v}" ${(S.homeStart||'todo')===v?'selected':''}>${n}</option>`).join('')}</select></div><div class="haru-actions"><button data-haru="summary">${S.homeSummary===false?'목표·연간 진행률 접기':'목표·연간 진행률 항상 펼치기'}</button></div></section>${haruConflictCard()}${haruOriginalSet()}`;};
tabTodo=function(){
  const held=S.todos.filter(t=>t.held&&!t.done);
  return `<div class="haru-actions"><button data-haru="organize">미완료·보류 정리${held.length?' · 보류 '+held.length+'개':''}</button></div>${haruOriginalTodo()}`;
};
todoSheet=function(id){haruOriginalTodoSheet(id);const t=S.todos.find(x=>x.id===id);if(!t)return;document.getElementById('sheet').insertAdjacentHTML('beforeend',`<div class="haru-actions"><button data-haru="task-today" data-id="${esc(id)}">오늘</button><button data-haru="task-week" data-id="${esc(id)}">이번 주</button><button data-haru="task-hold" data-id="${esc(id)}">보류</button></div>`);};
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
  if(action.startsWith('task-')){
    const t=S.todos.find(x=>x.id===b.dataset.id);if(!t)return;
    if(t.done&&action==='task-hold'){toast('완료한 일은 완료 체크를 해제한 뒤 보류해 주세요.');return;}
    t.held=action==='task-hold';t.date=action==='task-today'?today():'';t.wk=action==='task-week'?monStart(today()):'';t.time='';t.notify='';
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
