'use client'

import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { fabric }                       from 'fabric'

import { useEditor, setEditorSpec }     from './EditorStore'
if (typeof window !== 'undefined') (window as any).useEditor = useEditor // debug helper

import LayerPanel                       from './LayerPanel'
import FabricCanvas, {
  pageW,
  pageH,
  EXPORT_MULT,
  setPrintSpec,
  setPreviewSpec,
  setSafeInset,
  PrintSpec,
  PreviewSpec,
  previewW,
  previewH,
} from './FabricCanvas'
import TextToolbar                      from './TextToolbar'
import ImageToolbar                     from './ImageToolbar'
import EditorCommands                   from './EditorCommands'
import SelfieDrawer                     from './SelfieDrawer'
import CropDrawer                      from './CropDrawer'
import PreviewModal                    from './PreviewModal'
import { CropTool }                     from '@/lib/CropTool'
import WaltyEditorHeader                from './WaltyEditorHeader'
import type { TemplatePage }            from './FabricCanvas'
import type { TemplateProduct }         from '@/app/library/getTemplatePages'


/* ---------- helpers ------------------------------------------------ */
type Section = 'front' | 'inside' | 'back'
type PageIdx = 0 | 1 | 2 | 3
type Mode    = 'staff' | 'customer'
export type SaveFn = (
  pages: TemplatePage[],
  coverImageId?: string,
) => void | Promise<void>

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
  templateId,
  printSpec,
  previewSpec,
  products = [],
  mode = 'customer',
  onSave,
}: {
  initialPages: TemplatePage[] | undefined
  templateId?: string
  printSpec?: PrintSpec
  previewSpec?: PreviewSpec
  products?: TemplateProduct[]
  mode?: Mode
  onSave?: SaveFn
}) {
  if (printSpec) {
    setPrintSpec(printSpec)
    setEditorSpec(printSpec)
    console.log('CardEditor received spec', printSpec)
  } else {
    console.warn('CardEditor missing printSpec')
  }
  if (previewSpec) {
    setPreviewSpec(previewSpec)
  }
  useEffect(() => {
    if (!printSpec || !previewSpec || !products.length) return
    const baseW = printSpec.trimWidthIn + printSpec.bleedIn * 2
    const baseH = printSpec.trimHeightIn + printSpec.bleedIn * 2
    const baseRatio = baseW / baseH
    const ratios = products
      .filter(p => p.showSafeArea)
      .map(p => p.printSpec)
      .filter(Boolean)
      .map(s => (s!.trimWidthIn + s!.bleedIn * 2) / (s!.trimHeightIn + s!.bleedIn * 2))
    if (!ratios.length) return
    const minRatio = Math.min(...ratios)
    let safeW = baseW
    let safeH = baseH
    if (minRatio < baseRatio) {
      safeW = baseH * minRatio
    } else if (minRatio > baseRatio) {
      safeH = baseW / minRatio
    }
    const insetX = (baseW - safeW) / 2 + printSpec.bleedIn + 0.125
    const insetY = (baseH - safeH) / 2 + printSpec.bleedIn + 0.125
    setSafeInset(insetX, insetY)
  }, [printSpec, previewSpec, products])
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

  const [thumbs, setThumbs] = useState<string[]>(['', '', '', ''])

  const updateThumbFromCanvas = (idx: number, fc: fabric.Canvas) => {
    try {
      fc.renderAll()
      console.log('Fabric canvas px', fc.getWidth(), fc.getHeight())
      console.log('Expected page px', pageW(), pageH())
      console.log('Export multiplier', EXPORT_MULT())
      const url = fc.toDataURL({
        format: 'jpeg',
        quality: 0.8,
        multiplier: EXPORT_MULT(),
      })
      setThumbs(prev => {
        const next = [...prev]
        next[idx] = url
        return next
      })
    } catch (err) {
      console.error('thumb failed', err)
    }
  }

  const updateThumb = (idx: number) => {
    const fc = canvasMap[idx]
    if (fc) updateThumbFromCanvas(idx, fc)
  }

  useLayoutEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pageIdx: number; canvas: fabric.Canvas }>).detail
      if (detail.canvas) updateThumbFromCanvas(detail.pageIdx, detail.canvas)
    }
    document.addEventListener('card-canvas-rendered', handler)
    return () => document.removeEventListener('card-canvas-rendered', handler)
  }, [])

  useEffect(() => {
    canvasMap.forEach((fc, idx) => {
      if (fc && !thumbs[idx]) updateThumbFromCanvas(idx, fc)
    })
  }, [canvasMap])

  useEffect(() => {
    updateThumb(activeIdx)
  }, [pages, activeIdx])

  const [activeType, setActiveType] = useState<'text' | 'image' | null>(null)
  useEffect(() => {
    const fc = activeFc
    if (!fc) return
    const update = () => {
      const obj = fc.getActiveObject() as any
      const t = obj ? obj.type : null
      setActiveType(t === 'textbox' ? 'text' : t === 'image' ? 'image' : null)
    }
    update()
    fc.on('selection:created', update)
      .on('selection:updated', update)
      .on('selection:cleared', update)
    return () => {
      fc.off('selection:created', update)
        .off('selection:updated', update)
        .off('selection:cleared', update)
    }
  }, [activeFc])

  /* track cropping state per page */
  const [cropping, setCropping] =
    useState<[boolean, boolean, boolean, boolean]>([false, false, false, false])
  const handleCroppingChange = (idx: number, state: boolean) => {
    setCropping(prev => {
      const next = [...prev] as typeof prev
      next[idx] = state
      return next
    })
    if (idx === activeIdx) setCropMode(state)
  }

  const isCropMode   = useEditor(s => s.isCropMode)
  const setCropMode  = useEditor(s => s.setCropMode)

  /* 5 ─ save ------------------------------------------------------ */
  const [saving, setSaving] = useState(false)
  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try {
    canvasMap.forEach(fc => {
      const tool = (fc as any)?._cropTool as CropTool | undefined
      if (tool?.isActive) tool.commit()
    })
    canvasMap.forEach(fc => {
      const sync = (fc as any)?._syncLayers as (() => void) | undefined
      if (sync) sync()
    })
    const finalPages = useEditor.getState().pages
      let coverImageId: string | undefined
      const fc = canvasMap[0]
      if (fc) {
        try {
          console.log('Fabric canvas px', fc.getWidth(), fc.getHeight())
          console.log('Expected page px', pageW(), pageH())
          console.log('Export multiplier', EXPORT_MULT())
          const dataUrl = fc.toDataURL({
            format: 'jpeg',
            quality: 0.8,
            multiplier: EXPORT_MULT(),
          })
          const res = await fetch(dataUrl)
          const blob = await res.blob()
          const form = new FormData()
          form.append('file', new File([blob], 'cover.jpg', { type: blob.type }))
          const up = await fetch('/api/upload', { method: 'POST', body: form })
          if (up.ok) {
            const json = await up.json()
            coverImageId = json.assetId
          }
        } catch (err) {
          console.error('cover upload failed', err)
        }
      }
      await onSave(finalPages, coverImageId)
    }
    finally { setSaving(false) }
  }

/* 6 ─ selfie drawer ------------------------------------------------- */
const [drawerOpen, setDrawerOpen]           = useState(false)
const [aiPlaceholderId, setAiPlaceholderId] = useState<string | null>(null)

/* preview modal state */
const [previewOpen, setPreviewOpen] = useState(false)
const [previewImgs, setPreviewImgs] = useState<string[]>([])

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

// start-crop → begin crop tool and enter crop mode
useEffect(() => {
  const handler = () => {
    const fc = canvasMap[activeIdx]
    if (!fc) return
    const obj = fc.getActiveObject() as any
    if (!obj || obj.type !== 'image') return
    const tool = (fc as any)._cropTool as CropTool | undefined
    if (tool && !tool.isActive) {
      tool.begin(obj)
      setCropping(prev => { const n = [...prev] as typeof prev; n[activeIdx] = true; return n })
      setCropMode(true)
    }
  }
  document.addEventListener('start-crop', handler)
  return () => document.removeEventListener('start-crop', handler)
}, [canvasMap, activeIdx])

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

const exitCrop = (commit: boolean) => {
  const fc = canvasMap[activeIdx]
  const tool = (fc as any)?._cropTool as CropTool | undefined
  if (tool?.isActive) {
    commit ? tool.commit() : tool.cancel()
  }
  setCropping(prev => { const n = [...prev] as typeof prev; n[activeIdx] = false; return n })
  setCropMode(false)
}

const setCropRatio = (r: number | null) => {
  const fc = canvasMap[activeIdx]
  if (!fc) return
  const tool = (fc as any)?._cropTool as CropTool | undefined
  const frame = tool ? (tool as any).frame as fabric.Group | null : null
  const img = tool ? (tool as any).img as fabric.Image | null : null
  if (!tool || !tool.isActive || !frame) return
  if (r === null || Number.isNaN(r)) {
    frame.lockUniScaling = false
    fc.requestRenderAll()
    return
  }
  frame.lockUniScaling = true
  let w = frame.width! * frame.scaleX!
  let h = frame.height! * frame.scaleY!
  const cX = frame.left! + w / 2
  const cY = frame.top! + h / 2
  const cur = w / h
  if (Math.abs(cur - r) > 0.01) {
    if (cur > r) w = h * r
    else h = w / r
  }
  frame.set({ width: w, height: h, scaleX: 1, scaleY: 1, left: cX - w / 2, top: cY - h / 2 })
  ;(tool as any).clampFrame?.()
  tool['clamp']?.(true)
  fc.requestRenderAll()
}

/* generate images and show preview */
const handlePreview = () => {
  const imgs: string[] = []
  canvasMap.forEach((fc, i) => {
    if (!fc) return
    const tool = (fc as any)._cropTool as CropTool | undefined
    if (tool?.isActive) tool.commit()
    fc.renderAll()
    console.log('Fabric canvas px', fc.getWidth(), fc.getHeight())
    console.log('Expected page px', pageW(), pageH())
    console.log('Export multiplier', EXPORT_MULT())
    imgs[i] = fc.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: EXPORT_MULT(),
    })
  })
  setPreviewImgs(imgs)
  setPreviewOpen(true)
}

/* helper – gather pages and rendered images once */
const collectProofData = () => {
  canvasMap.forEach(fc => {
    const tool = (fc as any)?._cropTool as CropTool | undefined
    if (tool?.isActive) tool.commit()
  })
  canvasMap.forEach(fc => {
    const sync = (fc as any)?._syncLayers as (() => void) | undefined
    if (sync) sync()
  })

  const pages = useEditor.getState().pages
  const pageImages: string[] = []
  canvasMap.forEach(fc => {
    if (!fc) { pageImages.push(''); return }
    const guides = fc.getObjects().filter(o => (o as any)._guide)
    guides.forEach(g => g.set('visible', false))
    fc.renderAll()
    pageImages.push(
      fc.toDataURL({ format: 'png', quality: 1, multiplier: EXPORT_MULT() })
    )
    guides.forEach(g => g.set('visible', true))
  })
  return { pages, pageImages }
}

/* fetch proof blob for one product */
const fetchProofBlob = async (
  sku: string,
  filename: string,
  pages: any[],
  pageImages: string[],
) => {
  try {
    const res = await fetch('/api/proof', {
      method : 'POST',
      headers: { 'content-type': 'application/json' },
      body   : JSON.stringify({ pages, pageImages, sku, id: templateId, filename }),
    })
    if (res.ok) {
      return await res.blob()
    }
  } catch (err) {
    console.error('proof', err)
  }
  return null
}

/* download proofs for all products */
const handleProofAll = async () => {
  if (!products.length) return
  const { pages, pageImages } = collectProofData()
  const JSZip = (
    await import(
      /* webpackIgnore: true */
      'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm'
    )
  ).default
  const zip = new JSZip()
  for (const p of products) {
    const name = `${p.slug}.jpg`
    const blob = await fetchProofBlob(p.slug, name, pages, pageImages)
    if (blob) zip.file(name, blob)
  }
  const out = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(out)
  const a = document.createElement('a')
  a.href = url
  a.download = 'proofs.zip'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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

  const boxWidth = previewW()
  const box = `flex-shrink-0`

  /* ---------------- UI ------------------------------------------ */
  return (
    <div
      className="flex flex-col h-screen box-border"
      style={{ paddingTop: "calc(var(--walty-header-h) + var(--walty-toolbar-h))" }}
    >
      <WaltyEditorHeader                     /* ② mount new component */
        onPreview={handlePreview}
        onAddToBasket={() => console.log("basket")}
        height={72}                          /* match the design */
      />

      {!isCropMode && (
        <EditorCommands
          onUndo={undo}
          onRedo={redo}
          onSave={handleSave}
          onProof={mode === 'staff' ? handleProof : undefined}
          saving={saving}
          mode={mode}
        />
      )}
      
      <div className="flex flex-1 relative bg-[--walty-cream] lg:max-w-6xl mx-auto">
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
        <CropDrawer
          open={isCropMode}
          onCancel={() => exitCrop(false)}
          onApply={() => exitCrop(true)}
          onRatio={setCropRatio}
        />


        {/* sidebar */}
        {!isCropMode && <LayerPanel />}

        {/* main */}
        <div className="flex flex-col flex-1 min-h-0 mx-auto max-w-[868px]">
          {!isCropMode && (activeType === 'text' ? (
            <TextToolbar
              canvas={activeFc}
              addText={addText}
              addImage={addImage}
              mode={mode}
              saving={saving}
            />
          ) : activeType === 'image' ? (
            <ImageToolbar
              canvas={activeFc}
              saving={saving}
            />
          ) : (
            <div
              className="sticky inset-x-0 z-30 flex justify-center pointer-events-none select-none"
              style={{
                top: 'var(--walty-header-h)',
                marginTop: 'calc(var(--walty-toolbar-h) * -1)',
                height: 'var(--walty-toolbar-h)',
              }}
            />
          ))}

                    {/* canvases */}
          <div className="flex-1 flex justify-center items-start overflow-auto bg-[--walty-cream] pt-6 gap-6">
            {/* front */}
            <div className={section === 'front' ? box : 'hidden'} style={{ width: boxWidth }}>
              <FabricCanvas
                pageIdx={0}
                page={pages[0]}
                onReady={fc => onReady(0, fc)}
                isCropping={cropping[0]}
                onCroppingChange={state => handleCroppingChange(0, state)}
                mode={mode}
              />
            </div>
            {/* inside */}
            <div className={section === 'inside' ? 'flex gap-6' : 'hidden'}>
              <div className={box} style={{ width: boxWidth }}>
                <FabricCanvas
                  pageIdx={1}
                  page={pages[1]}
                  onReady={fc => onReady(1, fc)}
                  isCropping={cropping[1]}
                  onCroppingChange={state => handleCroppingChange(1, state)}
                  mode={mode}
                />
              </div>
              <div className={box} style={{ width: boxWidth }}>
                <FabricCanvas
                  pageIdx={2}
                  page={pages[2]}
                  onReady={fc => onReady(2, fc)}
                  isCropping={cropping[2]}
                  onCroppingChange={state => handleCroppingChange(2, state)}
                  mode={mode}
                />
              </div>
            </div>
            {/* back */}
            <div className={section === 'back' ? box : 'hidden'} style={{ width: boxWidth }}>
              <FabricCanvas
                pageIdx={3}
                page={pages[3]}
                onReady={fc => onReady(3, fc)}
                isCropping={cropping[3]}
                onCroppingChange={state => handleCroppingChange(3, state)}
                mode={mode}
              />
            </div>
          </div>

          {/* thumbnails */}
          <div className="thumbnail-bar sticky bottom-0 z-20 flex justify-center gap-2 px-3 py-2 bg-[--walty-cream] text-xs">
            {(['FRONT', 'INNER-L', 'INNER-R', 'BACK'] as const).map((lbl, i) => (
              <button
                key={lbl}
                className={`thumb ${
                  (section === 'front' && i === 0) ||
                  (section === 'inside' && (i === 1 || i === 2)) ||
                  (section === 'back' && i === 3)
                    ? 'thumb-active'
                    : ''
                }`}
                onClick={() =>
                  setSection(i === 0 ? 'front' : i === 3 ? 'back' : 'inside')
                }
              >
                {thumbs[i] ? (
                  <img
                    src={thumbs[i]}
                    alt={lbl}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  lbl
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <PreviewModal
        open={previewOpen}
        images={previewImgs}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  )
}
