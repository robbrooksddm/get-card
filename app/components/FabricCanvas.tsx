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

  const croppingRef   = useRef(false)
  interface CropHandlers {
    imgDown   : (e: fabric.IEvent) => void
    imgUp     : (e: fabric.IEvent) => void
    frameDown : (e: fabric.IEvent) => void
    clamp     : () => void
    clampFrame: () => void
    renderCropControls: () => void
  }
  const cropHandlersRef = useRef<CropHandlers | null>(null)
  const cropGroupRef  = useRef<fabric.Group | null>(null)
  const cropImgRef    = useRef<fabric.Image | null>(null)
  const cropStartRef  = useRef<{
    left:number; top:number; cropX:number; cropY:number;
    cropW:number; cropH:number; scaleX:number; scaleY:number;
    hasControls:boolean; lockScalingX:boolean; lockScalingY:boolean; lockRotation:boolean
  } | null>(null)

  const setPageLayers = useEditor(s => s.setPageLayers)
  const updateLayer   = useEditor(s => s.updateLayer)

/* ---------- mount once --------------------------------------- */
useEffect(() => {
  if (!canvasRef.current) return

/* ── 1 ▸ CROPPING TOOL – Canva-style spotlight ───────────────── */

const fc = new fabric.Canvas(canvasRef.current!, {
  backgroundColor       : '#fff',
  width                 : PAGE_W,
  height                : PAGE_H,
  preserveObjectStacking: true,
});
addBackdrop(fc);

/* keep the preview at 420 px wide */
fc.setViewportTransform([SCALE, 0, 0, SCALE, 0, 0]);
fc.setWidth (PREVIEW_W);
fc.setHeight(PREVIEW_H);

/* ─────────────── MASK helpers (unchanged, just renamed) ──────── */
const updateMaskAround = (frame: fabric.Group) => {
  const fx = frame.left!, fy = frame.top!;
  const fw = frame.width!*frame.scaleX!, fh = frame.height!*frame.scaleY!;

  const S  = maskRectsRef.current;
  const dim = () => new fabric.Rect({
    fill:'rgba(0,0,0,0.45)', selectable:false, evented:false,
    excludeFromExport:true,
    objectCaching:false,
  });
  if (S.length === 0) { S.push(dim(),dim(),dim(),dim()); S.forEach(r=>fc.add(r)); }

  const [L,T,R,B] = S;
  L.set({ left:0,     top:0,        width:fx,            height:PAGE_H });
  R.set({ left:fx+fw, top:0,        width:PAGE_W-fx-fw,  height:PAGE_H });
  T.set({ left:fx,    top:0,        width:fw,            height:fy      });
  B.set({ left:fx,    top:fy+fh,    width:fw,            height:PAGE_H-fy-fh });
  S.forEach(r=>r.setCoords());

  frame.bringToFront();
  fc.requestRenderAll();
};
const clearMask = () => {
  maskRectsRef.current.forEach(r=>fc.remove(r));
  maskRectsRef.current=[];
};

/* ─────────────── CROP helpers ───────────────────────────────── */
interface CropSnap {
  left:number; top:number;
  cropX:number; cropY:number; cropW:number; cropH:number;
  scaleX:number; scaleY:number;
  hasControls:boolean; lockScalingX:boolean; lockScalingY:boolean; lockRotation:boolean;
}

const startCrop = (img: fabric.Image) => {
  if (croppingRef.current) return;
  croppingRef.current = true;
  onCroppingChange?.(true);

  /* ① –– expand to the full bitmap *without* touching its on-screen scale */
  const el     = img.getElement() as HTMLImageElement;
  const natW   = el.naturalWidth  || img.width!;
  const natH   = el.naturalHeight || img.height!;

  const prevCropX = img.cropX ?? 0;
  const prevCropY = img.cropY ?? 0;
  const prevCropW = img.width  ?? natW;
  const prevCropH = img.height ?? natH;

  /* shift the bitmap back so the exact same pixels stay under the frame */
  img.set({
    left  : (img.left ?? 0) - prevCropX * (img.scaleX ?? 1),
    top   : (img.top  ?? 0) - prevCropY * (img.scaleY ?? 1),
    width : natW,
    height: natH,
    /* scale stays unchanged */
    cropX : 0,
    cropY : 0,
  }).setCoords();

  /* snapshot for later maths */
  cropStartRef.current = {
    left  : img.left ?? 0,
    top   : img.top  ?? 0,
    cropX : 0,
    cropY : 0,
    cropW : natW,
    cropH : natH,
    scaleX: img.scaleX ?? 1,
    scaleY: img.scaleY ?? 1,
    hasControls : img.hasControls ?? false,
    lockScalingX: (img as any).lockScalingX ?? false,
    lockScalingY: (img as any).lockScalingY ?? false,
    lockRotation: (img as any).lockRotation ?? false,
  };
  cropImgRef.current = img;

  img.set({
    /* allow the photo itself to scale/move while cropping */
    hasControls : true,
    lockScalingX: false,
    lockScalingY: false,
    lockRotation: true,
    lockScalingFlip: true,
  });

  /* ② –– draw the persistent crop-window *where the old crop was* */
  const frameLeft = (img.left ?? 0) + prevCropX * (img.scaleX ?? 1);
  const frameTop  = (img.top  ?? 0) + prevCropY * (img.scaleY ?? 1);
  const frameW    =  prevCropW * (img.scaleX ?? 1);
  const frameH    =  prevCropH * (img.scaleY ?? 1);
  let fixedLeft   = frameLeft;
  let fixedTop    = frameTop;

  const corner = (x1:number,y1:number,x2:number,y2:number)=>
    new fabric.Line([x1,y1,x2,y2],
      { stroke:'#fff', strokeWidth:2/SCALE, strokeUniform:true,
        selectable:false,evented:false });

  const gridStroke = { stroke:'#ffffff22', strokeWidth:1/SCALE,
                       selectable:false,evented:false };

  const frame = new fabric.Group([
    new fabric.Rect({ left:0, top:0, width:frameW, height:frameH,
                      fill:'rgba(0,0,0,0)', selectable:false,
                      stroke:SEL_COLOR, strokeWidth:1/SCALE, strokeUniform:true }),
    /* four white L-corners */
    corner(0,0, 14/SCALE,0),  corner(0,0, 0,14/SCALE),
    corner(frameW,0, frameW-14/SCALE,0), corner(frameW,0, frameW,14/SCALE),
    corner(0,frameH, 14/SCALE,frameH),   corner(0,frameH, 0,frameH-14/SCALE),
    corner(frameW,frameH, frameW-14/SCALE,frameH),
    corner(frameW,frameH, frameW,frameH-14/SCALE),
    /* thirds-grid (optional aesthetics) */
    new fabric.Line([frameW/3,0, frameW/3,frameH], gridStroke),
    new fabric.Line([frameW*2/3,0, frameW*2/3,frameH], gridStroke),
    new fabric.Line([0,frameH/3, frameW,frameH/3], gridStroke),
    new fabric.Line([0,frameH*2/3, frameW,frameH*2/3], gridStroke),
  ],{
    left:frameLeft, top:frameTop, originX:'left', originY:'top',
    selectable:true, evented:true,
    lockMovementX:false, lockMovementY:false, lockRotation:true,
    lockScalingFlip:true,
    transparentCorners:false, hasBorders:false,
    hasControls:true,
  });
  const blank = () => {};
  frame.controls = {
    tl: new fabric.Control({ x:-0.5, y:-0.5,
      cursorStyleHandler:(fabric as any).controlsUtils.scaleCursorStyleHandler,
      actionHandler:(fabric as any).controlsUtils.scalingEqually,
      render:blank }),
    tr: new fabric.Control({ x:0.5, y:-0.5,
      cursorStyleHandler:(fabric as any).controlsUtils.scaleCursorStyleHandler,
      actionHandler:(fabric as any).controlsUtils.scalingEqually,
      render:blank }),
    bl: new fabric.Control({ x:-0.5, y:0.5,
      cursorStyleHandler:(fabric as any).controlsUtils.scaleCursorStyleHandler,
      actionHandler:(fabric as any).controlsUtils.scalingEqually,
      render:blank }),
    br: new fabric.Control({ x:0.5, y:0.5,
      cursorStyleHandler:(fabric as any).controlsUtils.scaleCursorStyleHandler,
      actionHandler:(fabric as any).controlsUtils.scalingEqually,
      render:blank }),
  } as any;
  frame.cornerSize = 5 / SCALE;  // smaller hit box
  frame.setControlsVisibility({ mt:false, mb:false, ml:false, mr:false, mtr:false });
  (frame as any)._cropGroup = true
  cropGroupRef.current = frame;
  fc.add(frame);

  const renderCropControls = () => {
    if (croppingRef.current && cropGroupRef.current) {
      fc.clearContext((fc as any).contextTop)
      cropGroupRef.current.drawControls((fc as any).contextTop)
      cropImgRef.current?.drawControls((fc as any).contextTop)
    }
  }
  fc.on('after:render', renderCropControls);

  /* clamp the crop frame so it never extends beyond the image */
  const clampFrame = () => {

    const iw = img.getScaledWidth();
    const ih = img.getScaledHeight();
    const minL = img.left!;
    const minT = img.top!;
    const maxR = minL + iw;
    const maxB = minT + ih;

    if (frame.left! < minL) frame.left = minL;
    if (frame.top!  < minT) frame.top  = minT;

    const fw = frame.width! * frame.scaleX!;
    const fh = frame.height! * frame.scaleY!;
    if (frame.left! + fw > maxR)
      frame.scaleX = (maxR - frame.left!) / frame.width!;
    if (frame.top! + fh > maxB)
      frame.scaleY = (maxB - frame.top!) / frame.height!;

    frame.setCoords();
    updateMaskAround(frame);
  };
  frame.on('scaling', () => { clampFrame(); fixedLeft = frame.left!; fixedTop = frame.top!; });

  /* ③ –– keep the bitmap covering the frame at all times */
  const clamp = () => {
    const minSX = frame.width!*frame.scaleX! / natW;
    const minSY = frame.height!*frame.scaleY! / natH;
    if ((img.scaleX ?? 1) < minSX) img.scaleX = minSX;
    if ((img.scaleY ?? 1) < minSY) img.scaleY = minSY;

    const fx=frame.left!, fy=frame.top!;
    const fw=frame.width!*frame.scaleX!, fh=frame.height!*frame.scaleY!;
    const iw=img.getScaledWidth(), ih=img.getScaledHeight();
    img.set({
      left : Math.min(fx, Math.max(fx+fw-iw, img.left!)),
      top  : Math.min(fy, Math.max(fy+fh-ih, img.top!)),
    }).setCoords();

    updateMaskAround(frame);
  };

  img.set({ selectable:true, evented:true })

  /* ④ –– allow direct interaction with either element */
  fc.setActiveObject(frame)
  updateMaskAround(frame)

  let dragData: { x:number; y:number; left:number; top:number } | null = null
  const frameDrag = (e: fabric.IEvent) => {
    if (!dragData) return
    const p = e.absolutePointer!
    img.set({
      left: dragData.left + p.x - dragData.x,
      top : dragData.top  + p.y - dragData.y,
    }).setCoords()
    clamp()
    fc.requestRenderAll()
  }
  const frameUp = () => {
    dragData = null
    frame.lockMovementX = false
    frame.lockMovementY = false
    fc.off('mouse:move', frameDrag)
    fc.off('mouse:up', frameUp)
  }
  const imgDown   = (e?: fabric.IEvent) => {
    fc.setActiveObject(frame)
    dragData = {
      x: e?.absolutePointer!.x ?? 0,
      y: e?.absolutePointer!.y ?? 0,
      left: img.left ?? 0,
      top : img.top  ?? 0,
    }
    fc.on('mouse:move', frameDrag)
    fc.on('mouse:up', frameUp)
  }
  const imgUp     = () => {}
  const frameDown = (e: fabric.IEvent) => {
    const corner = (e as any).transform?.corner
    if (!corner) {
      frame.lockMovementX = true
      frame.lockMovementY = true
      fc.setActiveObject(frame)
      dragData = {
        x: e.absolutePointer!.x,
        y: e.absolutePointer!.y,
        left: img.left ?? 0,
        top : img.top  ?? 0,
      }
      fc.on('mouse:move', frameDrag)
      fc.on('mouse:up', frameUp)
    }
  }

  img.on('moving', clamp)
     .on('scaling', clamp)
     .on('mousedown', imgDown)
     .on('mouseup', imgUp)

  frame.on('mousedown', frameDown)
       .on('mouseup', frameUp)

  cropHandlersRef.current = {
    imgDown,
    imgUp,
    frameDown,
    clamp,
    clampFrame,
    renderCropControls,
  }
};

/* ---------- cancelCrop (unchanged) ---------------------------- */
const cancelCrop = () => {
  if (!croppingRef.current) return;
  const img = cropImgRef.current
  const frame = cropGroupRef.current
  const st = cropStartRef.current as CropSnap | null
  const handlers = cropHandlersRef.current
  if (img && handlers) {
    img.off('moving', handlers.clamp)
       .off('scaling', handlers.clamp)
       .off('mousedown', handlers.imgDown)
       .off('mouseup', handlers.imgUp)
  }
  if (frame && handlers) {
    frame.off('scaling', handlers.clampFrame)
         .off('mousedown', handlers.frameDown)
  }
  fc.off('mouse:move', frameDrag)
  fc.off('mouse:up', frameUp)
  if (frame) {
    frame.lockMovementX = false
    frame.lockMovementY = false
  }
  if (handlers) fc.off('after:render', handlers.renderCropControls)
  cropHandlersRef.current = null
  fc.remove(cropGroupRef.current!); clearMask();

  if (img && st) {
    img.set({
      left:st.left, top:st.top,
      cropX:st.cropX, cropY:st.cropY,
      width:st.cropW, height:st.cropH,
      scaleX:st.scaleX, scaleY:st.scaleY,
      hasControls:st.hasControls,
      lockScalingX:st.lockScalingX,
      lockScalingY:st.lockScalingY,
      lockRotation:st.lockRotation,
    }).setCoords();
  }
  cropGroupRef.current=cropImgRef.current=cropStartRef.current=null;
  croppingRef.current=false; onCroppingChange?.(false);
  fc.requestRenderAll();
};

/* ---------- commitCrop ---------------------------------------- */
const commitCrop = () => {
  if (!croppingRef.current) return;
  const img   = cropImgRef.current!;
  const frame = cropGroupRef.current!;
  const st    = cropStartRef.current as CropSnap;

  const handlers = cropHandlersRef.current
  img.off('moving', handlers?.clamp)
     .off('scaling', handlers?.clamp)
     .off('mousedown', handlers?.imgDown)
     .off('mouseup', handlers?.imgUp)
  frame.off('scaling', handlers?.clampFrame)
       .off('mousedown', handlers?.frameDown)
  fc.off('mouse:move', frameDrag)
  fc.off('mouse:up', frameUp)
  frame.lockMovementX = false
  frame.lockMovementY = false
  if (handlers) fc.off('after:render', handlers.renderCropControls)
  cropHandlersRef.current = null
  fc.remove(frame); clearMask();

  const invSX = 1/(img.scaleX??1), invSY = 1/(img.scaleY??1);
  const cropX = (frame.left! - img.left! ) * invSX;
  const cropY = (frame.top!  - img.top!  ) * invSY;
  const cropW =  frame.width!*frame.scaleX!*invSX;
  const cropH =  frame.height!*frame.scaleY!*invSY;

  img.set({
    left:frame.left, top:frame.top,
    cropX, cropY, width:cropW, height:cropH,
    hasControls:st.hasControls,
    lockScalingX:st.lockScalingX,
    lockScalingY:st.lockScalingY,
    lockRotation:st.lockRotation,
  }).setCoords();

  cropGroupRef.current=cropImgRef.current=cropStartRef.current=null;
  croppingRef.current=false; onCroppingChange?.(false);
  fc.setActiveObject(img); fc.requestRenderAll();

  /* sync → store */
  if ((img as any).layerIdx!==undefined) {
    updateLayer(pageIdx,(img as any).layerIdx,{
      x:img.left, y:img.top,
      width:img.getScaledWidth(), height:img.getScaledHeight(),
      scaleX:img.scaleX, scaleY:img.scaleY,
      cropX, cropY, cropW, cropH,
    });
  }
};

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
.on('mouse:dblclick', e => {
  const t = e.target as fabric.Object | undefined
  if (t && (t as any).type === 'image') startCrop(t as fabric.Image)
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

  if (croppingRef.current) {
    if (e.code === 'Escape') { cancelCrop(); e.preventDefault(); return }
    if (e.code === 'Enter') { commitCrop(); e.preventDefault(); return }
  }

  if (!cmd && e.code === 'KeyC' && active && (active as any).type === 'image') {
    startCrop(active as fabric.Image)
    e.preventDefault()
    return
  }

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
const cropListener = () => {
  const act = fc.getActiveObject() as fabric.Object | undefined
  if (act && (act as any).type === 'image') startCrop(act as fabric.Image)
}
document.addEventListener('start-crop', cropListener)

  /* ── 6 ▸ Expose canvas & tidy up ──────────────────────────── */
  // expose editing ref so external controls can pause re-hydration
  ;(fc as any)._editingRef = isEditing
  fcRef.current = fc; onReady(fc)

  return () => {
    window.removeEventListener('keydown', onKey)
    document.removeEventListener('start-crop', cropListener)
    if (scrollHandler) window.removeEventListener('scroll', scrollHandler)
    onReady(null)
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

    hydrating.current = true
    fc.clear(); hoverRef.current && fc.add(hoverRef.current)

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

  /* ✨  SINGLE click — open the Selfie-drawer and pass the ref-ID */
  img.on('mouseup', () => {
    const plId = spec?._ref ?? spec?._id ?? null
    document.dispatchEvent(
      new CustomEvent('open-selfie-drawer', { detail: { placeholderId: plId } })
    )
  })



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

            /* hide overlay when actively selected */
            fc.on('selection:created', e => {
              if (e.target === img) ghost!.style.display = 'none'
            })
            fc.on('selection:cleared', () => { ghost!.style.display = '' })

            /* hide overlay when coach-mark is dismissed */
            document.addEventListener('ai-coach-dismiss', () => {
              ghost!.style.display = 'none'
            })
          }

          /* keep z-order */
          ;(img as any).layerIdx = idx
          const pos = fc.getObjects().findIndex(o =>
            (o as any).layerIdx !== undefined && (o as any).layerIdx < idx)
          fc.insertAt(img, pos === -1 ? fc.getObjects().length : pos, false)
          img.setCoords()
        }, opts)
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
    fc.requestRenderAll(); hydrating.current = false
  }, [page])

  /* ---------- render ----------------------------------------- */
  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_W}
      height={PREVIEW_H}
      className="border w-full h-auto max-w-[420px]"
    />
  )
}