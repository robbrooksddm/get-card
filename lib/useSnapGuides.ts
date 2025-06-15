import { fabric } from 'fabric'

/**
 * Enable Canva‑style snap guides while dragging or scaling objects.
 *
 * @param fc     Fabric canvas instance
 * @param width  Full page width in canvas units
 * @param height Full page height in canvas units
 */
export function enableSnapGuides(fc: fabric.Canvas, width: number, height: number) {
  const SNAP = 4
  let guides: fabric.Line[] = []
  let cache: { l:number; r:number; t:number; b:number; cx:number; cy:number }[] = []

  const metrics = (r: fabric.IBoundingRect) => ({
    l: r.left,
    r: r.left + r.width,
    t: r.top,
    b: r.top + r.height,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  })

  const removeGuides = () => {
    guides.forEach(g => fc.remove(g))
    guides = []
  }

  const drawV = (x: number) => {
    const ln = new fabric.Line([x, 0, x, height], {
      stroke: '#2BB0A5',
      strokeWidth: 1,
      strokeDashArray: [4, 2],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    })
    ;(ln as any)._guide = true
    fc.add(ln)
    guides.push(ln)
  }

  const drawH = (y: number) => {
    const ln = new fabric.Line([0, y, width, y], {
      stroke: '#2BB0A5',
      strokeWidth: 1,
      strokeDashArray: [4, 2],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    })
    ;(ln as any)._guide = true
    fc.add(ln)
    guides.push(ln)
  }

  const buildCache = (active: fabric.Object) => {
    cache = fc
      .getObjects()
      .filter(o =>
        o !== active &&
        (o as any).visible !== false &&
        !(o as any)._guide
      )
      .map(o => metrics(o.getBoundingRect(true, true)))
  }

  const snap = (obj: fabric.Object) => {
    const a = metrics(obj.getBoundingRect(true, true))
    let newLeft = obj.left ?? 0
    let newTop  = obj.top  ?? 0
    let snapX: number | null = null
    let snapY: number | null = null

    const checkX = (diff: number, pos: number) => {
      if (snapX === null && Math.abs(diff) < SNAP) {
        newLeft -= diff
        snapX = pos
      }
    }
    const checkY = (diff: number, pos: number) => {
      if (snapY === null && Math.abs(diff) < SNAP) {
        newTop -= diff
        snapY = pos
      }
    }

    cache.forEach(b => {
      checkX(a.l - b.l, b.l)
      checkX(a.l - b.r, b.r)
      checkX(a.r - b.l, b.l)
      checkX(a.r - b.r, b.r)
      checkX(a.cx - b.cx, b.cx)

      checkY(a.t - b.t, b.t)
      checkY(a.t - b.b, b.b)
      checkY(a.b - b.t, b.t)
      checkY(a.b - b.b, b.b)
      checkY(a.cy - b.cy, b.cy)
    })

    const page = {
      l: 0,
      r: width,
      t: 0,
      b: height,
      cx: width / 2,
      cy: height / 2,
    }

    checkX(a.l - page.l, page.l)
    checkX(a.r - page.r, page.r)
    checkX(a.cx - page.cx, page.cx)

    checkY(a.t - page.t, page.t)
    checkY(a.b - page.b, page.b)
    checkY(a.cy - page.cy, page.cy)

    if (snapX !== null) drawV(snapX)
    if (snapY !== null) drawH(snapY)

    obj.set({ left: newLeft, top: newTop })
    obj.setCoords()
  }

  fc.on('object:moving', e => {
    const obj = e.target as fabric.Object | undefined
    if (!obj) return
    if (!cache.length) buildCache(obj)
    removeGuides()
    snap(obj)
  })
  fc.on('object:scaling', e => {
    const obj = e.target as fabric.Object | undefined
    if (!obj) return
    if (!cache.length) buildCache(obj)
    removeGuides()
    snap(obj)
  })
  fc.on('mouse:up', () => {
    removeGuides()
    cache = []
  })
  fc.on('object:modified', () => {
    removeGuides()
    cache = []
  })
}
