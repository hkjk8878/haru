(function(root){
  'use strict';
  const total=rows=>rows.reduce((n,r)=>n+(Number(r.amount)||0),0);
  const days=ym=>new Date(Number(ym.slice(0,4)),Number(ym.slice(5)),0).getDate();
  function analyze({ym,today,cats,current,previous,budget=0,categoryBudgets={}}){
    const nowYM=today.slice(0,7), future=ym>nowYM, live=ym===nowYM;
    const end=live?Number(today.slice(8)):future?0:days(ym);
    const [y,m]=ym.split('-').map(Number);
    const previousYM=m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`;
    const compareDay=live?Math.min(end,days(previousYM)):days(previousYM);
    const currentCompareDay=live?compareDay:end;
    const catMap=new Map(cats.map(c=>[c.id,c]));
    const spending=r=>r.type==='out'&&!catMap.get(r.catId)?.sv;
    const posted=current.filter(r=>!r.plan&&Number(r.date.slice(8))<=end);
    const spent=total(posted.filter(spending));
    const savings=total(posted.filter(r=>r.type==='out'&&catMap.get(r.catId)?.sv));
    const income=total(posted.filter(r=>r.type==='in'));
    const planned=total(current.filter(r=>r.plan&&spending(r)));
    const futureBooked=total(current.filter(r=>!r.plan&&Number(r.date.slice(8))>end&&spending(r)));
    const prev=previous.filter(r=>!r.plan&&Number(r.date.slice(8))<=compareDay&&spending(r));
    const hasComparison=!future&&prev.length>0;
    const actual=posted.filter(spending);
    const ids=[...new Set([...cats.filter(c=>c.type==='out'&&!c.sv).map(c=>c.id),...actual.map(r=>r.catId)])];
    const categories=ids.map(id=>{
      const c=catMap.get(id)||{id,name:'분류 없음'};
      const records=actual.filter(r=>r.catId===id);
      const amount=total(records), before=total(prev.filter(r=>r.catId===id));
      const comparable=total(records.filter(r=>Number(r.date.slice(8))<=currentCompareDay));
      const count=records.length, limit=Number(categoryBudgets[id])||0;
      return {id,name:c.name,kind:c.spendKind||'unset',amount,before,delta:hasComparison?comparable-before:null,
        count,average:count?Math.round(amount/count):0,budget:limit,over:limit?Math.max(0,amount-limit):0,
        share:spent?amount/spent:0};
    }).sort((a,b)=>b.amount-a.amount);
    const candidate=categories.filter(c=>c.kind==='flex'&&c.amount>0)
      .sort((a,b)=>(b.over||Math.max(0,b.delta||0))-(a.over||Math.max(0,a.delta||0))||b.amount-a.amount)[0]||null;
    return {spent,savings,income,planned,futureBooked,budget,available:budget?budget-spent-planned-futureBooked:null,
      categories,candidate,hasComparison,compareDay,currentCompareDay,previousYM,end,live,future};
  }
  function csv(rows){
    const cell=v=>{let s=String(v??'');if(typeof v==='string'&&/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    return '\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n');
  }
  const api={analyze,csv};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.HaruFinance=api;
})(typeof globalThis!=='undefined'?globalThis:this);
