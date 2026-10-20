/**
 * Script and styles added to the editor's preview (never to exported sites).
 * The preview runs in a sandboxed iframe without access to the app, so it talks to
 * the editor only with postMessage:
 *   iframe → app  {pb:'edit', target, value} · {pb:'select', id} · {pb:'navigate', page, hash}
 *   app → iframe  {pb:'mode', mode:'edit'|'select'|'view'} · {pb:'highlight', id}
 */
export const EDITOR_CSS = `
[data-pb-edit]{cursor:text;border-radius:3px;transition:outline-color .15s}
html[data-pb-mode=edit] [data-pb-edit]:hover{outline:2px dashed rgba(37,99,235,.55);outline-offset:2px}
[data-pb-edit][contenteditable]{outline:2px solid #2563eb!important;outline-offset:2px;background:rgba(37,99,235,.06)}
html[data-pb-mode=select] .pb-section:hover,html[data-pb-mode=select] .pb-header:hover{outline:2px dashed rgba(37,99,235,.6);outline-offset:-2px;cursor:pointer}
.pb-selected{outline:3px solid #2563eb!important;outline-offset:-3px}
`;

export function editorScript(page: string): string {
  return `(function(){
  'use strict';
  var PAGE=${JSON.stringify(page)};
  var root=document.documentElement;
  root.setAttribute('data-pb-mode','edit');
  var post=function(m){try{parent.postMessage(m,'*')}catch(e){}};
  var editing=null, original='';
  function finish(save){
    if(!editing)return;
    var el=editing; editing=null;
    var value=el.innerText.replace(/\\u00a0/g,' ').replace(/\\n{3,}/g,'\\n\\n').trim();
    el.removeAttribute('contenteditable');
    if(!save){el.innerText=original;return;}
    if(value!==original.trim())post({pb:'edit',target:el.getAttribute('data-pb-edit'),value:value});
  }
  function select(sec){
    document.querySelectorAll('.pb-selected').forEach(function(x){x.classList.remove('pb-selected')});
    if(sec){sec.classList.add('pb-selected');post({pb:'select',id:sec.id||'header'});}
  }
  function resolve(href){
    try{var u=new URL(href,'https://site.invalid/'+PAGE);
      if(u.origin!=='https://site.invalid')return null;
      return {page:u.pathname.replace(/^\\//,'')||'index.html',hash:u.hash.replace(/^#/,'')};
    }catch(e){return null}
  }
  document.addEventListener('click',function(e){
    var mode=root.getAttribute('data-pb-mode');
    var t=e.target instanceof Element?e.target:null; if(!t)return;
    if(mode==='edit'){
      var ed=t.closest('[data-pb-edit]');
      if(ed){
        e.preventDefault();
        if(editing===ed)return;
        finish(true);
        editing=ed; original=ed.innerText;
        try{ed.contentEditable='plaintext-only'}catch(x){ed.contentEditable='true'}
        if(ed.contentEditable!=='plaintext-only')ed.contentEditable='true';
        ed.focus();
        return;
      }
    }
    if(mode==='select'){
      e.preventDefault();
      select(t.closest('.pb-section,.pb-header'));
      return;
    }
    var a=t.closest('a[href]');
    if(!a)return;
    var href=a.getAttribute('href')||'';
    if(/^(mailto:|tel:)/i.test(href)){e.preventDefault();return;}
    if(/^https?:/i.test(href))return; // opens in a new tab (allow-popups)
    e.preventDefault();
    var r=resolve(href); if(!r)return;
    if(r.page===PAGE){
      var target=r.hash&&document.getElementById(r.hash);
      if(target)target.scrollIntoView({behavior:'smooth'}); else window.scrollTo({top:0,behavior:'smooth'});
    } else post({pb:'navigate',page:r.page,hash:r.hash});
  },true);
  document.addEventListener('focusout',function(e){if(editing&&e.target===editing)finish(true)});
  document.addEventListener('keydown',function(e){
    if(!editing)return;
    if(e.key==='Escape'){e.preventDefault();finish(false);}
    else if(e.key==='Enter'&&!e.shiftKey&&!editing.matches('.pb-prose,blockquote,blockquote *')){e.preventDefault();editing.blur();}
  });
  document.addEventListener('submit',function(e){e.preventDefault()},true);
  window.addEventListener('message',function(e){
    var m=e.data; if(!m||typeof m!=='object')return;
    if(m.pb==='mode'){finish(true);root.setAttribute('data-pb-mode',m.mode);if(m.mode!=='select')select(null);}
    if(m.pb==='highlight'){
      var s=m.id&&document.getElementById(m.id);
      document.querySelectorAll('.pb-selected').forEach(function(x){x.classList.remove('pb-selected')});
      if(s){s.classList.add('pb-selected');s.scrollIntoView({behavior:'smooth',block:'start'});}
    }
  });
  post({pb:'ready',page:PAGE});
})();`;
}
