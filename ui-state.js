/* Transient UI state is kept on this device, never in synced user records. */
(function(root){
 'use strict';
 function details(root){
   const seen={};
   return [...root.querySelectorAll('details')].map(el=>{
     const label=el.id||el.dataset.viewState||el.querySelector('summary')?.textContent.trim()||'details';
     const n=seen[label]||0;seen[label]=n+1;
     return [label+'::'+n,el];
   });
 }
 function capture(root,win){
   return {open:Object.fromEntries(details(root).map(([key,el])=>[key,el.open])),x:win.scrollX||0,y:win.scrollY||0,
     tables:[...root.querySelectorAll('.haru-table-wrap')].map(el=>el.scrollLeft)};
 }
 function restore(root,state,win,scroll=true){
   if(!state)return;
   details(root).forEach(([key,el])=>{if(Object.prototype.hasOwnProperty.call(state.open,key))el.open=state.open[key];});
   [...root.querySelectorAll('.haru-table-wrap')].forEach((el,i)=>{if(state.tables[i]!==undefined)el.scrollLeft=state.tables[i];});
   if(scroll)win.scrollTo(state.x,state.y);
 }
 function hideNav({mobile,editing,keyboard}){return !!mobile&&!!(editing||keyboard);}
 function watchKeyboard(win,doc){
   const vp=win.visualViewport;
   let baseline=Math.max(win.innerHeight,vp?.height||0),keyboard=false,queued=false,afterClose=null;
   const isText=el=>!!el&&(el.isContentEditable||el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&!/^(checkbox|radio|button|submit|reset|file|color|range|hidden)$/i.test(el.type)));
   function update(){
     const mobile=win.matchMedia('(pointer: coarse)').matches||win.innerWidth<=850;
     const editing=isText(doc.activeElement),height=vp?.height||win.innerHeight;
     if(!editing&&!keyboard)baseline=Math.max(win.innerHeight,height);
     const lost=baseline-height-(vp?.offsetTop||0);
     const wasOpen=keyboard;keyboard=mobile&&lost>120;
     doc.body.classList.toggle('haru-input-active',hideNav({mobile,editing,keyboard}));
     if(wasOpen&&!keyboard)afterClose?.();
   }
   function queue(){if(queued)return;queued=true;win.requestAnimationFrame(()=>{queued=false;update();});}
   doc.addEventListener('focusin',update);doc.addEventListener('focusout',queue);
   win.addEventListener('resize',queue);vp?.addEventListener('resize',queue);vp?.addEventListener('scroll',queue);
   win.addEventListener('orientationchange',()=>{baseline=win.innerHeight;queue();});
   update();return {update,isOpen:()=>keyboard,onClose(fn){afterClose=fn;}};
 }
 const api={capture,restore,hideNav,watchKeyboard};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.HaruUI=api;
})(typeof globalThis!=='undefined'?globalThis:this);
