/**
 * Script added to a hidden copy of the preview for the full checks. It runs inside
 * the sandboxed iframe and reports back with postMessage:
 *   {pbCheck: runId, width, overflow, offenders, axe, brokenLinks}
 * axe-core is inlined before it (the iframe can't load files).
 */
export function runnerScript(runId: string, width: number): string {
  return `(function(){
  'use strict';
  var RUN=${JSON.stringify(runId)}, WIDTH=${Number(width)};
  function describe(el){
    var s=el.tagName.toLowerCase();
    if(el.id)s+='#'+el.id;
    else if(el.classList.length)s+='.'+Array.prototype.slice.call(el.classList,0,2).join('.');
    return s;
  }
  function done(axe){
    var vw=document.documentElement.clientWidth;
    var overflow=document.documentElement.scrollWidth>vw+1;
    var offenders=[];
    if(overflow){
      document.querySelectorAll('body *').forEach(function(el){
        if(offenders.length>=5)return;
        var r=el.getBoundingClientRect();
        if(r.right>vw+1&&r.width>0&&getComputedStyle(el).position!=='fixed'){
          var box=el.parentElement&&el.parentElement.getBoundingClientRect();
          if(!box||box.right<=vw+1)offenders.push(describe(el));
        }
      });
    }
    var broken=[];
    document.querySelectorAll('a[href^="#"]').forEach(function(a){
      var id=a.getAttribute('href').slice(1);
      if(id&&!document.getElementById(id)&&broken.indexOf('#'+id)<0)broken.push('#'+id);
    });
    parent.postMessage({pbCheck:RUN,width:WIDTH,overflow:overflow,offenders:offenders,axe:axe,brokenLinks:broken},'*');
  }
  function run(){
    // Show content that normally fades in, so it's checked as visitors finally see it.
    var st=document.createElement('style');
    st.textContent='.pb-reveal{opacity:1!important;transform:none!important;transition:none!important}*{animation:none!important}';
    document.head.appendChild(st);
    if(!window.axe){done([]);return;}
    window.axe.run(document,{resultTypes:['violations']}).then(function(r){
      done(r.violations.map(function(v){return {id:v.id,impact:v.impact||'minor',help:v.help,nodes:v.nodes.length}}));
    },function(){done([])});
  }
  if(document.readyState==='complete')setTimeout(run,50);else window.addEventListener('load',function(){setTimeout(run,50)});
})();`;
}

export const CHECK_WIDTHS = [390, 820, 1280];
