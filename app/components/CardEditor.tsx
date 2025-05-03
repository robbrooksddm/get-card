/**********************************************************************
 * CardEditor.tsx  ⟩  WYSIWYG editor for a 4-page greeting card
 * --------------------------------------------------------------------
 *  ▸ Staff   mode – toolbar shows upload / font tools
 *  ▸ Customer mode – stripped-down toolbar
 * 2025-05-06  • put CoachMark back (fix TS 2304)
 *********************************************************************/
'use client'

import {useEffect, useRef, useState} from 'react'
import {fabric}                      from 'fabric'

import {useEditor}                   from './EditorStore'
import LayerPanel                    from './LayerPanel'
import FabricCanvas, {undo, redo}    from './FabricCanvas'
import TextToolbar                   from './TextToolbar'
import type {TemplatePage}           from './FabricCanvas'

/* ---------- helpers --------------------------------------------- */
type Section = 'front' | 'inside' | 'back'
type PageIdx = 0 | 1 | 2 | 3
type Mode    = 'staff' | 'customer'
export type SaveFn = (pages: TemplatePage[]) => void | Promise<void>

const EMPTY: TemplatePage[] = [
  {name:'front'  , layers: []},
  {name:'inner-L', layers: []},
  {name:'inner-R', layers: []},
  {name:'back'   , layers: []},
]

/* ────────────────────────────────────────────────────────────────── */
/* ★ Coach-mark bubble -------------------------------------------- */
function CoachMark({
  anchor,
  onClose,
}:{
  anchor : DOMRect | null
  onClose: () => void
}) {
  if (!anchor) return null
  return (
    <div
      className="fixed z-40 animate-fade-in"
      style={{top: anchor.top - 10, left: anchor.right + 12}}
    >
      <div className="relative bg-gray-800 text-white rounded-lg shadow-lg
                      px-4 py-3 max-w-[220px] text-sm leading-snug">
        Want to star in this poster?
        <br/>Upload your photo!
        <button
          onClick={onClose}
          className="absolute top-1.5 right-2 opacity-70 hover:opacity-100"
        >
          ✕
        </button>
        <div className="absolute -left-2 top-6 w-0 h-0 border-y-8
                        border-y-transparent border-r-[12px] border-r-gray-800"/>
      </div>
    </div>
  )
}
/* ────────────────────────────────────────────────────────────────── */

export default function CardEditor({
  initialPages,
  mode = 'customer',
  onSave,
}:{
  initialPages: TemplatePage[] | undefined
  mode?       : Mode
  onSave?     : SaveFn
}) {
  /* 1 ─ hydrate store once -------------------------------------- */
  useEffect(()=>{
    useEditor.getState().setPages(
      Array.isArray(initialPages) && initialPages.length === 4
        ? initialPages
        : EMPTY,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  /* 2 ─ reactive data ------------------------------------------- */
  const pages     = useEditor(s=>s.pages)
  const setActive = useEditor(s=>s.setActive)
  const addText   = useEditor(s=>s.addText)
  const addImage  = useEditor(s=>s.addImage)

  /* 3 ─ visible section ----------------------------------------- */
  const [section,setSection] = useState<Section>('front')
  const activeIdx: PageIdx =
    section==='front'  ? 0 :
    section==='inside' ? 1 : 3

  useEffect(()=>{ setActive(activeIdx) },[activeIdx,setActive])

  /* 4 ─ canvases map -------------------------------------------- */
  const [canvasMap,setCanvasMap] =
    useState<(fabric.Canvas|null)[]>([null,null,null,null])

  const onReady = (idx:number,fc:fabric.Canvas|null) =>
    setCanvasMap(list => {const next=[...list]; next[idx]=fc; return next})

  const activeFc = canvasMap[activeIdx]

  /* 5 ─ save ----------------------------------------------------- */
  const [saving,setSaving] = useState(false)
  const handleSave = async () => {
    if(!onSave) return
    setSaving(true)
    try   { await onSave(pages) }            // send full pages[]
    finally{ setSaving(false) }
  }

  /* 6 ─ coach-mark ---------------------------------------------- */
  const [anchor,setAnchor] = useState<DOMRect|null>(null)
  const shownRef = useRef(false)

  useEffect(()=>{
    if (typeof window==='undefined') return
    if (shownRef.current) return
    if (localStorage.getItem('ai_coachmark_shown')) return

    const show = () => {
      const ph = document.querySelector('[data-ai-placeholder]') as HTMLElement|null
      if (ph) setAnchor(ph.getBoundingClientRect())
    }
    const t = setTimeout(show, 300)

    const dismiss = () => {
      setAnchor(null)
      localStorage.setItem('ai_coachmark_shown','1')
    }

    document.addEventListener('pointerenter', e=>{
      if (e.target === document.querySelector('[data-ai-placeholder]'))
        dismiss()
    }, {once:true})

    setTimeout(dismiss, 3000)
    shownRef.current = true

    return () => clearTimeout(t)
  },[])

  /* 7 ─ loader --------------------------------------------------- */
  if (pages.length !== 4) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-500">
        loading template…
      </div>
    )
  }

  /* 8 ─ UI ------------------------------------------------------- */
  const box = 'flex-shrink-0 w-[420px]'

  return (
    <div className="flex h-screen relative">
      <CoachMark anchor={anchor} onClose={()=>setAnchor(null)}/>

      <LayerPanel/>

      <div className="flex-1 flex flex-col">
        <TextToolbar
          canvas   ={activeFc}
          addText  ={addText}
          addImage ={addImage}
          onUndo   ={()=>activeFc && undo(activeFc)}
          onRedo   ={()=>activeFc && redo(activeFc)}
          onSave   ={handleSave}
          mode     ={mode}
          saving   ={saving}
        />

        {/* section tabs */}
        <nav className="flex justify-center gap-8 py-3 text-sm font-medium">
          {(['front','inside','back'] as Section[]).map(lbl=>(
            <button key={lbl}
              onClick={()=>setSection(lbl)}
              className={section===lbl
                ?'text-blue-600 border-b-2 border-blue-600 pb-1'
                :'text-gray-500 hover:text-gray-800'}>
              {lbl.replace(/^./,c=>c.toUpperCase())}
            </button>
          ))}
        </nav>

        {/* canvases */}
        <div className="flex-1 flex justify-center items-start overflow-auto
                        bg-gray-100 dark:bg-gray-900 pt-6 gap-6">
          {/* front */}
          <div className={section==='front'?box:'hidden'}>
            <FabricCanvas pageIdx={0} page={pages[0]} onReady={fc=>onReady(0,fc)}/>
          </div>

          {/* inside */}
          <div className={section==='inside'?'flex gap-6':'hidden'}>
            <div className={box}>
              <FabricCanvas pageIdx={1} page={pages[1]} onReady={fc=>onReady(1,fc)}/>
            </div>
            <div className={box}>
              <FabricCanvas pageIdx={2} page={pages[2]} onReady={fc=>onReady(2,fc)}/>
            </div>
          </div>

          {/* back */}
          <div className={section==='back'?box:'hidden'}>
            <FabricCanvas pageIdx={3} page={pages[3]} onReady={fc=>onReady(3,fc)}/>
          </div>
        </div>

        {/* thumbnails */}
        <div className="flex justify-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 text-xs">
          {(['FRONT','INNER-L','INNER-R','BACK'] as const).map((lbl,i)=>(
            <button key={lbl}
              className={`thumb ${
                (section==='front'  && i===0) ||
                (section==='inside' && (i===1||i===2)) ||
                (section==='back'   && i===3) ? 'thumb-active' : ''}`}
              onClick={()=>setSection(i===0?'front':i===3?'back':'inside')}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}