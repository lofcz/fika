import{B as e,C as t,Et as n,Ot as r,R as i,S as a,T as o,Z as s,_ as c,f as l,g as u,n as d,ot as f,t as p,ut as m,y as h}from"./_plugin-vue_export-helper-CDX5ed73.js";import{g,t as _}from"./slides-DxBaAoCg.js";import{u as v}from"./BaseShapeElement-BQgGIBZu.js";import{a as y,d as b,l as x,m as S,n as C,o as w}from"./index-VnWIxbUD.js";var T=()=>{let e=document.createElement(`iframe`);return e.style.width=`0`,e.style.height=`0`,e.style.position=`absolute`,e.style.right=`0`,e.style.top=`0`,e.style.border=`0`,document.body.appendChild(e),e},E=(e,t,n)=>{let r=``,i=document.styleSheets;if(i){for(let e of i)if(e.cssRules)for(let t of e.cssRules)r+=t.cssText}let{width:a,height:o,margin:s}=n,c=`
    <head>
      <style type="text/css">
        ${r} 
        html, body {
          height: auto;
          overflow: auto;
        }
        @media print {
          @page {
            size: ${a+2*s}px ${(o+2*s)*1.005}px;
            margin: ${s}px;
          }
        }
      </style>
    </head>
  `,l=`<body>`+t.innerHTML+`</body>`;e.open(),e.write(`
    <!DOCTYPE html>
    <html>
      ${c}
      ${l}
    </html>
  `),e.close()},D=(e,t)=>{let n=T(),r=n.contentWindow;if(!n.contentDocument||!r)return;E(n.contentDocument,e,t);let i=()=>{r.focus(),r.print()},a=()=>{n.removeEventListener(`load`,i),r.removeEventListener(`afterprint`,a),document.body.removeChild(n)};n.addEventListener(`load`,i),r.addEventListener(`afterprint`,a)},O={class:`export-pdf-dialog`},k={class:`thumbnails-view`},A={class:`configs`},j={class:`row`},M={class:`title`},N={class:`row`},P={class:`title`},F={class:`row`},I={class:`title`},L={class:`config-item`},R={class:`tip`},z={class:`btns`},B=p(o({__name:`ExportPDF`,emits:[`close`],setup(o,{emit:p}){let{LL:T}=d(),E=p,{slides:B,currentSlide:V,viewportRatio:H}=g(_()),U=f(null),W=f(`all`),G=f(1),K=f(!0),q=()=>{if(!U.value)return;let e={width:1600,height:W.value===`all`?1600*H.value*G.value:1600*H.value,margin:K.value?50:0};D(U.value,e)};return(o,d)=>{let f=v;return i(),h(`div`,O,[u(`div`,k,[u(`div`,{class:`thumbnails`,ref_key:`pdfThumbnailsRef`,ref:U},[W.value===`current`?(i(),c(x,{key:0,class:`thumbnail`,slide:m(V),size:1600},null,8,[`slide`])):(i(!0),h(l,{key:1},e(m(B),(e,t)=>(i(),c(x,{class:n([`thumbnail`,{"break-page":(t+1)%G.value===0}]),key:e.id,slide:e,size:1600},null,8,[`class`,`slide`]))),128))],512)]),u(`div`,A,[u(`div`,j,[u(`div`,M,r(m(T).export.dialog.exportRange()),1),t(y,{class:`config-item`,value:W.value,"onUpdate:value":d[0]||=e=>W.value=e},{default:s(()=>[t(w,{style:{width:`50%`},value:`all`},{default:s(()=>[a(r(m(T).export.dialog.rangeAll()),1)]),_:1}),t(w,{style:{width:`50%`},value:`current`},{default:s(()=>[a(r(m(T).export.dialog.rangeCurrent()),1)]),_:1})]),_:1},8,[`value`])]),u(`div`,N,[u(`div`,P,r(m(T).export.pdf.slidesPerPage()),1),t(S,{class:`config-item`,value:G.value,"onUpdate:value":d[1]||=e=>G.value=e,options:[{label:`1`,value:1},{label:`2`,value:2},{label:`3`,value:3}]},null,8,[`value`])]),u(`div`,F,[u(`div`,I,r(m(T).export.pdf.pageMargin()),1),u(`div`,L,[t(C,{value:K.value,"onUpdate:value":d[2]||=e=>K.value=e},null,8,[`value`])])]),u(`div`,R,r(m(T).export.pdf.printTip()),1)]),u(`div`,z,[t(b,{class:`btn export`,type:`primary`,onClick:d[3]||=e=>q()},{default:s(()=>[t(f),a(` `+r(m(T).export.pdf.exportButton()),1)]),_:1}),t(b,{class:`btn close`,onClick:d[4]||=e=>E(`close`)},{default:s(()=>[a(r(m(T).common.close()),1)]),_:1})])])}}}),[[`__scopeId`,`data-v-4690fa5c`]]);export{B as default};