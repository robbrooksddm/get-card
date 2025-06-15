/**************************************************************
 * CropTool – helper to crop Fabric.js images without double‑clicking
 * -------------------------------------------------------------------
 * 2025‑06‑08
 *   • Always shows crop‑window stroke above bitmap
 *   • Bitmap & frame controls are simultaneously draggable
 *********************************************************************/

import { fabric } from 'fabric'

export class CropTool {
  public  isActive = false

  private fc      : fabric.Canvas
  private SCALE   : number
  private SEL     : string
  private onChange?: (state: boolean) => void
  private img     : fabric.Image | null = null
  private frame   : fabric.Group | null = null
  private masks   : fabric.Rect[] = [];      // 4‑piece dim overlay
  private frameScaling = false;              // TRUE only while frame is being resized
  /** original bitmap state before cropping */
  private orig: { left:number; top:number; cropX:number; cropY:number; width:number; height:number; } | null = null;
  /** clean‑up callbacks to run on `teardown()` */
  private cleanup: Array<() => void> = [];

  constructor (fc: fabric.Canvas, scale: number, selColour: string,
               onChange?: (state: boolean) => void) {
    this.fc      = fc
    this.SCALE   = scale
    this.SEL     = selColour
    this.onChange= onChange
  }

  /* ─────────────── public API ──────────────────────────────────── */
  public begin (img: fabric.Image) {
    if (this.isActive) return

    // ensure a clean slate on every new crop session
    this.cleanup.forEach(fn => fn());
    this.cleanup = [];

    this.isActive = true
    this.onChange?.(true)
    this.img      = img
    // allow freeform scaling of the crop window
    const prevUniformScaling = this.fc.uniformScaling
    const prevUniScaleKey    = this.fc.uniScaleKey
    this.fc.uniformScaling = false
    this.fc.uniScaleKey    = 'none'
    this.cleanup.push(() => {
      this.fc.uniformScaling = prevUniformScaling
      this.fc.uniScaleKey    = prevUniScaleKey
    })
    // manual drag state
    let isDraggingImage = false;
    let dragOrig   = { x: 0, y: 0 };   // pointer world‑coords at drag start
    let imgOrigPos = { x: 0, y: 0 };   // img.left/top at drag start
    let restoreFrameSelectable: boolean | undefined;
    let restoreFrameEvented:    boolean | undefined;

    // which edges stay locked while the user scales the frame
    let anchorEdge: { left?: number; top?: number; right?: number; bottom?: number } = {};
    // which edges stay locked while the user scales the bitmap
    let imgEdge: { left?: number; top?: number; right?: number; bottom?: number } = {};

    // remember original crop for cancel()
    this.orig = {
      left  : img.left ?? 0,
      top   : img.top  ?? 0,
      cropX : img.cropX ?? 0,
      cropY : img.cropY ?? 0,
      width : img.width ?? 0,
      height: img.height ?? 0,
    };

    /* ① expand bitmap to its natural size (keep on‑screen scale) */
    const imgEl  = img.getElement() as HTMLImageElement
    const nat = { w: imgEl.naturalWidth  || img.width!,
                  h: imgEl.naturalHeight || img.height! }
    const { cropX=0, cropY=0, width=nat.w, height=nat.h } = img

    const prevLockUniScaling = img.lockUniScaling;
    const prevCenteredScaling = img.centeredScaling;
    img.set({
      left  : (img.left ?? 0) - cropX * (img.scaleX ?? 1),
      top   : (img.top  ?? 0) - cropY * (img.scaleY ?? 1),
      width : nat.w,
      height: nat.h,
      cropX : 0,
      cropY : 0,
      lockRotation   : true,
      lockScalingFlip: true,
      lockUniScaling : true,
      centeredScaling: false,
      hasControls    : true,
      selectable     : true,
      evented        : true,
    }).setCoords()
    this.cleanup.push(() => {
      img.lockUniScaling  = prevLockUniScaling
      img.centeredScaling = prevCenteredScaling
    })
    /* hide the rotate ("mtr") and side controls while cropping */
    img.setControlsVisibility({
      mtr: false,          // hide rotation
      ml : false, mr : false,      // hide middle-left / middle-right
      mt : false, mb : false       // hide middle-top / middle-bottom
    });
    img.hasBorders  = true;            // always show border in crop mode
    img.borderColor = this.SEL;        // same colour as crop window
    img.borderDashArray = [];          // solid border

    /* ② persistent crop window */
    const fx = (img.left ?? 0) + cropX * (img.scaleX ?? 1)
    const fy = (img.top  ?? 0) + cropY * (img.scaleY ?? 1)
    const fw =  width    * (img.scaleX ?? 1)
    const fh =  height   * (img.scaleY ?? 1)

    const grid = { stroke:'#ffffff22', strokeWidth:1/this.SCALE,
                   selectable:false, evented:false }

    this.frame = new fabric.Group([
      new fabric.Rect({ left:0, top:0, width:fw, height:fh,
        fill:'',
        perPixelTargetFind:false,   // relax pixel-perfect hit-testing
        evented:false,
        stroke:this.SEL, strokeWidth:1/this.SCALE,
        strokeUniform:true }),
    ],{
      left:fx, top:fy, originX:'left', originY:'top',
      selectable:true, evented:true,  lockRotation:true,   // controls work; interior clicks fall through
      hasBorders:false, 
      lockMovementX:true,  lockMovementY:true,   // window position stays fixed
      lockScalingX:false, lockScalingY:false, 
      //centeredScaling:true,            // scale outward from centre
      transparentCorners:false,
      subTargetCheck: true,          // let clicks inside the rectangle fall through
    })
    // ---- replace default controls with 4 small white “L” handles ----
    const sizePx = 2 / this.SCALE;          // corner length (≈70 % smaller)

    /** Draw a single L‑shape, rotated for each corner */
    const drawL = (
      ctx : CanvasRenderingContext2D,
      left: number,
      top : number,
      rot : number,                                  // radians
    ) => {
      ctx.save();
      ctx.translate(left, top);
      ctx.rotate(rot);
      ctx.lineWidth   = 0.5 / this.SCALE;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';          // subtle outline
      ctx.shadowBlur  = 3 / this.SCALE;
      ctx.beginPath();
      ctx.moveTo(0,  0);
      ctx.lineTo(0,  sizePx * 0.8);    // vertical down from origin
      ctx.moveTo(0,  0);
      ctx.lineTo(sizePx * 0.8, 0);     // horizontal right
      ctx.stroke();
      ctx.restore();
    };

    /** corner control factory with proper orientation */
    const mkCorner = (x: number, y: number, rot: number) =>
      new fabric.Control({
        x, y,
        offsetX: 0, offsetY: 0,
        // enlarge hit‑box for easier grabbing
        sizeX: 12 / this.SCALE,
        sizeY: 12 / this.SCALE,
        // use Fabric helpers (cast to `any` to silence TS)
        cursorStyleHandler: (fabric as any).controlsUtils.scaleCursorStyleHandler,
        actionHandler     : (fabric as any).controlsUtils.scalingEqually,
        actionName        : 'scale',   // ensure Fabric treats this as scaling, not drag
        render            : (ctx, left, top) => drawL(ctx, left, top, rot),
      });

    // keep only the 4 corner controls; no sides, no rotation
    (this.frame as any).controls = {
      tl: mkCorner(-0.5, -0.5,  0),                // top‑left
      tr: mkCorner( 0.5, -0.5,  Math.PI / 2),      // top‑right
      br: mkCorner( 0.5,  0.5,  Math.PI),          // bottom‑right
      bl: mkCorner(-0.5,  0.5, -Math.PI / 2),      // bottom‑left
    } as Record<string, fabric.Control>;

    /* ③ add both to canvas and keep z‑order intuitive              */
    this.fc.add(this.frame)
    /* 2‑b ─ dim everything outside the crop window -------------------- */
    const mkMask = () => new fabric.Rect({
      left: 0, top: 0, width: this.fc.width!, height: this.fc.height!,
      fill: 'rgba(0,0,0,0.4)', selectable: false, evented: false,
      originX: 'left',
      originY: 'top',
      excludeFromExport: true,
    });
    this.masks = [mkMask(), mkMask(), mkMask(), mkMask()];
    this.masks.forEach(r => this.fc.add(r));
    // make sure crop elements stay on top
    this.frame.bringToFront();
    const updateMasks = () => {
      if (!this.frame) return;

      /* -----------------------------------------------------------
       * Coordinate spaces refresher
       *   • Object positions (left/top) are in “world” coords.
       *   • The viewport (what you actually see) is the rectangle
       *     whose top‑left world‑coord is
       *         viewLeft = -vpt[4] / vpt[0],
       *         viewTop  = -vpt[5] / vpt[3].
       *   • Its size in world units is canvasPx / zoom.
       * ----------------------------------------------------------- */
      const vpt = this.fc.viewportTransform || [1, 0, 0, 1, 0, 0];
      const zoom = vpt[0] || 1;

      const viewLeft = -vpt[4] / zoom;
      const viewTop  = -vpt[5] / zoom;

      const w = this.fc.getWidth()  / zoom;
      const h = this.fc.getHeight() / zoom;

      /* -----------------------------------------------------------
       * Frame bounds in world (model) coordinates
       *  – `left`/`top` are already world coords
       *  – width/height must be multiplied by current scales
       * ----------------------------------------------------------- */
      const fL = this.frame.left!;
      const fT = this.frame.top!;
      const fW = this.frame.width!  * this.frame.scaleX!;
      const fH = this.frame.height! * this.frame.scaleY!;
      const fR = fL + fW;
      const fB = fT + fH;

      // Helper to clamp negative dims (Fabric ignores negative width/height)
      const clamp = (x: number) => Math.max(0, x);

      /* four stripes, clockwise from top */
      this.masks[0].set({                      // top
        left  : viewLeft,
        top   : viewTop,
        width : w,
        height: clamp(fT - viewTop),
      });

      this.masks[1].set({                      // right
        left  : fR,
        top   : fT,
        width : clamp(viewLeft + w - fR),
        height: fH,
      });

      this.masks[2].set({                      // bottom
        left  : viewLeft,
        top   : fB,
        width : w,
        height: clamp(viewTop + h - fB),
      });

      this.masks[3].set({                      // left
        left  : viewLeft,
        top   : fT,
        width : clamp(fL - viewLeft),
        height: fH,
      });

      this.masks.forEach(m => m.setCoords());
    };
    updateMasks();

    // Enforce minimum scale from the outset
    this.clamp(true);

    this.fc.setActiveObject(this.frame)

    /* ------------------------------------------------------------------
     *  DOM‑level pointer capture – runs *before* Fabric's own handler.
     *  Whichever corner the user pressed (bitmap OR frame) becomes the
     *  active object, so the drag starts without an extra click.
     * ------------------------------------------------------------------ */
    /* ------- Canva‑style dynamic handle visibility --------------------
       All handles are visible until the user grabs one.  While dragging,
       only the active object (bitmap OR frame) shows its controls; the
       moment the mouse is released we restore both sets.               */
    const beforeHandler = (e: fabric.IEvent) => {
      const t = (e as any).transform?.target as fabric.Object | undefined;
      if (!t || (t !== this.img && t !== this.frame)) return;

      // Hide both sets first…
      if (this.img)   this.img.hasControls = false;
      if (this.frame) this.frame.hasControls = false;

      // …then re‑enable the one that is actually being transformed
      t.hasControls = true;

      // If the user begins scaling the crop frame, remember the
      // *opposite* edges so they remain fixed during the drag.
      if (t === this.frame && (e as any).transform?.action === 'scale') {
        const c = (e as any).transform.corner;             // 'tl', 'tr', 'br', 'bl'
        const f = this.frame!;
        const left   = f.left!;
        const top    = f.top!;
        const right  = left + f.width!  * f.scaleX!;
        const bottom = top  + f.height! * f.scaleY!;

        anchorEdge = {};               // reset
        switch (c) {
          case 'br':                   // dragging bottom‑right  → lock top & left
            anchorEdge.left = left;
            anchorEdge.top  = top;
            break;
          case 'tl':                   // dragging top‑left      → lock right & bottom
            anchorEdge.right  = right;
            anchorEdge.bottom = bottom;
            break;
          case 'tr':                   // dragging top‑right     → lock left & bottom
            anchorEdge.left   = left;
            anchorEdge.bottom = bottom;
            break;
          case 'bl':                   // dragging bottom‑left   → lock top & right
            anchorEdge.top   = top;
            anchorEdge.right = right;
            break;
        }
        // 🔒 Freeze the photo's position so scaling the frame can't drag it.
        if (this.img) {
          this.img.lockMovementX = true;
          this.img.lockMovementY = true;
        }
      } else if (t === this.img && (e as any).transform?.action === 'scale') {
        const c = (e as any).transform.corner as string | undefined;
        const i = this.img!;
        const left   = i.left!;
        const top    = i.top!;
        const right  = left + i.getScaledWidth();
        const bottom = top  + i.getScaledHeight();

        imgEdge = {};
        switch (c) {
          case 'br':
            imgEdge.left = left;
            imgEdge.top  = top;
            break;
          case 'tl':
            imgEdge.right  = right;
            imgEdge.bottom = bottom;
            break;
          case 'tr':
            imgEdge.left   = left;
            imgEdge.bottom = bottom;
            break;
          case 'bl':
            imgEdge.top   = top;
            imgEdge.right = right;
            break;
        }
      }
    };

    const upHandler = () => {
      if (this.frame) {
        this.frame.bringToFront();
      }
      if (this.img)   {
        this.img.hasControls = true;
        this.img.setCoords();
      }
      if (this.frame) {
        this.frame.hasControls = true;
        this.frame.setCoords();
      }
      updateMasks();
      // keep the mask in front of the photo for consistent dimming
      this.masks.forEach(m => m.bringToFront?.());
      this.frame?.bringToFront();
      this.fc.requestRenderAll();            // refresh immediately
    };

    this.fc.on('before:transform', beforeHandler);
    this.fc.on('mouse:up', upHandler);

    // ----------------------------------------
    // Pointer down: decide what the user wants
    // ----------------------------------------
    const downHandler = (e: fabric.IEvent) => {
      if (!this.isActive || !this.img || !this.frame) return;

      const target  = e.target as fabric.Object | undefined;
      const pointer = this.fc.getPointer(e.e as any, false);

      // Reliable corner hit‑test (e.corner isn’t yet set on mouse:down)
      const findCorner = (fabric as any).controlsUtils?.findCorner;
      let hitCorner  = findCorner
        ? findCorner(this.frame, pointer, 30 / this.SCALE)   // 30 px tolerance
        : (e as any).corner;                                 // fallback

      // Fabric sometimes returns null before the first render; fall back to
      // e.corner if it’s already set (e.g. during rapid double‑clicks)
      if (!hitCorner && (e as any).corner) {
        // normalise to 'tl' / 'tr' / 'bl' / 'br' just like findCorner()
        hitCorner = (e as any).corner;
      }

      /* 1️⃣  Pointer landed on a corner control → let Fabric scale immediately */
      if (hitCorner) {
        if (this.fc.getActiveObject() !== this.frame) {
          this.fc.setActiveObject(this.frame);        // be sure!
        }
        return;                                       // Fabric runs transform
      }

      /* 2️⃣  Clicked the frame’s interior (or directly on the bitmap) — start panning */
      const hitImage = target === this.img;

      /* Fallback: check pointer against the frame’s bounding box so an
         interior click is recognised even when `containsPoint()` fails
         (e.g. event target is null because the frame is non‑evented).  */
      const br = this.frame.getBoundingRect(true, true);
      const inBox = pointer.x >= br.left && pointer.x <= br.left + br.width &&
                    pointer.y >= br.top  && pointer.y <= br.top  + br.height;

      const insideWindow = !hitCorner && (hitImage || inBox);

      if (insideWindow) {
      // Temporarily turn off the frame so pointer events fall through to bitmap
          this.frameScaling = false;
      restoreFrameSelectable = this.frame.selectable;
      restoreFrameEvented    = this.frame.evented;
      this.frame.selectable  = false;
      this.frame.evented     = false;

        isDraggingImage = true;
        dragOrig.x     = pointer.x;
        dragOrig.y     = pointer.y;
        imgOrigPos.x   = this.img.left!;
        imgOrigPos.y   = this.img.top!;

        // Activate bitmap so arrow keys etc. reflect its state
        if (this.fc.getActiveObject() !== this.img) {
          this.fc.setActiveObject(this.img);
        }

        // Block Fabric from starting any transform on the frame
        e.e?.preventDefault?.();
        e.e?.stopPropagation?.();
      }
    };

    // ------------------------------------------------
    // Pointer move: if we’re in panning mode, relocate
    // ------------------------------------------------
    const moveHandler = (e: fabric.IEvent) => {
        if (this.frameScaling) return;
      if (!isDraggingImage || !this.img) return;

      const pointer = this.fc.getPointer(e.e as any, false);
      const dx = pointer.x - dragOrig.x;
      const dy = pointer.y - dragOrig.y;

      this.img.set({ left: imgOrigPos.x + dx,
                     top : imgOrigPos.y + dy });

      this.clamp();                 // keep photo covering the window
      this.img.setCoords();
      updateMasks();
      // keep dim overlay & frame visible over the photo
      this.masks.forEach(m => m.bringToFront?.());
      this.frame?.bringToFront();
      this.fc.requestRenderAll();
    };

    // ----------------------------------------
    // Pointer up: stop any manual image drag
    // ----------------------------------------
    const upStopDrag = () => {
      // Restore frame interactivity after drag finishes
      if (restoreFrameSelectable !== undefined) this.frame!.selectable = restoreFrameSelectable;
      if (restoreFrameEvented    !== undefined) this.frame!.evented    = restoreFrameEvented;
      restoreFrameSelectable = restoreFrameEvented = undefined;
      this.frameScaling = false;
      isDraggingImage = false;
    };

    this.fc.on('mouse:down',  downHandler);
    this.fc.on('mouse:move',  moveHandler);
    this.fc.on('mouse:up',    upStopDrag);

    this.cleanup.push(() => {
      this.fc.off('mouse:down', downHandler);
      this.fc.off('mouse:move', moveHandler);
      this.fc.off('mouse:up',   upStopDrag);
    });

    // remember for teardown
    this.cleanup.push(() => {
      this.fc.off('before:transform', beforeHandler);
      this.fc.off('mouse:up', upHandler);
    });


    /* ------------------------------------------------------------
     *  Ensure corner data is up‑to‑date once a transform finishes.
     *  Fabric fires `object:modified` after scaling/moving ends,
     *  guaranteeing the object’s final scaleX/scaleY/left/top are
     *  committed.  Calling `setCoords()` here realigns both the
     *  object’s bounding box *and* its per‑corner control cache.
     * ----------------------------------------------------------- */
    const modifiedHandler = (e: fabric.IEvent) => {
      const t = e.target as fabric.Object | undefined;
      if (!t || (t !== this.img && t !== this.frame)) return;

      t.setCoords();
      if (t === this.img) this.clamp();          // keep entire photo filling the frame
      if (this.img)   this.img.hasControls = true;
      if (this.frame) this.frame.hasControls = true;
      updateMasks();
      this.fc.requestRenderAll();
    };

    this.fc.on('object:modified', modifiedHandler);
    this.cleanup.push(() =>
      this.fc.off('object:modified', modifiedHandler)
    );

    /* ④ dual‑handle rendering + clamping */
    // draw both control sets every frame
    this.fc.on('after:render', this.renderBoth)

    /* ------------------------------------------------------------------
     *  Whenever the user presses the mouse, ensure that whichever object
     *  (crop‑frame OR bitmap) they clicked immediately becomes the active
     *  selection.  This means every drag/scale starts working right away,
     *  without having to click once to select and a second time to resize.
     * ------------------------------------------------------------------ */
    this.fc.on('mouse:down', (e: fabric.IEvent) => {
      if (!this.isActive) return                         // only while cropping
      const t = e.target as fabric.Object | null | undefined
      if (!t) return
      if (t === this.img || t === this.frame) {
        // only switch if it is not already active – avoids redundant renders
        if (this.fc.getActiveObject() !== t) this.fc.setActiveObject(t)
      }
    })

    /* keep FRAME inside bitmap and refresh its corner data */
    this.frame!
      .on('moving', () => {
        this.clampFrame();            // keep frame inside bitmap
        this.frame!.setCoords();
        updateMasks(); 
      })
      .on('scaling', () => {
        // keep the pre‑determined opposite edges fixed
        const f = this.frame!;
        const w = f.width!  * f.scaleX!;
        const h = f.height! * f.scaleY!;
        if (anchorEdge.left   !== undefined) f.left = anchorEdge.left;
        if (anchorEdge.top    !== undefined) f.top  = anchorEdge.top;
        if (anchorEdge.right  !== undefined) f.left = anchorEdge.right  - w;
        if (anchorEdge.bottom !== undefined) f.top  = anchorEdge.bottom - h;
        this.clampFrame();            // keep window within bitmap limits
        this.frame!.setCoords();
        updateMasks();
        this.frameScaling = true;       // flag ON while corner is dragged
        // no extra requestRenderAll() – avoids double clear of contextTop    // flag ON while corner is being dragged
      })
      .on('scaled', () => {
        // 🔓 Re‑enable normal movement on the bitmap
        if (this.img) {
          this.img.lockMovementX = false;
          this.img.lockMovementY = false;
        }
        this.clampFrame();            // enforce bounds once scale is done
        this.frame!.setCoords();
        // restore both handle sets
        this.frame!.hasControls = true;
        if (this.img) this.img.hasControls = true;
        updateMasks();
        this.frameScaling = false;   // flag OFF once user releases the mouse
        this.fc.requestRenderAll();
      });

    // while scaling we just repaint; we update coordinates only once when the
    // gesture ends (object:scaled) so the math uses the final scale factors.
    img
      .on('moving', () => {
        // keep the photo within the crop window as it drags
        this.clamp();
        this.img!.setCoords();
        updateMasks();        // automatic redraw already in flight
      })
      .on('scaling', (e: fabric.IEvent) => {
        // defer min-size enforcement until 'scaled' to avoid jitter
        const i = this.img!;
        // 🔒 Keep aspect ratio locked (uniform scaling) during drag
        if (i.lockUniScaling) {
          i.scaleY = i.scaleX;
        }
        // --- Determine the absolute minimum uniform scale for this tick ----
        // 1) basic frame‑fit scale (width / height only)
        const f = this.frame!;
        const minSX = (f.width!  * f.scaleX!) / i.width!;
        const minSY = (f.height! * f.scaleY!) / i.height!;
        let neededScale = Math.max(minSX, minSY);

        // 2) coverage scale – depends on which edges are locked this drag
        const fLeft   = f.left!;
        const fTop    = f.top!;
        const fRight  = fLeft + f.width!  * f.scaleX!;
        const fBottom = fTop  + f.height! * f.scaleY!;

        // The bitmap edge that stays fixed during this gesture (taken from imgEdge)
        // If left is locked, the bitmap's left won't move; so its right must reach fRight
        if (imgEdge.left !== undefined) {
          const needW = fRight - imgEdge.left;
          neededScale = Math.max(neededScale, needW / i.width!);
        }
        // If right is locked, its left must reach fLeft
        if (imgEdge.right !== undefined) {
          const needW = imgEdge.right - fLeft;
          neededScale = Math.max(neededScale, needW / i.width!);
        }
        // If top is locked, its bottom must reach fBottom
        if (imgEdge.top !== undefined) {
          const needH = fBottom - imgEdge.top;
          neededScale = Math.max(neededScale, needH / i.height!);
        }
        // If bottom is locked, its top must reach fTop
        if (imgEdge.bottom !== undefined) {
          const needH = imgEdge.bottom - fTop;
          neededScale = Math.max(neededScale, needH / i.height!);
        }

        if (i.scaleX! < neededScale) {
          i.scaleX = i.scaleY = neededScale;
          const t = (e as any).transform;
          if (t) t.scaleX = t.scaleY = neededScale; // keep Fabric’s live transform synced
        }
        // Make absolutely sure the bitmap still covers the frame mid‑gesture
        this.clamp(true);
        const w = i.width!  * i.scaleX!;
        const h = i.height! * i.scaleY!;
        if (imgEdge.left   !== undefined) i.left = imgEdge.left;
        if (imgEdge.top    !== undefined) i.top  = imgEdge.top;
        if (imgEdge.right  !== undefined) i.left = imgEdge.right  - w;
        if (imgEdge.bottom !== undefined) i.top  = imgEdge.bottom - h;

        i.setCoords();
        updateMasks();
        this.frameScaling = true;       // ON while photo itself is scaling
        // Fabric’s own transform loop is already rendering each tick
      })
      .on('scaled', () => {
        imgEdge = {};
        this.frameScaling = false;   // OFF at end of gesture
        this.clamp(true);            // final clamp at end of gesture
        this.img!.setCoords();
        // restore both handle sets now that the gesture is finished
        this.img!.hasControls = true;
        if (this.frame) this.frame.hasControls = true;
        updateMasks();
        this.fc.requestRenderAll();
      });

    // remove object event listeners when crop ends
    this.cleanup.push(() => {
      this.frame?.off('moving');
      this.frame?.off('scaling');
      this.frame?.off('scaled');
      img.off('moving');
      img.off('scaling');
      img.off('scaled');
    });
  }

  public cancel () {
    if (this.isActive && this.img && this.orig) {
      this.img.set({
        left  : this.orig.left,
        top   : this.orig.top,
        cropX : this.orig.cropX,
        cropY : this.orig.cropY,
        width : this.orig.width,
        height: this.orig.height,
      }).setCoords();
      this.fc.setActiveObject(this.img);
      this.img.fire('modified');
      this.fc.fire('object:modified', { target: this.img } as any);
    }
    this.teardown(false);
  }

  public commit () {
    if (this.isActive && this.img && this.frame) {
      const { img, frame } = this;
      const sX = img.scaleX ?? 1;
      const sY = img.scaleY ?? 1;
      const cropX = (frame.left! - img.left!) / sX;
      const cropY = (frame.top!  - img.top!)  / sY;
      const cropW = frame.width!  * frame.scaleX! / sX;
      const cropH = frame.height! * frame.scaleY! / sY;

      img.set({
        left  : frame.left!,
        top   : frame.top!,
        cropX : cropX,
        cropY : cropY,
        width : cropW,
        height: cropH,
      }).setCoords();

      this.fc.setActiveObject(img);
      img.fire('modified');
      this.fc.fire('object:modified', { target: img } as any);
    }
    this.teardown(true);
  }

  /** Abort cropping without firing any events */
  public abort () {
    this.teardown(false);
  }

  /* ─────────────── internal helpers ────────────────────────────── */
  private teardown (keep:boolean) {
    if (!this.isActive) return

    // run and clear any on‑crop listeners
    this.cleanup.forEach(fn => fn());
    this.cleanup = [];

    this.fc.off('after:render', this.renderBoth)
    if (this.frame) this.fc.remove(this.frame)
    this.masks.forEach(r => this.fc.remove(r));
    this.masks = [];
    if (!keep) this.fc.discardActiveObject()
    this.fc.requestRenderAll()

    if (this.img) {
      this.img.lockMovementX = false
      this.img.lockMovementY = false
    }
    this.frame    = null
    this.img      = null
    this.orig     = null
    this.isActive = false
    this.onChange?.(false)
  }

  /* keep bitmap inside frame */
  private clamp = (force = false, reposition = true) => {
    if (!force && this.frameScaling) return;
    if (!this.img || !this.frame) return
    const { img, frame } = this
    const minSX = frame.width!*frame.scaleX! / img.width!
    const minSY = frame.height!*frame.scaleY! / img.height!
    const minScale = Math.max(minSX, minSY)
    img.minScaleLimit = minScale

    if ((img.scaleX ?? 1) < minScale) {
      img.scaleX = img.scaleY = minScale
    } else if (img.lockUniScaling) {
      img.scaleY = img.scaleX
    }

    if (reposition) {
      const fx=frame.left!, fy=frame.top!
      const fw=frame.width!*frame.scaleX!, fh=frame.height!*frame.scaleY!
      const iw=img.getScaledWidth(), ih=img.getScaledHeight()
      img.set({
        left: Math.min(fx, Math.max(fx+fw-iw, img.left!)),
        top : Math.min(fy, Math.max(fy+fh-ih, img.top!)),
      })
    }
    img.setCoords()
  }

  /* keep frame inside bitmap */
  private clampFrame = () => {
    if (!this.img || !this.frame) return
    const { img, frame } = this
    const iw = img.getScaledWidth()
    const ih = img.getScaledHeight()

    const minL = img.left!, minT = img.top!
    const maxR = minL + iw, maxB = minT + ih

    if (frame.left! < minL) frame.left = minL
    if (frame.top!  < minT) frame.top  = minT

    const fw = frame.width!*frame.scaleX!, fh = frame.height!*frame.scaleY!
    if (frame.left! + fw > maxR)
      frame.scaleX = (maxR - frame.left!) / frame.width!
    if (frame.top! + fh > maxB)
      frame.scaleY = (maxB - frame.top!) / frame.height!

    // Update bitmap's minimum scale so it can never shrink smaller
    const minSX = frame.width! * frame.scaleX! / img.width!
    const minSY = frame.height! * frame.scaleY! / img.height!
    img.minScaleLimit = Math.max(minSX, minSY)
    
    frame.setCoords()
  }

    /** Minimum uniform scale so the image fully covers the crop window,
   *  taking the current left/top gap into account.
   */
    private coverScale = () => {
      if (!this.img || !this.frame) return 1;
      const { img, frame } = this;
  
      const frameRight  = frame.left! + frame.width!  * frame.scaleX!;
      const frameBottom = frame.top!  + frame.height! * frame.scaleY!;
      const imgLeft     = img.left!;
      const imgTop      = img.top!;
  
      const needW = frameRight  - imgLeft;  // width needed to reach frame’s right edge
      const needH = frameBottom - imgTop;   // height needed to reach frame’s bottom edge
  
      return Math.max(needW / img.width!, needH / img.height!);
    }

  /* draw controls for both objects each frame */
  private renderBoth = () => {
    if (!this.img || !this.frame) return

    // Always refresh corner caches before drawing controls so they track
    // live transforms even after repeated scale gestures.
    this.img.setCoords();
    this.frame.setCoords();

        const ctx = (this.fc as any).contextTop
        if (!ctx) return;            // canvas disposed or not yet initialised
        /* Fabric doesn’t always wipe contextTop if it draws nothing of its own.
           Clear it ourselves before redrawing both control sets. */
        this.fc.clearContext(ctx)

    ctx.save()
    const vpt = this.fc.viewportTransform;
    if (vpt) {
      //          a     b     c     d     e     f
      ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
    }      // draw in the same space as Fabric
    /* ---- Persistent bitmap outline while cropping ---- */
    if (this.isActive && this.img) {
      const br = this.img.getBoundingRect(true, true);
      ctx.save();
      ctx.strokeStyle = this.SEL;
      ctx.lineWidth   = 1 / this.SCALE;
      ctx.setLineDash([]);                 // solid
      ctx.strokeRect(br.left, br.top, br.width, br.height);
      ctx.restore();
    }
    if (this.img?.hasControls)   this.img.drawControls(ctx);
    if (this.frame?.hasControls) this.frame.drawControls(ctx);
    ctx.restore()
  }
}