/**********************************************************************
 * FabricCanvas.tsx — renders one printable page with Fabric.js
 * ---------------------------------------------------------------
 * 2025‑05‑10 • Final polish
 *   – Ghost outline always visible (no hover fade logic)
 *   – Cleaned up listeners & comments
 *   – Retains Coach‑mark anchor via data‑ai‑placeholder
 *********************************************************************/
'use client'

import { useEffect, useRef } from 'react'
import { fabric }            from 'fabric'
import { useEditor }         from './EditorStore'
import { fromSanity }        from '@/app/library/layerAdapters'
import '@/lib/fabricDefaults'
import { SEL_COLOR } from '@/lib/fabricDefaults';
import { CropTool } from '@/lib/CropTool'

/* ---------- size helpers ---------------------------------------- */
const DPI       = 300
const mm        = (n: number) => (n / 25.4) * DPI
const TRIM_W_MM = 150
const TRIM_H_MM = 214
const BLEED_MM  = 3
const PAGE_W    = Math.round(mm(TRIM_W_MM + BLEED_MM * 2))
const PAGE_H    = Math.round(mm(TRIM_H_MM + BLEED_MM * 2))
const PREVIEW_W = 420
const PREVIEW_H = Math.round(PAGE_H * PREVIEW_W / PAGE_W)
const SCALE     = PREVIEW_W / PAGE_W

// 4 CSS-px padding used by the hover outline
const PAD  = 4 / SCALE;

/** turn  gap (px) → a dashed-array scaled to canvas units */
const dash = (gap: number) => [gap / SCALE, (gap - 2) / SCALE];





/* ------------------------------------------------------------------ *
 *  Fabric-layer types  •  2025-06-11
 *    –  NEW  ImageSrc helper alias (string | SanityImageRef | null)
 *    –  src is now   src?: ImageSrc        (allows the temporary null)
 *    –  tighter docs + small alphabetic re-order for readability
 * ------------------------------------------------------------------ */

/** What a Sanity-stored image reference looks like once the asset
 *  has been uploaded or when the document is fetched back from Studio.
 */
export interface SanityImageRef {
  _type : 'image'
  asset : { _type: 'reference'; _ref: string }
}

/** Anything the canvas can draw as an image _right now_ */
export type ImageSrc = string | SanityImageRef | null

/** A single canvas layer (image | text) */
export interface Layer {
  /* ---- layer kind ------------------------------------------------ */
  type: 'image' | 'text'

  /* ---- IMAGE specific ------------------------------------------- */
  /**  
   * `string`   → direct CDN / blob URL  
   * `object`   → Sanity asset reference (after upload / fetch)  
   * `null`     → “nothing yet” placeholder while the upload is in-flight  
   */
  src?: ImageSrc

  /**  
   * Always-safe CDN URL.  Added as soon as the upload succeeds so the
   * editor never has to “wait” for Sanity to resolve the reference.
   */
  srcUrl?:  string

  /** `image-…` ID returned by `/api/upload` */
  assetId?: string

  /** optional cropping rectangle (in image pixels) */
  cropX?: number
  cropY?: number
  cropW?: number
  cropH?: number

  /* ---- SHARED geometry / style ---------------------------------- */
  x: number
  y: number
  width:  number
  height?: number

  opacity?:   number
  scaleX?:    number
  scaleY?:    number
  selectable?:boolean
  editable?:  boolean
  locked?:    boolean

  /* ---- TEXT specific -------------------------------------------- */
  text?:        string
  fill?:        string
  fontSize?:    number
  fontFamily?:  string
  fontStyle?:   '' | 'normal' | 'italic' | 'oblique'
  fontWeight?:  string | number
  underline?:   boolean
  textAlign?:   'left' | 'center' | 'right'
  lineHeight?:  number

  /* ---- AI placeholder bookkeeping ------------------------------- */
  _isAI?: boolean

  /** Allow future ad-hoc properties without TypeScript complaints */
  [k: string]: any
}

/** A single page inside the greeting-card template */
export interface TemplatePage {
  name:   string
  layers: Layer[]
}
/* ----------another helper --------------------------------------------- */
const discardSelection = (fc: fabric.Canvas) => {
  fc.discardActiveObject();   // removes the wrapper
  fc.requestRenderAll();
};

/* ---------- helpers --------------------------------------------- */
export const getActiveTextbox = (fc: fabric.Canvas | null) =>
  fc && (fc.getActiveObject() as any)?.type === 'textbox'
    ? (fc.getActiveObject() as fabric.Textbox)
    : null

const hex = (c = '#000') => c.length === 4
  ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`
  : c.toLowerCase()

const syncGhost = (
  img   : fabric.Image,
  ghost : HTMLDivElement,
  canvas: HTMLCanvasElement,
) => {
  const canvasRect = canvas.getBoundingClientRect()
  const { left, top, width, height } = img.getBoundingRect()

  ghost.style.left   = `${canvasRect.left + left   * SCALE}px`
  ghost.style.top    = `${canvasRect.top  + top    * SCALE}px`
  ghost.style.width  = `${width  * SCALE}px`
  ghost.style.height = `${height * SCALE}px`
}

const getSrcUrl = (raw: Layer): string | undefined => {
    /* 1 — explicit override from the editor */
    if (raw.srcUrl) return raw.srcUrl
  
    /* 2 — plain string already means “loadable url / blob” */
    if (typeof raw.src === 'string') return raw.src
  
    /* 3 — Sanity image reference → build the CDN url */
    if (raw.src && raw.src.asset?._ref) {
      const id = raw.src.asset._ref             // image-xyz-2000x2000-png
        .replace('image-', '')                  // xyz-2000x2000-png
        .replace(/\-(png|jpg|jpeg|webp)$/, '')  // xyz-2000x2000
      return `https://cdn.sanity.io/images/${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}/production/${id}.png`
    }
  
    /* nothing usable yet */
    return undefined
  }                   // can’t resolve yet

/* ── 1 ▸ TWO NEW TINY HELPERS ─────────────────────────────────── */

/** Convert a Fabric object → our Layer shape */
const objToLayer = (o: fabric.Object): Layer => {
  if ((o as any).type === 'textbox') {
    const t = o as fabric.Textbox
    return {
      type      : 'text',
      text      : t.text || '',
      x         : t.left || 0,
      y         : t.top  || 0,
      width     : t.width || 200,
      fontSize  : t.fontSize,
      fontFamily: t.fontFamily,
      fontWeight: t.fontWeight,
      fontStyle : t.fontStyle,
      underline : t.underline,
      fill      : t.fill as string,
      textAlign : t.textAlign as any,
      lineHeight: t.lineHeight,
      opacity   : t.opacity,
      scaleX    : t.scaleX,
      scaleY    : t.scaleY,
    }
  }
  const i = o as fabric.Image
  const srcUrl  = (i as any).__src || i.getSrc?.() || ''
  const assetId = (i as any).assetId as string | undefined

  const layer: Layer = {
    type   : 'image',
    src    : assetId
               ? { _type:'image', asset:{ _type:'reference', _ref: assetId } }
               : srcUrl,
    srcUrl ,
    assetId,
    x      : i.left  || 0,
    y      : i.top   || 0,
    width  : i.getScaledWidth(),
    height : i.getScaledHeight(),
    opacity: i.opacity,
    scaleX : i.scaleX,
    scaleY : i.scaleY,
  }

  if (i.cropX != null) layer.cropX = i.cropX
  if (i.cropY != null) layer.cropY = i.cropY
  if (i.width  != null) layer.cropW = i.width
  if (i.height != null) layer.cropH = i.height

  return layer
}

/** Read every on-canvas object → Layers, update Zustand + history */
const syncLayersFromCanvas = (fc: fabric.Canvas, pageIdx: number) => {
  const objs = fc
    .getObjects()
    .filter(o =>
      !(o as any)._guide &&
      !(o as any)._backdrop &&
      !(o as any).excludeFromExport &&
      (o as any).type !== 'activeSelection'      // skip wrapper
    )
    .reverse();                                  // bottom → top

  /* remember original src on pasted images */
  objs.forEach(o => {
    if ((o as any).type === 'image' && !(o as any).__src) {
      (o as any).__src = (o as any).getSrc?.() || (o as any).src;
    }
  });

  /* give every object an up-to-date index */
  objs.forEach((o, i) => ((o as any).layerIdx = i));

  /* stash in Zustand + history */
  const layers = objs.map(objToLayer);
  const store  = useEditor.getState();
  store.setPageLayers(pageIdx, layers);
  store.pushHistory();
};

/* ---------- guides ---------------------------------------------- */
const addGuides = (fc: fabric.Canvas) => {
  fc.getObjects().filter(o => (o as any)._guide).forEach(o => fc.remove(o))
  const inset = mm(8 + BLEED_MM)
  const strokeW = mm(0.5)
  const dash = [mm(3)]
  const mk = (xy: [number, number, number, number]) =>
    Object.assign(new fabric.Line(xy, {
      stroke: '#34d399', strokeWidth: strokeW, strokeDashArray: dash,
      selectable: false, evented: false, excludeFromExport: true,
    }), { _guide: true })
  ;[
    mk([inset, inset, PAGE_W - inset, inset]),
    mk([PAGE_W - inset, inset, PAGE_W - inset, PAGE_H - inset]),
    mk([PAGE_W - inset, PAGE_H - inset, inset, PAGE_H - inset]),
    mk([inset, PAGE_H - inset, inset, inset]),
  ].forEach(l => fc.add(l))
}

/* ---------- white backdrop -------------------------------------- */
const addBackdrop = (fc: fabric.Canvas) => {
  // only add it once
  if (fc.getObjects().some(o => (o as any)._backdrop)) return

  const bg = new fabric.Rect({
    left   : 0,
    top    : 0,
    width  : PAGE_W,
    height : PAGE_H,
    fill   : '#ffffff',         // ← solid white
    selectable       : false,
    evented          : false,
    excludeFromExport: true,
  })
  ;(bg as any)._backdrop = true   // flag so we don’t add twice

  bg.sendToBack()
  fc.add(bg)
}

/* ---------- component ------------------------------------------- */
interface Props {
  pageIdx    : number
  page?      : TemplatePage
  onReady    : (fc: fabric.Canvas | null) => void
  isCropping?: boolean
  onCroppingChange?: (state: boolean) => void
}

export default function FabricCanvas ({ pageIdx, page, onReady, isCropping = false, onCroppingChange }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const fcRef        = useRef<fabric.Canvas | null>(null)
  const maskRectsRef = useRef<fabric.Rect[]>([]);
  const hoverRef     = useRef<fabric.Rect | null>(null)
  const hydrating    = useRef(false)
  const isEditing    = useRef(false)

  const cropToolRef = useRef<CropTool | null>(null)
  const croppingRef = useRef(false)



  const setPageLayers = useEditor(s => s.setPageLayers)
  const updateLayer   = useEditor(s => s.updateLayer)

/* ---------- mount once --------------------------------------- */
useEffect(() => {
  if (!canvasRef.current) return

  // Create Fabric using the <canvas> element’s own dimensions (420 × ??)
  // – we’ll work in full‑size page units and simply scale the viewport.
  const fc = new fabric.Canvas(canvasRef.current!, {
    backgroundColor       : '#fff',
    preserveObjectStacking: true,
  });
  /* --- keep Fabric’s wrapper the same size as the visible preview --- */
  const container = canvasRef.current!.parentElement as HTMLElement | null;
  if (container) {
    container.style.width  = `${PREVIEW_W}px`;
    container.style.height = `${PREVIEW_H}px`;
    container.style.maxWidth  = `${PREVIEW_W}px`;
    container.style.maxHeight = `${PREVIEW_H}px`;
  }
  addBackdrop(fc);
  // keep the preview scaled to 420 px wide
  fc.setViewportTransform([SCALE, 0, 0, SCALE, 0, 0]);

  /* keep event coordinates aligned with any scroll/resize */
  const updateOffset = () => fc.calcOffset();
  updateOffset();
  window.addEventListener('scroll', updateOffset, { passive: true });
  window.addEventListener('resize', updateOffset);

  /* ── Crop‑tool wiring ────────────────────────────────────── */
  // create a reusable crop helper and keep it in a ref
  const crop = new CropTool(fc, SCALE, SEL_COLOR);
  cropToolRef.current = crop;
  (fc as any)._cropTool = crop;
  (fc as any)._syncLayers = () => syncLayersFromCanvas(fc, pageIdx);

  // double‑click on an <image> starts cropping
  const dblHandler = (e: fabric.IEvent) => {
    const tgt = e.target as fabric.Object | undefined;
    if (tgt && (tgt as any).type === 'image') {
      cropToolRef.current?.begin(tgt as fabric.Image);
    }
  };
  fc.on('mouse:dblclick', dblHandler);

  // ESC cancels, ENTER commits
  const keyCropHandler = (ev: KeyboardEvent) => {
    if (!cropToolRef.current?.isActive) return;
    if (ev.key === 'Escape') cropToolRef.current.cancel();
    if (ev.key === 'Enter')  cropToolRef.current.commit();
  };
  window.addEventListener('keydown', keyCropHandler);
  /* ───────────────────────────────────────────────────────── */

 

/* ── 2 ▸ Hover overlay only ─────────────────────────────── */
const hoverHL = new fabric.Rect({
  originX:'left', originY:'top', strokeUniform:true,
  fill:'transparent',
  stroke:SEL_COLOR,
  strokeWidth:1 / SCALE,
  strokeDashArray:[],
  selectable:false, evented:false, visible:false,
  excludeFromExport:true,
})
fc.add(hoverHL)
hoverRef.current = hoverHL

/* ── 3 ▸ Selection lifecycle (no extra overlay) ─────────── */
let scrollHandler: (() => void) | null = null

fc.on('selection:created', () => {
  hoverHL.visible = false            // hide leftover hover rectangle
  fc.requestRenderAll()
  scrollHandler = () => fc.requestRenderAll()
  window.addEventListener('scroll', scrollHandler, { passive:true })
})
.on('selection:cleared', () => {
  if (scrollHandler) { window.removeEventListener('scroll', scrollHandler); scrollHandler = null }
})

/* also hide hover during any transform of the active object */
fc.on('object:moving',   () => { hoverHL.visible = false })
  .on('object:scaling',  () => { hoverHL.visible = false })
  .on('object:rotating', () => { hoverHL.visible = false })

/* ── 4 ▸ Hover outline (only when NOT the active object) ─── */
fc.on('mouse:over', e => {
  const t = e.target as fabric.Object | undefined
  if (!t || (t as any)._guide || t === hoverHL) return
  if (fc.getActiveObject() === t) return           // skip active selection

  const box = t.getBoundingRect(true, true)
  hoverHL.set({
    width : box.width  + PAD * 2,
    height: box.height + PAD * 2,
    left  : box.left  - PAD,
    top   : box.top   - PAD,
    visible: true,
  })
  hoverHL.setCoords()
  hoverHL.bringToFront()
  fc.requestRenderAll()
})
.on('mouse:out', () => {
  hoverHL.visible = false
  fc.requestRenderAll()
})

addGuides(fc)                                 // green safe-zone guides
  /* ── 4.5 ▸ Fabric ➜ Zustand sync ──────────────────────────── */
  fc.on('object:modified', e=>{
    isEditing.current = true
    const t = e.target as any
    if (t?.layerIdx === undefined) return

    const d: Partial<Layer> = {
      x      : t.left,
      y      : t.top,
      scaleX : t.scaleX,
      scaleY : t.scaleY,
    }
    if (t.type === 'image') Object.assign(d, {
      width  : t.getScaledWidth(),
      height : t.getScaledHeight(),
      opacity: t.opacity,
      ...(t.cropX != null && { cropX: t.cropX }),
      ...(t.cropY != null && { cropY: t.cropY }),
      ...(t.width  != null && { cropW: t.width  }),
      ...(t.height != null && { cropH: t.height }),
    })
    if (t.type === 'textbox') Object.assign(d, {
      text       : t.text,
      fontSize   : t.fontSize,
      fontFamily : t.fontFamily,
      fontWeight : t.fontWeight,
      fontStyle  : t.fontStyle,
      underline  : t.underline,
      fill       : t.fill,
      textAlign  : t.textAlign,
      lineHeight : t.lineHeight,
      opacity    : t.opacity,
    })
    updateLayer(pageIdx, t.layerIdx, d)
    setTimeout(()=>{ isEditing.current = false })
  })

  fc.on('text:changed', e=>{
    const t = e.target as any
    if (t?.layerIdx === undefined) return
    isEditing.current = true
    updateLayer(pageIdx, t.layerIdx, {
      text       : t.text,
      fontSize   : t.fontSize,
      fontFamily : t.fontFamily,
      fontWeight : t.fontWeight,
      fontStyle  : t.fontStyle,
      underline  : t.underline,
      fill       : t.fill,
      textAlign  : t.textAlign,
      lineHeight : t.lineHeight,
      opacity    : t.opacity,
      width      : t.getScaledWidth(),
      height     : t.getScaledHeight(),
    })
    setTimeout(()=>{ isEditing.current = false })
  })

/* ───────────────── clipboard & keyboard shortcuts ────────────────── */

/** Raw serialised objects we keep on the “clipboard” */
type Clip = { json: any[]; nudge: number }
const clip: Clip = { json: [], nudge: 0 }

/** Small helper – return the wrapper itself (if any) and its children */
const allObjs = (o: fabric.Object) =>
  (o as any).type === 'activeSelection'
    ? [(o as any), ...(o as any)._objects as fabric.Object[]]
    : [o]

/** Extra props we must keep when serialising */
const PROPS = [
  'src', 'srcUrl', 'assetId', '__src',               // images
  'text', 'fontSize', 'fontFamily', 'fill',          // text
  'fontWeight', 'fontStyle', 'underline',
  'textAlign', 'lineHeight', 'opacity',
  'scaleX', 'scaleY', 'width', 'height',
  'locked', 'selectable', 'left', 'top',
]

const onKey = (e: KeyboardEvent) => {
  const active = fc.getActiveObject() as fabric.Object | undefined
  const cmd    = e.metaKey || e.ctrlKey

  /* —— COPY ————————————————————————————————————— */
  if (cmd && e.code === 'KeyC' && active) {
    clip.json  = [(active).toJSON(PROPS)]            // keep the wrapper!
    clip.nudge = 0
    e.preventDefault()
    return
  }

  /* —— CUT —————————————————————————————————————— */
  if (cmd && e.code === 'KeyX' && active) {
    clip.json  = [(active).toJSON(PROPS)]
    clip.nudge = 0

    /* remove wrapper + every child */
    allObjs(active).forEach(o => fc.remove(o))
    syncLayersFromCanvas(fc, pageIdx)
    e.preventDefault()
    return
  }

  /* —— PASTE ———————————————————————————————————— */
  if (cmd && e.code === 'KeyV' && clip.json.length) {
    clip.nudge += 10                                   // cascade each paste

    fabric.util.enlivenObjects(clip.json, (objs: fabric.Object[]) => {
      const root = objs[0]                             // our wrapper/group

      /* offset once (wrapper carries the children) */
      root.set({
        left: (root.left ?? 0) + clip.nudge,
        top : (root.top  ?? 0) + clip.nudge,
      })
      root.setCoords()

      /* Fabric gives us a Group – break it straight into an ActiveSelection */
      if ((root as any).type === 'group') {
        const g = root as fabric.Group
        const kids = g._objects as fabric.Object[]
        kids.forEach(o => fc.add(o))
        fc.remove(g)                                   // drop the temp group

        const sel = new fabric.ActiveSelection(kids, { canvas: fc } as any)
        fc.setActiveObject(sel)
      } else {
        fc.add(root)
        fc.setActiveObject(root)
      }

      fc.requestRenderAll()
      syncLayersFromCanvas(fc, pageIdx)
    }, '')                                             // namespace = ''
    e.preventDefault()
    return
  }

  /* —— DELETE ——————————————————————————————————— */
  if (!cmd && (e.code === 'Delete' || e.code === 'Backspace') && active) {
    allObjs(active).forEach(o => fc.remove(o))
    syncLayersFromCanvas(fc, pageIdx)
    e.preventDefault()
    return
  }

  /* —— ARROW-NUDGE ————————————————————————————— */
  if (!cmd && e.code.startsWith('Arrow') && active) {
    const step = e.shiftKey ? 10 : 1
    const dx   = e.code === 'ArrowLeft'  ? -step
               : e.code === 'ArrowRight' ?  step : 0
    const dy   = e.code === 'ArrowUp'    ? -step
               : e.code === 'ArrowDown'  ?  step : 0

    allObjs(active).forEach(o => {
      const nx = (o as any).lockMovementX ? 0 : dx
      const ny = (o as any).lockMovementY ? 0 : dy
      if (nx || ny) {
        o.set({ left: (o.left ?? 0) + nx,
                top : (o.top  ?? 0) + ny })
        o.setCoords()
      }
    })

    fc.requestRenderAll()
    const editRef = (fc as any)._editingRef as { current: boolean } | undefined
    if (editRef) editRef.current = true
    syncLayersFromCanvas(fc, pageIdx)
    setTimeout(() => { if (editRef) editRef.current = false }, 0)
    e.preventDefault()
  }
}

/* avoid duplicates during hot-reload */
window.removeEventListener('keydown', onKey)
window.addEventListener('keydown', onKey)

  /* ── 6 ▸ Expose canvas & tidy up ──────────────────────────── */
  // expose editing ref so external controls can pause re-hydration
  ;(fc as any)._editingRef = isEditing
  fcRef.current = fc; onReady(fc)

    return () => {
      window.removeEventListener('keydown', onKey)
      if (scrollHandler) window.removeEventListener('scroll', scrollHandler)
      window.removeEventListener('scroll', updateOffset)
      window.removeEventListener('resize', updateOffset)
      // tidy up crop‑tool listeners
      fc.off('mouse:dblclick', dblHandler);
      window.removeEventListener('keydown', keyCropHandler);
      onReady(null)
      cropToolRef.current?.abort()
      fc.dispose()
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
/* ---------- END mount once ----------------------------------- */

  /* ---------- crop mode toggle ------------------------------ */
  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return

    if (isCropping && !croppingRef.current) {
      const act = fc.getActiveObject() as fabric.Object | undefined
      if (act && (act as any).type === 'image') {
        document.dispatchEvent(new Event('start-crop'))
      }
    }
  }, [isCropping])



  /* ---------- redraw on page change ----------------------------- */
  useEffect(() => {
    const fc = fcRef.current
    if (!fc || !page) return
    if (isEditing.current || (fc as any)._editingRef?.current) return

    cropToolRef.current?.abort()
    hydrating.current = true
    fc.clear();
    fc.setBackgroundColor('#fff', fc.renderAll.bind(fc));
    hoverRef.current && fc.add(hoverRef.current)

    /* bottom ➜ top keeps original z-order */
    for (let idx = page.layers.length - 1; idx >= 0; idx--) {
      const raw = page.layers[idx]
      const ly: Layer | null = (raw as any).type ? raw as Layer : fromSanity(raw)
      if (!ly) continue

/* ---------- IMAGES --------------------------------------------- */
if (ly.type === 'image' && (ly.src || ly.srcUrl)) {
  // ① make sure we have a usable URL
  const srcUrl = getSrcUrl(ly);
  if (!srcUrl) continue;                 // nothing we can render yet

  // ② CORS flag only for http/https URLs
  const opts = srcUrl.startsWith('http') ? { crossOrigin: 'anonymous' } : undefined;

  fabric.Image.fromURL(srcUrl, rawImg => {
    const img = rawImg instanceof fabric.Image ? rawImg : new fabric.Image(rawImg);

    // keep original asset info so objToLayer can round-trip it
    (img as any).__src   = srcUrl
    if (ly.assetId) (img as any).assetId = ly.assetId
    if (ly.srcUrl) (img as any).srcUrl = ly.srcUrl

          /* cropping */
          if (ly.cropX != null) img.cropX = ly.cropX
          if (ly.cropY != null) img.cropY = ly.cropY
          if (ly.cropW != null) img.width = ly.cropW
          if (ly.cropH != null) img.height = ly.cropH

          /* scale */
          if (ly.scaleX == null || ly.scaleY == null) {
            const s = Math.min(1, PAGE_W / img.width!, PAGE_H / img.height!)
            img.scale(s)
          } else {
            img.set({ scaleX: ly.scaleX, scaleY: ly.scaleY })
          }

          /* shared props */
          img.set({
            left: ly.x, top: ly.y, originX: 'left', originY: 'top',
            selectable: ly.selectable ?? true,
            evented: ly.editable ?? true,
            opacity: ly.opacity ?? 1,
          })

          /* ---------- AI placeholder extras -------------------------------- */
if (raw._type === 'aiLayer') {
  const spec = raw.source
  const locked = !!ly.locked
  img.set({ selectable: !locked, evented: !locked, hasControls: !locked })

 
            // ─── open the Selfie Drawer on click ─────────────────────────
img.on('mouseup', () => {
  // make sure it’s still an AI placeholder
  if ((img as any)._isAI || ly._isAI) {
    useEditor.getState().setDrawerState('idle');   // <- OPEN drawer
  }
  
});

            let ghost = (img as any)._ghost as HTMLDivElement | undefined
            if (!ghost) {
              ghost = document.createElement('div')
              ghost.className = 'ai-ghost'
              ghost.setAttribute('data-ai-placeholder', '')  // CoachMark anchor
              ghost.style.opacity = '0'          // hidden until hover
              ghost.style.pointerEvents = 'none' // never block canvas clicks


              ghost.innerHTML = `
                <div class="ai-ghost__center">
                  <svg width="44" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2
                             2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>Click to replace face</span>
                </div>`

              ;(img as any)._ghost = ghost
              document.body.appendChild(ghost)

              /* Fade-in on Fabric hover */
              img.on('mouseover', () => { ghost!.style.opacity = '1' })
              img.on('mouseout',  () => { ghost!.style.opacity = '0' })
            }

            const doSync = () => canvasRef.current && ghost && syncGhost(img, ghost, canvasRef.current)
            doSync()
            img.on('moving',   doSync)
               .on('scaling',  doSync)
               .on('rotating', doSync)
               window.addEventListener('scroll', doSync, { passive: true })
               window.addEventListener('resize', doSync)
               

            /* hide overlay when actively selected */
            fc.on('selection:created', e => {
              if (e.target === img) ghost!.style.display = 'none'
            })
            fc.on('selection:cleared', () => { ghost!.style.display = '' })

            /* hide overlay when coach-mark is dismissed */
            document.addEventListener('ai-coach-dismiss', () => {
              ghost!.style.display = 'none'
            })

            img.on('removed', () => {
              window.removeEventListener('scroll', doSync)
              window.removeEventListener('resize', doSync)
              ghost?.remove()
            })
          }

          /* keep z-order */
          ;(img as any).layerIdx = idx
          const pos = fc.getObjects().findIndex(o =>
            (o as any).layerIdx !== undefined && (o as any).layerIdx < idx)
          fc.insertAt(img, pos === -1 ? fc.getObjects().length : pos, false)
          img.setCoords()
          fc.requestRenderAll()
          document.dispatchEvent(
            new CustomEvent('card-canvas-rendered', {
              detail: { pageIdx, canvas: fc },
            })
          )
        }, opts);
        continue
      }

      /* ---------- TEXT ---------------------------------------- */
      if (ly.type === 'text' && ly.text) {
        const tb = new fabric.Textbox(ly.text, {
          left: ly.x, top: ly.y, originX: 'left', originY: 'top',
          width: ly.width ?? 200,
          fontSize: ly.fontSize ?? Math.round(32 / SCALE),
          fontFamily: ly.fontFamily ?? 'Arial',
          fontWeight: ly.fontWeight ?? 'normal',
          fontStyle: ly.fontStyle ?? 'normal',
          underline: !!ly.underline,
          fill: hex(ly.fill ?? '#000'),
          textAlign: ly.textAlign ?? 'left',
          lineHeight: ly.lineHeight ?? 1.16,
          opacity: ly.opacity ?? 1,
          selectable: ly.selectable ?? true,
          editable: ly.editable ?? true,
          scaleX: ly.scaleX ?? 1, scaleY: ly.scaleY ?? 1,
          lockScalingFlip: true,
        })
        ;(tb as any).layerIdx = idx
        fc.add(tb)
      }
    }

    addGuides(fc)
    hoverRef.current?.bringToFront()
    fc.requestRenderAll();
    hydrating.current = false
    document.dispatchEvent(
      new CustomEvent('card-canvas-rendered', {
        detail: { pageIdx, canvas: fc },
      })
    )
  }, [page])

  /* ---------- render ----------------------------------------- */
  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_W}
      height={PREVIEW_H}
      style={{ width: PREVIEW_W, height: PREVIEW_H }}   // lock CSS size
      className="border shadow rounded"
    />
  )
}