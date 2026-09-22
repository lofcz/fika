import { useAnimationFrameCallback } from '@/hooks/useAnimationFrameCallback'
import { recordRender } from '@/utils/renderMetrics'
import { useRef, useState, type PointerEvent } from 'react'
import { nanoid } from 'nanoid'
import { useMainStore, useSlidesStore, useKeyboardStore } from '@/store'
import type { WorkspaceLabel } from '@/types/slides'
import { useI18nContext } from '@/i18n/useI18nContext'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { drainCommitQueue } from '@/utils/commitQueue'
import { useWorkspacePages, useWorkspaceAnnotations } from './workspaceSelectors'
import { resolvePagePositions } from './pageLayout'
import { useMynaViewStore } from './viewStore'
import styles from './WorkspaceObjects.module.scss'
const messages = {
  en: { title:'Workspace', section:'Section', comment:'Comment', addSection:'Group pages in a section', addComment:'Add comment', name:'Section name', text:'Comment text', reply:'Reply', send:'Add reply', resolve:'Resolve', reopen:'Reopen', remove:'Delete', pages:'Pages in section', hint:'Sections move their pages together. Comments stay outside artwork and exports.', edit:'Edit in Pages panel', width:'Width', height:'Height' },
  cs: { title:'Pracovní plocha', section:'Sekce', comment:'Komentář', addSection:'Seskupit stránky do sekce', addComment:'Přidat komentář', name:'Název sekce', text:'Text komentáře', reply:'Odpověď', send:'Přidat odpověď', resolve:'Vyřešit', reopen:'Znovu otevřít', remove:'Odstranit', pages:'Stránky v sekci', hint:'Sekce přesouvají své stránky společně. Komentáře jsou mimo obsah stránek a neexportují se.', edit:'Upravit v panelu Stránky', width:'Šířka', height:'Výška' },
  sk: { title:'Pracovná plocha', section:'Sekcia', comment:'Komentár', addSection:'Zoskupiť stránky do sekcie', addComment:'Pridať komentár', name:'Názov sekcie', text:'Text komentára', reply:'Odpoveď', send:'Pridať odpoveď', resolve:'Vyriešiť', reopen:'Znovu otvoriť', remove:'Odstrániť', pages:'Stránky v sekcii', hint:'Sekcie presúvajú svoje stránky spoločne. Komentáre sú mimo obsahu stránok a neexportujú sa.', edit:'Upraviť v paneli Stránky', width:'Šírka', height:'Výška' },
  pl: { title:'Obszar roboczy', section:'Sekcja', comment:'Komentarz', addSection:'Grupuj strony w sekcji', addComment:'Dodaj komentarz', name:'Nazwa sekcji', text:'Treść komentarza', reply:'Odpowiedź', send:'Dodaj odpowiedź', resolve:'Rozwiąż', reopen:'Otwórz ponownie', remove:'Usuń', pages:'Strony w sekcji', hint:'Sekcje przesuwają swoje strony razem. Komentarze nie są eksportowane.', edit:'Edytuj w panelu Strony', width:'Szerokość', height:'Wysokość' },
}
function useText() { const {locale}=useI18nContext(); return messages[locale as keyof typeof messages] || messages.en }
function patch(owner: string, id: string, value: Partial<WorkspaceLabel> | null) {
  if (useMainStore.getState().readOnly) return
  const store=useSlidesStore.getState(), slide=store.slides.find(s=>s.id===owner)
  if (slide) store.updateSlide({workspaceLabels:value ? slide.workspaceLabels?.map(l=>l.id===id?{...l,...value}:l) : slide.workspaceLabels?.filter(l=>l.id!==id)},owner)
}
export function WorkspaceObjectsPanel() {
  const t=useText(), slides=useWorkspaceAnnotations(), index=useSlidesStore(s=>s.slideIndex), readOnly=useMainStore(s=>s.readOnly)
  const {addHistorySnapshot}=useHistorySnapshot()
  const add=(kind:'section'|'comment')=> {
    if (readOnly || !slides.length) return
    drainCommitQueue()
    const state=useSlidesStore.getState(), page=state.slides[state.slideIndex]
    const origin=resolvePagePositions(state.slides,state.viewportSize,state.viewportSize*state.viewportRatio).get(page.id)!
    const owner=state.slides[0]
    const label:WorkspaceLabel={id:nanoid(10),kind,text:kind==='section'?t.section:t.comment,fontSize:30,x:origin.x+(kind==='comment'?state.viewportSize+200:-100),y:origin.y-160,width:kind==='section'?state.viewportSize+200:640,height:kind==='section'?state.viewportSize*state.viewportRatio+260:360,...(kind==='section'?{pageIds:[page.id]}:{replies:[]})}
    // Pages belong to at most one section.
    if (kind==='section') for (const slide of state.slides) if (slide.workspaceLabels?.some(l=>l.pageIds?.includes(page.id))) state.updateSlide({workspaceLabels:slide.workspaceLabels.map(l=>l.kind==='section'?{...l,pageIds:l.pageIds?.filter(id=>id!==page.id)}:l)},slide.id)
    const current=useSlidesStore.getState().slides.find(s=>s.id===owner.id)!
    state.updateSlide({workspaceLabels:[...(current.workspaceLabels||[]),label]},owner.id); addHistorySnapshot()
  }
  return <section className={styles.panel} data-myna-workspace-objects-panel><h3>{t.title}</h3><p>{t.hint}</p><div className={styles.actions}><button disabled={readOnly} onClick={()=>add('section')}>{t.addSection}</button><button disabled={readOnly} onClick={()=>add('comment')}>{t.addComment}</button></div>
    {slides.flatMap(owner=>(owner.workspaceLabels||[]).filter(l=>l.kind).map(label=><ObjectFields key={label.id} owner={owner.id} label={label}/>))}
  </section>
}
function ObjectFields({owner,label}:{owner:string;label:WorkspaceLabel}) {
  const t=useText(), slides=useWorkspacePages(), readOnly=useMainStore(s=>s.readOnly), {addHistorySnapshot}=useHistorySnapshot()
  const [reply,setReply]=useState('')
  const commit=(value:Partial<WorkspaceLabel>|null)=>{drainCommitQueue();patch(owner,label.id,value);addHistorySnapshot()}
  return <details className={styles.fields} open><summary>{label.kind==='section'?t.section:t.comment} · {label.text.slice(0,42)}</summary>
    <textarea aria-label={label.kind==='section'?t.name:t.text} key={label.text} defaultValue={label.text} disabled={readOnly} maxLength={2000} onBlur={e=>{if(e.target.value.trim() && e.target.value.trim()!==label.text) commit({text:e.target.value.trim()})}}/>
    {label.kind==='section'? <fieldset disabled={readOnly}><legend>{t.pages}</legend>{slides.map((page,i)=><label key={page.id}><input type="checkbox" checked={label.pageIds?.includes(page.id)||false} onChange={e=>{
      drainCommitQueue();const checked=e.target.checked
      if(checked) for(const source of useSlidesStore.getState().slides) if(source.workspaceLabels) useSlidesStore.getState().updateSlide({workspaceLabels:source.workspaceLabels.map(l=>l.kind==='section'&&l.id!==label.id?{...l,pageIds:l.pageIds?.filter(id=>id!==page.id)}:l)},source.id)
      commit({pageIds:checked?[...(label.pageIds||[]),page.id]:(label.pageIds||[]).filter(id=>id!==page.id)})
    }}/>{page.canvasName||String(i+1)}</label>)}</fieldset> : <><div className={styles.replies}>{label.replies?.map((r,i)=><p key={i}>{r}</p>)}</div><input aria-label={t.reply} placeholder={t.reply} disabled={readOnly} maxLength={2000} value={reply} onChange={e=>setReply(e.target.value)}/><button disabled={readOnly||!reply.trim()} onClick={()=>{commit({replies:[...(label.replies||[]),reply.trim()]});setReply('')}}>{t.send}</button><button disabled={readOnly} onClick={()=>commit({resolved:!label.resolved})}>{label.resolved?t.reopen:t.resolve}</button></>}
    <button disabled={readOnly} onClick={()=>commit(null)}>{t.remove}</button>
  </details>
}
export function WorkspaceObject({label,owner,x,y,scale}:{label:WorkspaceLabel;owner:string;x:number;y:number;scale:number}) {
  recordRender('WorkspaceObject')
  const t=useText(), readOnly=useMainStore(s=>s.readOnly), {addHistorySnapshot,undo,redo}=useHistorySnapshot()
  const [editing,setEditing]=useState(false), [draft,setDraft]=useState(label.text)
  const [replying,setReplying]=useState(false), [reply,setReply]=useState('')
  const cancelled=useRef(false)
  const drag=useRef<{x:number;y:number;start:WorkspaceLabel;pages:Map<string,{x:number;y:number}>;resize:boolean;moved:boolean}|null>(null)
  const begin=(e:PointerEvent<HTMLElement>,resize=false)=> {
    if(readOnly||e.button!==0||useKeyboardStore.getState().spaceKeyState) return
    e.preventDefault();e.stopPropagation();drainCommitQueue();addHistorySnapshot.flush();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId)
    const state=useSlidesStore.getState(), positions=resolvePagePositions(state.slides,state.viewportSize,state.viewportSize*state.viewportRatio)
    drag.current={x:e.clientX,y:e.clientY,start:{...label},pages:new Map([...positions].filter(([id])=>label.pageIds?.includes(id))),resize,moved:false}
  }
  const moveNow=(e:PointerEvent<HTMLElement>)=> {
    const d=drag.current;if(!d||readOnly)return
    let dx=(e.clientX-d.x)/scale,dy=(e.clientY-d.y)/scale
    if(Math.hypot(dx,dy)*scale<3&&!d.moved)return
    d.moved=true
    if(e.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0}
    const view=useMynaViewStore.getState(),step=view.snapPagesToGrid&&!e.altKey?view.gridSize:1
    if(d.resize){patch(owner,label.id,{width:Math.max(240,Math.round(((d.start.width||640)+dx)/step)*step),height:Math.max(160,Math.round(((d.start.height||360)+dy)/step)*step)});return}
    if(view.snapPagesToGrid&&!e.altKey){dx=Math.round((d.start.x+dx)/step)*step-d.start.x;dy=Math.round((d.start.y+dy)/step)*step-d.start.y}
    useSlidesStore.getState().updateWorkspace({annotation:{owner,id:label.id,props:{x:d.start.x+dx,y:d.start.y+dy}},positions:Object.fromEntries([...d.pages].map(([id,p])=>[id,{x:p.x+dx,y:p.y+dy}]))})
  }
  const movement = useAnimationFrameCallback(moveNow)
  const move = movement.schedule
  const end=(cancel=false)=>{if(cancel)movement.cancel();else movement.flush();const d=drag.current;drag.current=null;if(!d?.moved)return;if(cancel){useSlidesStore.getState().updateWorkspace({annotation:{owner,id:label.id,props:d.start},positions:Object.fromEntries(d.pages)})}else addHistorySnapshot()}
  const save=()=>{setEditing(false);if(cancelled.current){cancelled.current=false;return}if(draft.trim()&&draft.trim()!==label.text&&!readOnly){patch(owner,label.id,{text:draft.trim()});addHistorySnapshot()}}
  const isSection=label.kind==='section'
  return <div data-myna-page-chrome data-myna-workspace-object={label.id} data-kind={label.kind} className={isSection?styles.section:styles.comment} style={{left:x,top:y,width:(label.width||640)*(isSection?scale:1),height:(label.height||(isSection?1200:360))*(isSection?scale:1),transform:isSection?undefined:`scale(${scale})`,transformOrigin:'0 0'}} onMouseDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onContextMenu={e=>e.stopPropagation()} onKeyDown={e=>{
    e.stopPropagation();if(e.key==='Escape'){end(true);cancelled.current=true;setEditing(false);setReplying(false)}
    if(readOnly||editing||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return
    if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();addHistorySnapshot.flush();if(e.shiftKey||e.key.toLowerCase()==='y')redo();else undo()}
    if(e.key==='Enter'){e.preventDefault();cancelled.current=false;setDraft(label.text);setEditing(true)}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();drainCommitQueue();const step=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0
      patch(owner,label.id,{x:label.x+dx,y:label.y+dy})
      const state=useSlidesStore.getState(),positions=resolvePagePositions(state.slides,state.viewportSize,state.viewportSize*state.viewportRatio)
      for(const id of label.pageIds||[]){const p=positions.get(id);if(p)state.updateSlide({canvasPosition:{x:p.x+dx,y:p.y+dy}},id)}addHistorySnapshot()
    }
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();patch(owner,label.id,null);addHistorySnapshot()}
  }}>
    <button data-myna-workspace-object-handle className={styles.handle} style={{fontSize:isSection?12:32}} onPointerDown={e=>begin(e)} onPointerMove={move} onPointerUp={()=>end()} onPointerCancel={()=>end(true)} onDoubleClick={()=>{if(!readOnly){cancelled.current=false;setDraft(label.text);setEditing(true)}}}>{isSection?label.text:`${label.resolved?'✓':'◌'} ${t.comment}`} {isSection&&<span>{label.pageIds?.length||0}</span>}</button>
    {editing?<textarea className={styles.edit} autoFocus aria-label={isSection?t.name:t.text} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={save} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();save()}}}/>:!isSection&&<div className={styles.body} style={{fontSize:24}} onDoubleClick={()=>{if(!readOnly){cancelled.current=false;setDraft(label.text);setEditing(true)}}}><p>{label.text}</p>{label.replies?.map((r,i)=><p className={styles.reply} key={i}>{r}</p>)}{replying&&<form onSubmit={e=>{e.preventDefault();if(!reply.trim()||readOnly)return;patch(owner,label.id,{replies:[...(label.replies||[]),reply.trim()]});addHistorySnapshot();setReply('');setReplying(false)}}><input autoFocus aria-label={t.reply} value={reply} maxLength={2000} onChange={e=>setReply(e.target.value)}/><button disabled={readOnly||!reply.trim()}>{t.send}</button></form>}<button disabled={readOnly} onClick={()=>setReplying(!replying)}>{t.reply}</button><button disabled={readOnly} onClick={()=>{patch(owner,label.id,{resolved:!label.resolved});addHistorySnapshot()}}>{label.resolved?t.reopen:t.resolve}</button></div>}
    {!readOnly&&<button aria-label={`${t.width} / ${t.height}`} className={styles.resize} onPointerDown={e=>begin(e,true)} onPointerMove={move} onPointerUp={()=>end()} onPointerCancel={()=>end(true)}>⌟</button>}
  </div>
}
