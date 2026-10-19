/* Monthly allocation UI; shared records remain the single source of truth. */
const ALLOC_GROUPS={fixed:{name:'고정비',verb:'쓴 금액',color:'#A78BFA'},saving:{name:'저축·투자',verb:'넣은 금액',color:'#8AA9FF'},reserve:{name:'비정기지출',verb:'이번 달 사용',color:'#56B7F2'},living:{name:'생활비',verb:'쓴 금액',color:'#F2789A'}};
const ALLOC_INCOMES=[['salary','급여'],['ai','AI 외주'],['allowance','용돈'],['other','기타 수입']];
const allocationLegacyTxRow=txRow,allocationLegacyFixed=haruIsFixed;
let allocationLastKind='expense',allocationLastItem='food',allocationRecordScope='all';
function allocationInit(){
 let changed=false;
 if(!S.allocation){S.allocation=HaruAllocation.createModel(monthOf(today()),today(),S.money.map(r=>r.id));changed=true;}
 if(!S.allocation.reserveBudgetMode){S.allocation.reserveBudgetMode=true;changed=true;}
 for(const item of S.allocation.items){
  let c=S.mcats.find(c=>c.allocationItem===item.id)||S.mcats.find(c=>c.type==='out'&&(HaruAllocation.aliases[item.id]||[]).includes(c.name));
  if(!c){c={id:'alloc-'+item.id,name:item.name,type:'out',sv:item.group==='saving',color:ALLOC_GROUPS[item.group].color};S.mcats.push(c);changed=true;}
  if(c.allocationItem!==item.id){c.allocationItem=item.id;c.allocationGroup=item.group;if(item.group==='saving')c.sv=true;if(item.group==='fixed')c.spendKind='fixed';changed=true;}
 }
 for(const [id,name] of ALLOC_INCOMES)if(!S.mcats.some(c=>c.type==='in'&&c.name===name)){S.mcats.push({id:'alloc-in-'+id,name,type:'in',color:'#34D399'});changed=true;}
 return changed;
}
function allocationClass(r){return HaruAllocation.classify(r,S.allocation,S.mcats,S.fixed||[]);}
function allocationSnapshot(){return HaruAllocation.snapshot(S.allocation,S.money,S.mcats,S.fixed||[],moneyMonth,today());}
function allocationName(id){return S.allocation.items.find(i=>i.id===id)?.name||'일반 계좌';}
function allocationCat(id){return S.mcats.find(c=>c.allocationItem===id);}
function allocationSavingsRows(rows){
 if(!S.allocation)return rows.filter(r=>!r.plan&&r.type==='out'&&isSaving(r));
 const out=[];rows.filter(r=>!r.plan).forEach(r=>{
  const c=allocationClass(r);if(c.group==='saving'&&(c.kind==='saving'||c.kind==='transfer'))out.push({...r});
  if(r.type==='transfer'&&S.allocation.items.find(i=>i.id===r.allocationFrom)?.group==='saving')out.push({...r,amount:-r.amount});
 });return out;
}
haruIsFixed=function(r){return S.allocation?allocationClass(r).group==='fixed':allocationLegacyFixed(r);};
function allocationIsLiving(r){return S.allocation?allocationClass(r).group==='living':!haruIsFixed(r);}
function allocationMoney(n){return won(Math.round(n||0));}
function allocationState(r){return r.plan?'예정':r.date>today()?'미래 날짜':'';}
txRow=function(r){
 if(!S.allocation)return allocationLegacyTxRow(r);
 const c=allocationClass(r),color=ALLOC_GROUPS[c.group]?.color||'#34D399';
 const name=c.item?allocationName(c.item):mcatOf(r.catId).name||'분류 확인';
 const label=r.type==='transfer'?`${r.allocationFrom?allocationName(r.allocationFrom):'일반 계좌'} → ${c.item?name:'일반 계좌'}`:name;
 return `<button class="tx alloc-transaction" data-tx="${esc(txId(r.id))}"><span class="dot" style="background:${color}"></span><span class="m"><b>${esc(r.memo||label)}</b><small>${esc(label)}${allocationState(r)?' · '+allocationState(r):''}${r.instI?' · '+r.instI+'회차':''}</small></span><span class="v" style="color:${color}">${r.type==='in'?'+':r.type==='transfer'?'↔':c.kind==='saving'?'↓':'−'}${allocationMoney(r.amount)}</span></button>`;
};
function allocationItemRow(item,a){
 const actualLabel=item.id==='buffer'?'초과 흡수':item.group==='saving'?'납입':item.group==='reserve'?'사용':'사용';
 const remaining=['hobby','shopping'].includes(item.id)?null:item.group==='reserve'?item.balance:item.remaining;
 const special=item.id==='buffer'?`완충 잔여 ${allocationMoney(a.buffer.remaining)}`:item.id==='etf'&&item.carry?`이월 ${allocationMoney(item.carry)}`:null;
 const balance=['marriage','emergency','gift','special','medical'].includes(item.id)?`잔액 ${allocationMoney(item.balance)}`:null;
 return `<div class="alloc-item"><div class="alloc-item-head"><button data-alloc="${item.id==='buffer'?'item-budget':'record-item'}" data-item="${item.id}">${esc(item.name)}</button><button data-alloc="item-budget" data-item="${item.id}" aria-label="${esc(item.name)} 예산·목표 수정">${item.group==='reserve'?'월 ':''}${allocationMoney(item.planned)}</button></div><div class="alloc-item-meta"><span>${actualLabel} ${allocationMoney(item.id==='buffer'?a.buffer.used:item.group==='reserve'?item.spent:item.actual)}</span><span class="${remaining<0?'haru-danger':''}">${special||balance||(remaining===null?'공동 한도 적용':'남음 '+allocationMoney(remaining))}</span></div>${item.id==='etf'&&item.carry?`<p class="haru-muted">사용 가능 ${allocationMoney(item.available)}</p>`:''}${item.id==='emergency'?`<div class="haru-progress"><i style="width:${Math.max(0,Math.min(100,item.balance/S.allocation.emergencyTarget*100))}%"></i></div><p class="haru-muted">목표 ${allocationMoney(S.allocation.emergencyTarget)}</p>`:''}</div>`;
}
vMoney=function(){
 allocationInit();const a=allocationSnapshot(),p=ALLOC_GROUPS;
 const allRows=HaruAllocation.rowsForMonth(S.money,moneyMonth).sort((x,y)=>y.date.localeCompare(x.date)||String(y.id).localeCompare(String(x.id)));
 const rows=allocationRecordScope==='review'?allRows.filter(r=>a.review.includes(txId(r.id))):allRows;

 return `<div class="top"><div class="datenav"><h1>가계부</h1><button class="pill g" data-newtx="1">＋ 기록</button></div></div>
 <section class="haru-board alloc-income"><div class="calnav"><button data-mmonth="${prevYM(moneyMonth)}" aria-label="지난달">‹</button><b>${moneyMonth.slice(0,4)}년 ${Number(moneyMonth.slice(5))}월</b><button data-mmonth="${addYM(moneyMonth,1)}" aria-label="다음달">›</button></div>
 <div class="alloc-income-main"><span>이번 달 생활비 ${a.groups.living.remaining<0?'초과':'남음'}</span><strong class="${a.groups.living.remaining<0?'haru-danger':''}">${allocationMoney(Math.abs(a.groups.living.remaining))}</strong></div>
 <div class="alloc-income-pair"><span>생활비 사용</span><b>${allocationMoney(a.groups.living.actual)}</b></div><div class="alloc-income-pair"><span>생활비 예산</span><b>${allocationMoney(a.groups.living.planned)}</b></div><div class="alloc-income-pair"><span>이번 달 총수입</span><b>${allocationMoney(a.income)}</b></div>
 <div class="haru-actions"><button data-alloc="plan">예산·목표 수정</button></div></section>
 <div class="alloc-groups">${Object.entries(p).map(([key,g])=>{
  const v=a.groups[key];
  return `<details class="haru-board alloc-group" id="alloc-group-${key}" style="--alloc-color:${g.color}"><summary><span class="alloc-group-title"><b>${g.name}</b><span>${key==='saving'?'월 목표':key==='reserve'?'남은 예산':'월 예산'}</span></span><strong class="alloc-group-budget">${allocationMoney(key==='reserve'?v.remaining:v.planned)}</strong><span class="alloc-group-progress">${key==='reserve'?`<span>매달 추가 <b>${allocationMoney(v.planned)}</b></span>`:''}<span>${g.verb} <b>${allocationMoney(key==='reserve'?v.spent:v.actual)}</b></span>${key!=='reserve'?`<span class="${v.remaining<0?'haru-danger':''}">${v.remaining<0?'초과':'남음'} <b>${allocationMoney(Math.abs(v.remaining))}</b></span>`:''}</span></summary>
  <div class="alloc-items">${S.allocation.items.filter(i=>i.group===key).map(i=>allocationItemRow(a.items[i.id],a)).join('')}</div>
  ${key==='living'?`<div class="alloc-callout">취미·쇼핑 공동 잔여 <b>${allocationMoney(a.shared.remaining)}</b><br>예비비 잔여 <b>${allocationMoney(a.buffer.remaining)}</b></div>`:''}
  ${key==='reserve'?`<div class="alloc-callout">매달 예산 자동 추가 · 남은 예산 이월<br>이번 달 실제 소비 <b>${allocationMoney(v.spent)}</b><br>남은 예산 <b>${allocationMoney(['gift','special','medical'].reduce((n,id)=>n+a.items[id].balance,0))}</b></div>`:''}
  ${key==='saving'&&a.achievedMonth?`<p class="haru-muted">비상금 목표 달성 · 다음 달부터 결혼자금 목표에 합산</p>`:''}</details>`;
 }).join('')}</div>
 ${a.review.length?`<div class="haru-actions"><button data-alloc="review">분류 확인 ${a.review.length}건</button></div>`:''}
 <details class="haru-board haru-fold" id="alloc-metrics"><summary>월 요약</summary><div class="alloc-income-pair"><span>실제 소비</span><b>${allocationMoney(a.spending)}</b></div><div class="alloc-income-pair"><span>저축·투자 / 실제 수입</span><b>${a.savingRate===null?'수입 기록 필요':(a.savingRate*100).toFixed(1)+'%'}</b></div><div class="haru-actions"><button data-alloc="csv">기록 CSV</button><button data-alloc="plan-csv">예산표 CSV</button><button data-alloc="openings">시작 잔액</button></div></details>
 <section class="card" id="alloc-records"><header><h2>${allocationRecordScope==='review'?'분류 확인':'전체 기록'}</h2><span class="count">${rows.length}건</span><button class="add" data-newtx="1">＋ 기록</button></header>${allocationRecordScope==='review'?'<button class="addbtn" data-alloc="all-records">전체 기록 보기</button>':''}
 ${rows.length?rows.map((r,i)=>`${!i||r.date!==rows[i-1].date?`<div class="daygrp"><span>${md(r.date)}</span></div>`:''}${txRow(r)}`).join(''):'<div class="empty">아직 기록이 없어요.</div>'}</section>`;
};
let allocationForm=null;
function allocationOptions(kind,group){
 if(kind==='income')return ALLOC_INCOMES.map(([id,name])=>({id,name}));
 if(kind==='transfer')return S.allocation.items.filter(i=>['marriage','emergency'].includes(i.id));
 if(kind==='saving')return S.allocation.items.filter(i=>i.group==='saving');
 return S.allocation.items.filter(i=>['fixed','living','reserve'].includes(i.group)&&i.id!=='buffer'&&(!group||i.group===group));
}
function allocationRenderForm(){
 const f=allocationForm,options=allocationOptions(f.kind,f.group);
 const sourceItems=allocationOptions('transfer');
 openSheet(`<h2>${f.id?'기록 수정':'가계부 기록'}</h2><p class="err" id="err"></p>
 <div class="alloc-kind">${[['income','수입'],['expense','소비'],['saving','저축·투자'],['transfer','이체']].map(([id,name])=>`<button data-alloc="form-kind" data-kind="${id}" class="${f.kind===id?'on':''}">${name}</button>`).join('')}</div>
 <div class="field"><label for="alloc-amount">금액</label><input class="amt" id="alloc-amount" type="number" inputmode="numeric" min="1" step="1" value="${f.amount||''}" placeholder="0"></div>
 ${f.kind==='expense'?`<div class="field"><label for="alloc-group">구역</label><select id="alloc-group">${['fixed','living','reserve'].map(g=>`<option value="${g}" ${f.group===g?'selected':''}>${ALLOC_GROUPS[g].name}${g==='reserve'?'에서 실제 소비':''}</option>`).join('')}</select></div>`:''}
 ${f.kind==='transfer'?`<div class="field"><label for="alloc-from">보내는 곳</label><select id="alloc-from"><option value="">일반 계좌</option>${sourceItems.map(i=>`<option value="${i.id}" ${f.from===i.id?'selected':''}>${esc(i.name)}</option>`).join('')}</select></div>`:''}
 <div class="field"><label for="alloc-item">${f.kind==='transfer'?'받는 곳':'항목'}</label><select id="alloc-item">${!f.item&&f.id?'<option value="">분류를 선택해 주세요</option>':''}${f.kind==='transfer'?`<option value="" ${!f.item?'selected':''}>일반 계좌</option>`:''}${options.map(i=>`<option value="${i.id}" ${f.item===i.id?'selected':''}>${esc(i.name)}</option>`).join('')}</select></div>
 <div class="row2"><div class="field"><label for="alloc-date">날짜</label><input id="alloc-date" type="date" value="${esc(f.date)}"></div><div class="field"><label for="alloc-status">상태</label><select id="alloc-status"><option value="0" ${!f.plan?'selected':''}>기록</option><option value="1" ${f.plan?'selected':''}>예정</option></select></div></div>
 <div class="field"><label for="alloc-memo">내용</label><input id="alloc-memo" maxlength="80" value="${esc(f.memo||'')}" placeholder="선택 사항"></div>
 ${f.kind==='expense'?`<div class="field"><label for="alloc-inst">할부 개월</label><input id="alloc-inst" type="number" inputmode="numeric" min="0" max="60" value="${f.inst>1?f.inst:''}" placeholder="일시불이면 비워 두세요"></div>`:''}
 <div class="actions">${f.id?`<button class="del" data-deltx="${esc(f.id)}">삭제</button>`:'<button class="cancel" data-close="1">취소</button>'}<button class="save" data-alloc="save-record">저장</button></div>`);
}
function allocationReadForm(){
 if(!allocationForm||!document.getElementById('alloc-amount'))return;
 Object.assign(allocationForm,{amount:document.getElementById('alloc-amount').value,date:document.getElementById('alloc-date').value,memo:document.getElementById('alloc-memo').value,plan:document.getElementById('alloc-status').value==='1',inst:Number(document.getElementById('alloc-inst')?.value??allocationForm.inst)||0,from:document.getElementById('alloc-from')?.value||'',item:document.getElementById('alloc-item').value});
}
txSheet=function(id){
 allocationInit();const r=id?S.money.find(x=>x.id===txId(id)):null,c=r?allocationClass(r):null;
 const kind=r?(c.kind==='income'?'income':c.kind==='saving'?'saving':c.kind==='transfer'?'transfer':'expense'):allocationLastKind;
 const group=c&&['fixed','living','reserve'].includes(c.group)?c.group:'living';
 const item=r?(kind==='income'?(ALLOC_INCOMES.find(([,n])=>n===mcatOf(r.catId).name)?.[0]||'other'):c.item||''):allocationLastItem;
 allocationForm={id:r?.id||'',kind,group,item,from:r?.allocationFrom||'',amount:r?.amount||'',memo:r?.memo||'',date:r?.date||(tab==='money'&&moneyMonth!==monthOf(today())?moneyMonth+'-'+pad(Math.min(+today().slice(8),daysIn(moneyMonth))):today()),plan:r?.plan||false,inst:r?.inst||0,original:r?{...r}:null};
 if(!r&&!allocationOptions(kind,group).some(i=>i.id===item))allocationForm.item=allocationOptions(kind,group)[0]?.id||'';
 allocationRenderForm();
};
function allocationPlanSheet(itemId){
 const a=allocationSnapshot(),plan=HaruAllocation.planFor(S.allocation,moneyMonth);
 if(itemId){const item=a.items[itemId];openSheet(`<h2>${esc(item.name)} 예산·목표</h2><p class="hint">${moneyMonth}부터 적용</p><p class="err" id="err"></p><div class="field"><label for="alloc-item-amount">월 예산·목표</label><input id="alloc-item-amount" type="number" inputmode="numeric" min="0" value="${plan.amounts[itemId]||0}"></div><div class="actions"><button class="cancel" data-close="1">취소</button><button class="save" data-alloc="save-item-budget" data-item="${itemId}">저장</button></div>`);return;}
 openSheet(`<h2>예산·목표 수정</h2><p class="hint">${moneyMonth}부터 적용 · 수입이 바뀌어도 유지돼요.</p><p class="err" id="err"></p>${Object.entries(ALLOC_GROUPS).map(([g,v])=>`<h3 class="alloc-plan-heading">${v.name}</h3>${S.allocation.items.filter(i=>i.group===g).map(i=>`<div class="alloc-plan-row"><label for="plan-${i.id}">${esc(i.name)}</label><input id="plan-${i.id}" data-plan-item="${i.id}" type="number" inputmode="numeric" min="0" value="${plan.amounts[i.id]||0}"></div>`).join('')}`).join('')}<p class="alloc-plan-total" id="alloc-plan-total">예산·목표 합계 ${allocationMoney(a.totalPlanned)}</p><div class="actions"><button class="cancel" data-close="1">취소</button><button class="save" data-alloc="save-plan">저장</button></div>`);
}
function allocationOpeningSheet(){
 const m=S.allocation;
 openSheet(`<h2>시작 잔액·예산</h2><p class="hint">${S.allocation.openingDate} 기준. 비정기 항목은 첫 달 자동 예산을 더하기 전의 남은 예산을 입력하세요.</p><p class="err" id="err"></p>${['emergency','marriage','gift','special','medical'].map(id=>`<div class="field"><label for="opening-${id}">${allocationName(id)}</label><input id="opening-${id}" type="number" min="0" inputmode="numeric" value="${m.openings[id]||0}"></div>`).join('')}<div class="field"><label for="alloc-target">비상금 목표</label><input id="alloc-target" type="number" min="1" inputmode="numeric" value="${m.emergencyTarget}"></div><div class="field"><label for="alloc-auto">목표 달성 다음 달</label><select id="alloc-auto"><option value="1" ${m.autoReallocate?'selected':''}>비상금 예산·목표을 결혼자금에 합치기</option><option value="0" ${!m.autoReallocate?'selected':''}>예산·목표 유지</option></select></div><div class="actions"><button class="cancel" data-close="1">취소</button><button class="save" data-alloc="save-openings">저장</button></div>`);
}
function allocationValidNumber(value,allowEmpty=false){return (allowEmpty&&String(value).trim()==='')||(String(value).trim()!==''&&Number.isFinite(+value)&&+value>=0&&Number.isSafeInteger(Math.round(+value)));}
document.addEventListener('change',e=>{
 if(e.target.id==='alloc-group'){allocationReadForm();allocationForm.group=e.target.value;allocationForm.item=allocationOptions('expense',allocationForm.group)[0]?.id||'';allocationRenderForm();}
});
document.addEventListener('input',e=>{if(e.target.hasAttribute('data-plan-item')){const n=[...document.querySelectorAll('[data-plan-item]')].reduce((n,e)=>n+(Number(e.value)||0),0);document.getElementById('alloc-plan-total').textContent='예산·목표 합계 '+allocationMoney(n);}});
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-alloc]');if(!button)return;const d=button.dataset,action=d.alloc;
 if(action==='plan')allocationPlanSheet();
 if(action==='item-budget')allocationPlanSheet(d.item);
 if(action==='openings')allocationOpeningSheet();
 if(action==='review'||action==='all-records'){allocationRecordScope=action==='review'?'review':'all';render();}
 if(action==='record-item'){
  const item=S.allocation.items.find(i=>i.id===d.item);allocationLastKind=item.group==='saving'?(['marriage','emergency'].includes(item.id)?'transfer':'saving'):'expense';allocationLastItem=item.id;txSheet();allocationForm.group=item.group;allocationForm.item=item.id;allocationRenderForm();
 }
 if(action==='form-kind'){
  allocationReadForm();allocationForm.kind=d.kind;allocationForm.item=allocationOptions(d.kind,allocationForm.group)[0]?.id||'';allocationForm.inst=0;allocationForm.from='';allocationRenderForm();
 }
 if(action==='save-record'){
  allocationReadForm();const f=allocationForm;
  if(!allocationValidNumber(f.amount)||+f.amount<=0)return showErr('금액을 입력해 주세요.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(f.date)||Number.isNaN(Date.parse(f.date)))return showErr('날짜를 확인해 주세요.');
  if(!f.item&&f.kind!=='transfer')return showErr('항목을 선택해 주세요.');
  if(f.kind==='transfer'&&f.from===f.item)return showErr('보내는 곳과 받는 곳이 같아요.');
  if(f.inst&&!Number.isInteger(f.inst)||f.inst<0||f.inst>60)return showErr('할부는 2~60개월로 입력해 주세요.');
  const cat=f.kind==='income'?S.mcats.find(c=>c.type==='in'&&c.name===(ALLOC_INCOMES.find(([id])=>id===f.item)?.[1])):allocationCat(f.item);
  const o={...(f.original||{}),id:f.id||uid(),type:f.kind==='income'?'in':f.kind==='transfer'?'transfer':'out',date:f.date,amount:Math.round(+f.amount),catId:cat?.id||'',allocationItem:f.kind==='income'?'':f.item,allocationFrom:f.kind==='transfer'?f.from:'',memo:f.memo.trim(),plan:f.plan,inst:(f.kind==='expense'||(f.kind==='saving'&&f.original?.inst>1))&&!f.plan&&f.inst>1?f.inst:0};
  const oldGroup=f.original?allocationClass(f.original).group:null,newGroup=S.allocation.items.find(i=>i.id===f.item)?.group;
  if(o.fx&&(f.kind==='income'||(oldGroup&&newGroup&&oldGroup!==newGroup)))delete o.fx;
  if(f.id)Object.assign(S.money.find(r=>r.id===f.id),o);else S.money.push(o);
  allocationLastKind=f.kind;allocationLastItem=f.item;save();closeSheet();render();toast('저장했어요');
 }
 if(action==='save-plan'){
  const plan=HaruAllocation.planFor(S.allocation,moneyMonth);
  const inputs=[...document.querySelectorAll('[data-plan-item]')];
  if(inputs.some(i=>!allocationValidNumber(i.value)))return showErr('0 이상의 금액을 입력해 주세요.');
  delete plan.uninitialized;plan.amounts=Object.fromEntries(inputs.map(i=>[i.dataset.planItem,Math.round(+i.value)]));S.allocation.plans[moneyMonth]=plan;
  if(moneyMonth<S.allocation.start)S.allocation.start=moneyMonth;
  save();closeSheet();render();toast('예산·목표를 저장했어요');
 }
 if(action==='save-item-budget'){
  const value=document.getElementById('alloc-item-amount').value;if(!allocationValidNumber(value))return showErr('0 이상의 금액을 입력해 주세요.');
  const p=HaruAllocation.planFor(S.allocation,moneyMonth);p.amounts[d.item]=Math.round(+value);delete p.uninitialized;S.allocation.plans[moneyMonth]=p;if(moneyMonth<S.allocation.start)S.allocation.start=moneyMonth;save();closeSheet();render();
 }
 if(action==='save-openings'){
  const ids=['emergency','marriage','gift','special','medical'],target=document.getElementById('alloc-target').value;
  if(!allocationValidNumber(target)||+target<=0||ids.some(id=>!allocationValidNumber(document.getElementById('opening-'+id).value)))return showErr('잔액과 목표 금액을 확인해 주세요.');
  ids.forEach(id=>S.allocation.openings[id]=Math.round(+document.getElementById('opening-'+id).value));S.allocation.emergencyTarget=Math.round(+target);S.allocation.autoReallocate=document.getElementById('alloc-auto').value==='1';save();closeSheet();render();
 }
 if(action==='csv'||action==='plan-csv'){
  const a=allocationSnapshot();let rows;
  if(action==='plan-csv')rows=[['구역','항목','월 예산·목표','이월','실제','잔여','적립 잔액'],...Object.values(a.items).map(i=>[ALLOC_GROUPS[i.group].name,i.name,i.planned,i.carry,i.actual,i.remaining,['emergency','marriage','gift','special','medical'].includes(i.id)?i.balance:''])];
  else rows=[['날짜','종류','구역','항목','금액','내용','상태','보내는 곳'],...HaruAllocation.rowsForMonth(S.money,moneyMonth).map(r=>{const c=allocationClass(r);return [r.date,{income:'수입',expense:'소비',saving:'저축·투자',transfer:'이체'}[c.kind],ALLOC_GROUPS[c.group]?.name||'수입',c.item?allocationName(c.item):mcatOf(r.catId).name,r.amount,r.memo||'',allocationState(r)||'기록',r.allocationFrom?allocationName(r.allocationFrom):''];})];
  await sendFile(`하루-${moneyMonth}-${action==='csv'?'기록':'예산표'}.csv`,HaruFinance.csv(rows),'text/csv;charset=utf-8','저장했어요');
 }
});
