/**********************************************************************
 * CardEditor.tsx  –  WYSIWYG editor for a 4-page greeting card
 * --------------------------------------------------------------------
 * ▸ Staff mode     – toolbar shows upload / font tools
 * ▸ Customer mode  – stripped-down toolbar
 * 2025-05-11       – wires SelfieDrawer → swaps chosen variant into canvas
 *********************************************************************/
'use client'

import { useEffect, useRef, useState } from 'react'
import { fabric }                       from 'fabric'

import { useEditor }                    from './EditorStore'
if (typeof window !== 'undefined') (window as any).useEditor = useEditor // debug helper

import LayerPanel                       from './LayerPanel'
import FabricCanvas                      from './FabricCanvas'
import TextToolbar                      from './TextToolbar'
import SelfieDrawer                     from './SelfieDrawer'
import type { TemplatePage }            from './FabricCanvas'

/* ---------- helpers ------------------------------------------------ */
type Section = 'front' | 'inside' | 'back'
type PageIdx = 0 | 1 | 2 | 3
type Mode    = 'staff' | 'customer'
export type SaveFn = (pages: TemplatePage[]) => void | Promise<void>

const EMPTY: TemplatePage[] = [
  { name: 'front'  , layers: [] },
  { name: 'inner-L', layers: [] },
  { name: 'inner-R', layers: [] },
  { name: 'back'   , layers: [] },
]

/* ---------- tiny coach-mark component ------------------------------ */
function CoachMark({ anchor, onClose }: { anchor: DOMRect | null; onClose: () => void }) {
  if (!anchor) return null
  return (
    <div
      className="fixed z-40 animate-fade-in"
      style={{ top: anchor.top - 10, left: anchor.right + 12 }}
    >
      <div className="relative bg-gray-800 text-white rounded-lg shadow-lg px-4 py-3 max-w-[220px] text-sm leading-snug">
        Want to star in this poster?
        <br />Upload your photo!
        <button
          onClick={onClose}
          className="absolute top-1.5 right-2 opacity-70 hover:opacity-100"
        >
          ✕
        </button>
        <div className="absolute -left-2 top-6 w-0 h-0 border-y-8 border-y-transparent border-r-[12px] border-r-gray-800" />
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────── */
export default function CardEditor({
  initialPages,
  mode = 'customer',
  onSave,
}: {
  initialPages: TemplatePage[] | undefined
  mode?: Mode
  onSave?: SaveFn
}) {
  /* 1 ─ hydrate Zustand once ------------------------------------- */
  useEffect(() => {
    useEditor.getState().setPages(
      Array.isArray(initialPages) && initialPages.length === 4 ? initialPages : EMPTY,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 2 ─ store selectors ------------------------------------------ */
  const pages       = useEditor(s => s.pages)
  const setActive   = useEditor(s => s.setActive)
  const addText     = useEditor(s => s.addText)
  const addImage    = useEditor(s => s.addImage)
  const updateLayer = useEditor(s => s.updateLayer)
  const undo = useEditor(s => s.undo)
  const redo = useEditor(s => s.redo)


  /* 3 ─ visible section ------------------------------------------ */
  const [section, setSection] = useState<Section>('front')
  const activeIdx: PageIdx =
    section === 'front'  ? 0 :
    section === 'inside' ? 1 :
    3                                                        // back
  useEffect(() => { setActive(activeIdx) }, [activeIdx, setActive])

  /* 4 ─ Fabric canvases ------------------------------------------ */
  const [canvasMap, setCanvasMap] =
    useState<(fabric.Canvas | null)[]>([null, null, null, null])
  const onReady = (idx: number, fc: fabric.Canvas | null) =>
    setCanvasMap(list => { const next = [...list]; next[idx] = fc; return next })
  const activeFc = canvasMap[activeIdx]

  /* track cropping state per page */
  const [cropping, setCropping] =
    useState<[boolean, boolean, boolean, boolean]>([false, false, false, false])
  const handleCroppingChange = (idx: number, state: boolean) =>
    setCropping(prev => { const next = [...prev] as typeof prev; next[idx] = state; return next })

  /* 5 ─ save ------------------------------------------------------ */
  const [saving, setSaving] = useState(false)
  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try { await onSave(pages) }
    finally { setSaving(false) }
  }

/* 6 ─ selfie drawer ------------------------------------------------- */
const [drawerOpen, setDrawerOpen]           = useState(false)
const [aiPlaceholderId, setAiPlaceholderId] = useState<string | null>(null)

/* listen for the event FabricCanvas now emits */
useEffect(() => {
  const open = (e: Event) => {
    const id =
      (e as CustomEvent<{ placeholderId: string | null }>).detail
        ?.placeholderId ?? null
    setAiPlaceholderId(id)
    setDrawerOpen(true)
  }
  document.addEventListener('open-selfie-drawer', open)
  return () => document.removeEventListener('open-selfie-drawer', open)
}, [])

/* 6 b – when the user picks one of the generated variants ----------- */
const handleSwap = (url: string) => {
  const pageIdx = activeIdx                         // current page
  const lyIdx   = pages[pageIdx].layers.findIndex(  // its aiLayer
                    l => l._type === 'aiLayer')
  if (lyIdx === -1) return                          // nothing to swap

  const { x, y, w, h } =
        pages[pageIdx].layers[lyIdx] as any         // keep geometry

  updateLayer(pageIdx, lyIdx, {
    _type : 'editableImage',                        // ← now a normal image
    src   : url,                                    // variant’s CDN URL
    x, y, w, h,
  })

  setDrawerOpen(false)
}

  /* 7 ─ coach-mark ----------------------------------------------- */
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current || typeof window === 'undefined') return
    if (localStorage.getItem('ai_coachmark_shown'))      return

    let tries = 0
    const tick = () => {
      const el = document.querySelector('[data-ai-placeholder]') as HTMLElement | null
      if (el) {
        const update = () => setAnchor(el.getBoundingClientRect())
        update()
        window.addEventListener('scroll',  update, { passive:true })
        window.addEventListener('resize', update)
        return
      }
      if (++tries < 15) setTimeout(tick, 200)
    }
    tick()
    ran.current = true
  }, [])

  /* 8 ─ loader guard --------------------------------------------- */
  if (pages.length !== 4) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-500">
        loading template…
      </div>
    )
  }

  const box = 'flex-shrink-0 w-[420px]'

  /* ---------------- UI ------------------------------------------ */
  return (
    <div className="flex h-screen relative">

      {/* global overlays */}
      <CoachMark
        anchor={anchor}
        onClose={() => {
          setAnchor(null)
          localStorage.setItem('ai_coachmark_shown', '1')
        }}
      />
      <SelfieDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUseSelected={handleSwap}
        placeholderId={aiPlaceholderId}   /* ← NEW prop */
      />

      {/* sidebar */}
      <LayerPanel />

      {/* main */}
     <div className="flex-1 flex flex-col">
     <TextToolbar
     canvas   ={activeFc}
     addText  ={addText}
     addImage ={addImage}
     onUndo   ={undo}
     onRedo   ={redo}
     onSave   ={handleSave}
      mode     ={mode}
      saving   ={saving}
/>

        {cropping[activeIdx] && (
          <div className="absolute top-2 inset-x-0 flex justify-center z-30 pointer-events-none">
            <div className="flex gap-2 pointer-events-auto">
              <button
                onClick={() => canvasMap[activeIdx]?.commitCrop?.()}
                className="px-3 py-1 rounded bg-green-600 text-white"
              >
                ✔ Done
              </button>
              <button
                onClick={() => canvasMap[activeIdx]?.cancelCrop?.()}
                className="px-3 py-1 rounded bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* tabs */}
        <nav className="flex justify-center gap-8 py-3 text-sm font-medium">
          {(['front','inside','back'] as Section[]).map(lbl => (
            <button
              key={lbl}
              onClick={() => setSection(lbl)}
              className={
                section === lbl
                  ? 'text-blue-600 border-b-2 border-blue-600 pb-1'
                  : 'text-gray-500 hover:text-gray-800'
              }
            >
              {lbl.replace(/^./, c => c.toUpperCase())}
            </button>
          ))}
        </nav>

        {/* canvases */}
        <div className="flex-1 flex justify-center items-start overflow-auto bg-gray-100 dark:bg-gray-900 pt-6 gap-6">
          {/* front */}
          <div className={section === 'front' ? box : 'hidden'}>
            <FabricCanvas
              pageIdx={0}
              page={pages[0]}
              onReady={fc => onReady(0, fc)}
              isCropping={cropping[0]}
              onCroppingChange={state => handleCroppingChange(0, state)}
            />
          </div>
          {/* inside */}
          <div className={section === 'inside' ? 'flex gap-6' : 'hidden'}>
            <div className={box}>
              <FabricCanvas
                pageIdx={1}
                page={pages[1]}
                onReady={fc => onReady(1, fc)}
                isCropping={cropping[1]}
                onCroppingChange={state => handleCroppingChange(1, state)}
              />
            </div>
            <div className={box}>
              <FabricCanvas
                pageIdx={2}
                page={pages[2]}
                onReady={fc => onReady(2, fc)}
                isCropping={cropping[2]}
                onCroppingChange={state => handleCroppingChange(2, state)}
              />
            </div>
          </div>
          {/* back */}
          <div className={section === 'back' ? box : 'hidden'}>
            <FabricCanvas
              pageIdx={3}
              page={pages[3]}
              onReady={fc => onReady(3, fc)}
              isCropping={cropping[3]}
              onCroppingChange={state => handleCroppingChange(3, state)}
            />
          </div>
        </div>

        {/* thumbnails */}
        <div className="flex justify-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 text-xs">
          {(['FRONT', 'INNER-L', 'INNER-R', 'BACK'] as const).map((lbl, i) => (
            <button
              key={lbl}
              className={`thumb ${
                (section === 'front'  && i === 0) ||
                (section === 'inside' && (i === 1 || i === 2)) ||
                (section === 'back'   && i === 3)
                  ? 'thumb-active'
                  : ''
              }`}
              onClick={() =>
                setSection(i === 0 ? 'front' : i === 3 ? 'back' : 'inside')
              }
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}