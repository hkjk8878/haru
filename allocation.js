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
 function planFor(model,ym){
  const key=Object.keys(model.plans).filter(k=>k<=ym).sort().at(-1);
  if(!key)return {grossIncome:0,netIncome:null,amounts:Object.fromEntries(model.items.map(i=>[i.id,0])),uninitialized:true};
  return copy(model.plans[key]);
 }
 function aliasItem(name){return Object.keys(aliases).find(id=>aliases[id].includes(String(name||'').trim()))||null;}
 function classify(r,model,cats=[],fixed=[]){
  const cat=cats.find(c=>c.id===r.catId)||{},fx=r.fx?fixed.find(f=>f.id===String(r.fx).split(':')[0]):null;
  let item=model.items.find(i=>i.id===(r.allocationItem||cat.allocationItem));
  if(!item){let id=aliasItem(fx?.name)||aliasItem(cat.name);if(!id&&(cat.sv||r.fx))id=aliasItem(r.memo);item=model.items.find(i=>i.id===id);}
  if(r.type==='in')return {kind:'income',group:'income',item:null,review:false};
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
 const api={definitions,aliases,createModel,planFor,aliasItem,classify,rowsForMonth,snapshot};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.HaruAllocation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
