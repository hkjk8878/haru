(function(root){
 'use strict';
 const definitions=[
  ['youth','청년도약계좌','saving',400000],['housing','주택청약','saving',100000],['etf','ETF','saving',130000],['marriage','결혼자금','saving',444000],['emergency','비상금','saving',150000],
  ['phone','통신비','fixed',41717],['insurance','보험료','fixed',149089],['subscription','구독료','fixed',30000],
  ['transport','교통비','living',50000],['food','식비','living',50000],['date','데이트','living',150000],['hobby','취미','living',24000],['shopping','쇼핑·여가','living',36000],['supplies','생활용품','living',60000],['buffer','생활비 예비비','living',75194],
  ['gift','선물·경조사','reserve',50000],['special','특별 쇼핑','reserve',40000],['medical','의료·건강','reserve',20000]
 ];
 const aliases={youth:['청년도약','청년도약계좌'],housing:['주택청약','청약'],etf:['ETF'],marriage:['결혼자금','결혼자금 파킹통장'],emergency:['비상금','비상금 파킹통장'],phone:['통신비','휴대폰 요금'],insurance:['보험료','동양생명'],subscription:['구독료','ChatGPT Plus'],transport:['교통비','교통','대중교통'],food:['식비','개인 식사·간식'],date:['데이트'],hobby:['취미','만화책방'],shopping:['쇼핑·여가'],supplies:['생활용품'],buffer:['생활비 예비비'],gift:['선물·경조사'],special:['특별 쇼핑'],medical:['의료·건강']};
 const copy=x=>JSON.parse(JSON.stringify(x));
 const month=date=>String(date||'').slice(0,7);
 const end=ym=>ym+'-'+String(new Date(+ym.slice(0,4),+ym.slice(5),0).getDate()).padStart(2,'0');
 const next=ym=>{const y=+ym.slice(0,4),m=+ym.slice(5);return m===12?(y+1)+'-01':y+'-'+String(m+1).padStart(2,'0');};
 const cash=n=>Number.isFinite(+n)?Math.round(+n):0;
 function createModel(ym,date,existingIds=[]){
  const amounts=Object.fromEntries(definitions.map(([id,, ,n])=>[id,n]));
  return {version:1,start:ym,openingDate:date,excludedOpeningIds:[...existingIds],items:definitions.map(([id,name,group])=>({id,name,group})),
   plans:{[ym]:{grossIncome:2000000,netIncome:null,amounts}},openings:{emergency:490000,marriage:0,gift:0,special:0,medical:0},emergencyTarget:2500000,autoReallocate:true};
 }
 function planFor(model,ym,includeOverride=true){
  const key=Object.keys(model.plans).filter(k=>k<=ym).sort().at(-1);
  if(!key)return {grossIncome:0,netIncome:null,amounts:{...Object.fromEntries(model.items.map(i=>[i.id,0])),...(includeOverride?model.monthOverrides?.[ym]||{}:{})},uninitialized:true};
  const p=copy(model.plans[key]);if(includeOverride)Object.assign(p.amounts,model.monthOverrides?.[ym]||{});return p;
 }
 function saveBudget(model,ym,amounts,scope){
  if(scope!=='month'&&scope!=='ongoing')throw new Error('Invalid budget scope');
  for(const [id,value] of Object.entries(amounts))if(!model.items.some(i=>i.id===id)||!Number.isSafeInteger(value)||value<0)throw new Error('Invalid budget');
  model.monthOverrides=model.monthOverrides||{};
  if(scope==='month')model.monthOverrides[ym]={...(model.monthOverrides[ym]||{}),...amounts};
  else{
   const p=planFor(model,ym,false);delete p.uninitialized;Object.assign(p.amounts,amounts);model.plans[ym]=p;
   for(const id of Object.keys(amounts))if(model.monthOverrides[ym])delete model.monthOverrides[ym][id];
  }
  if(ym<model.start)model.start=ym;
 }
 function distributeBudget(total,amounts,retained=[]){
  if(!Number.isSafeInteger(total)||total<0)throw new Error('전체 예산은 0 이상의 정수로 입력해 주세요.');
  const entries=Object.entries(amounts),locks=new Set(retained),out={};
  if(entries.some(([,v])=>!Number.isSafeInteger(v)||v<0))throw new Error('항목별 예산을 확인해 주세요.');
  const fixed=entries.filter(([id])=>locks.has(id)).reduce((n,[,v])=>n+BigInt(v),0n),rest=BigInt(total)-fixed;
  if(rest<0n)throw new Error('유지할 금액이 전체 예산보다 커요. 전체 예산이나 유지할 금액을 조정해 주세요.');
  const free=entries.filter(([id])=>!locks.has(id));
  if(!free.length&&rest>0n)throw new Error('모든 항목이 금액 유지 중이에요. 나눠 넣을 항목의 유지를 해제해 주세요.');
  entries.forEach(([id,v])=>out[id]=locks.has(id)?v:0);
  if(!free.length)return out;
  const sum=free.reduce((n,[,v])=>n+BigInt(v),0n),den=sum||BigInt(free.length);
  const shares=free.map(([id,v],index)=>{const numerator=rest*(sum?BigInt(v):1n);out[id]=Number(numerator/den);return {id,index,remainder:numerator%den};});
  let left=Number(rest-free.reduce((n,[id])=>n+BigInt(out[id]),0n));
  shares.sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
  for(let i=0;i<left;i++)out[shares[i].id]++;
  return out;
 }
 function budgetName(name){return String(name||'').trim().replace(/\s*[（(][^()（）]*[)）]\s*$/,'').trim();}
 function aliasItem(name){
  const label=budgetName(name);
  return Object.keys(aliases).find(id=>aliases[id].includes(label))||null;
 }
 function classify(r,model,cats=[],fixed=[]){
  const cat=cats.find(c=>c.id===r.catId)||{},fx=r.fx?fixed.find(f=>f.id===String(r.fx).split(':')[0]):null;
  let item=model.items.find(i=>i.id===(r.allocationItem||cat.allocationItem));
  if(!item){let id=aliasItem(fx?.name)||aliasItem(cat.name);if(!id&&(cat.sv||r.fx))id=aliasItem(r.memo);item=model.items.find(i=>i.id===id);}
  if(r.type==='in')return {kind:'income',group:'income',item:null,review:false};
  if(r.fx&&budgetName(fx?.name||r.memo)==='비정기지출')return {kind:'transfer',group:'transfer',item:null,review:false};
  if(r.type==='transfer')return {kind:'transfer',group:item?.group||'transfer',item:item?.id||null,review:false};
  const markedFixed=cat.id==='fix'||cat.spendKind==='fixed'||cat.name==='고정비'||(r.fx&&!cat.sv&&item?.group!=='saving');
  if(markedFixed&&item?.group!=='fixed')return {kind:'expense',group:'fixed',item:null,review:true};
  let group=item?.group;
  if(!group)group=cat.sv?'saving':r.fx||cat.id==='fix'||cat.spendKind==='fixed'||cat.name==='고정비'?'fixed':'living';
  return {kind:group==='saving'?'saving':'expense',group,item:item?.id||null,review:!item};
 }
 function rowsForMonth(rows,ym){
  const out=[];for(const r of rows){
   const n=!r.plan&&r.type==='out'?Math.min(60,cash(r.inst)):0;
   if(n>1){let cur=month(r.date);for(let i=0;i<n;i++,cur=next(cur))if(cur===ym){const base=Math.floor(cash(r.amount)/n),d=Math.min(+r.date.slice(8),+end(cur).slice(8));out.push({...r,id:r.id+'#'+(i+1),instOf:r.id,instI:i+1,date:cur+'-'+String(d).padStart(2,'0'),amount:base+(i===0?cash(r.amount)-base*n:0)});}}
   else if(month(r.date)===ym)out.push({...r});
  }return out;
 }
 function history(rows,cutoff){
  const out=[];for(const r of rows){
   if(r.plan)continue;
   const n=r.type==='out'?Math.min(60,cash(r.inst)):0;
   if(n>1){let ym=month(r.date);for(let i=0;i<n&&ym<=month(cutoff);i++,ym=next(ym))out.push(...rowsForMonth([r],ym).filter(x=>x.date<=cutoff));}
   else if(r.date<=cutoff)out.push(r);
  }return out.sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
 }
 function snapshot(model,rows,cats,fixed,ym,today){
  const cutoff=end(ym)<today?end(ym):today,plan=planFor(model,ym);
  const itemMap=new Map(model.items.map(i=>[i.id,i]));
  const current=rowsForMonth(rows,ym).filter(r=>!r.plan&&r.date<=cutoff);
  const excluded=new Set(model.excludedOpeningIds||[]);
  const balanceRows=history(rows,cutoff).filter(r=>r.date>=model.openingDate&&!excluded.has(r.instOf||r.id));
  const balances=cutoff>=model.openingDate?{...model.openings}:{};let achieved=cutoff>=model.openingDate&&model.openings.emergency>=model.emergencyTarget?month(model.openingDate):null;
  for(const r of balanceRows){
   const c=classify(r,model,cats,fixed),v=cash(r.amount);
   if((c.kind==='transfer'||c.kind==='saving')&&c.item)balances[c.item]=(balances[c.item]||0)+v;
   if(c.kind==='expense'&&c.group==='reserve'&&c.item)balances[c.item]=(balances[c.item]||0)-v;
   if(r.allocationFrom&&!(c.kind==='expense'&&r.allocationFrom===c.item&&c.group==='reserve'))balances[r.allocationFrom]=(balances[r.allocationFrom]||0)-v;
   if(!achieved&&(balances.emergency||0)>=model.emergencyTarget)achieved=month(r.date);
  }
  if(model.reserveBudgetMode){
   const reserveIds=model.items.filter(i=>i.group==='reserve').map(i=>i.id);
   reserveIds.forEach(id=>balances[id]=cutoff>=model.openingDate?cash(model.openings[id]):0);
   for(let m=model.start>month(model.openingDate)?model.start:month(model.openingDate);m<=ym&&m<=month(today);m=next(m)){
    const monthly=planFor(model,m);reserveIds.forEach(id=>balances[id]+=cash(monthly.amounts[id]));
   }
   for(const r of balanceRows){const c=classify(r,model,cats,fixed);if(c.kind==='expense'&&c.group==='reserve'&&c.item)balances[c.item]-=cash(r.amount);}
  }
  if(model.autoReallocate&&achieved&&ym>achieved){const n=cash(plan.amounts.emergency);plan.amounts.emergency=0;plan.amounts.marriage=cash(plan.amounts.marriage)+n;}
  let carry=0;
  for(let m=model.start;m<ym;m=next(m)){
   const spent=rowsForMonth(rows,m).filter(r=>!r.plan&&r.date<=today&&classify(r,model,cats,fixed).item==='etf'&&r.type==='out').reduce((n,r)=>n+cash(r.amount),0);
   carry=Math.max(0,carry+cash(planFor(model,m).amounts.etf)-spent);
  }
  const items=Object.fromEntries(model.items.map(i=>[i.id,{...i,planned:cash(plan.amounts[i.id]),carry:i.id==='etf'?carry:0,available:cash(plan.amounts[i.id])+(i.id==='etf'?carry:0),actual:0,spent:0,balance:ym>=model.start?cash(balances[i.id]):0}]));
  const groups=Object.fromEntries(['saving','fixed','living','reserve'].map(group=>[group,{planned:0,available:0,actual:0,spent:0}]));
  Object.values(items).forEach(i=>{groups[i.group].planned+=i.planned;groups[i.group].available+=i.available;});
  let income=0,spending=0;const review=[];
  current.forEach(r=>{
   const c=classify(r,model,cats,fixed),v=cash(r.amount),i=items[c.item],g=groups[c.group];
   if(c.kind==='income'){income+=v;return;}
   if(c.review)review.push(r.instOf||r.id);
   if(c.kind==='expense'){
    spending+=v;if(g)g.spent+=v;if(i)i.spent+=v;
    if(c.group!=='reserve'){if(g)g.actual+=v;if(i)i.actual+=v;}
   }else if(c.kind==='saving'||c.kind==='transfer'){
    if(g)g.actual+=v;if(i)i.actual+=v;
   }
   if(r.type==='transfer'&&r.allocationFrom){const source=items[r.allocationFrom];if(source){source.actual-=v;groups[source.group].actual-=v;}}
  });
  Object.values(items).forEach(i=>i.remaining=i.available-i.actual);
  Object.values(groups).forEach(g=>g.remaining=g.available-g.actual);
  if(model.reserveBudgetMode){groups.reserve.balance=Object.values(items).filter(i=>i.group==='reserve').reduce((n,i)=>n+i.balance,0);groups.reserve.remaining=groups.reserve.balance;}
  const sharedLimit=items.hobby.planned+items.shopping.planned,sharedUsed=items.hobby.actual+items.shopping.actual;
  const bufferUsed=items.buffer.actual;
  const totalPlanned=Object.values(groups).reduce((n,g)=>n+g.planned,0),netPlanned=plan.netIncome===null||plan.netIncome===undefined?null:cash(plan.netIncome);
  return {items,groups,plan,totalPlanned,netPlanned,grossIncome:cash(plan.grossIncome),income,spending,savingRate:income>0?groups.saving.actual/income:null,
   shortfall:netPlanned===null?null:Math.max(0,totalPlanned-netPlanned),unallocated:netPlanned===null?null:netPlanned-totalPlanned,
   shared:{limit:sharedLimit,used:sharedUsed,remaining:sharedLimit-sharedUsed},buffer:{limit:items.buffer.planned,used:bufferUsed,remaining:items.buffer.planned-bufferUsed},
   review:[...new Set(review)],achievedMonth:achieved,cutoff};
 }
 const api={definitions,aliases,createModel,planFor,saveBudget,distributeBudget,budgetName,aliasItem,classify,rowsForMonth,snapshot};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.HaruAllocation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
