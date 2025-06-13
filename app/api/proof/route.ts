import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { PRINT_SPECS, inchesToPx } from '@/lib/printSpecs'

interface Overlay extends sharp.OverlayOptions {
  /** Global opacity for the overlay; sharp's types omit this */
  opacity?: number
}

export const dynamic = 'force-dynamic'

type Sku = keyof typeof PRINT_SPECS

function esc(s: string) {
  return s.replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]!))
}

export async function POST(req: NextRequest) {
  try {
    const { pages = [], pageImages, sku } = await req.json() as { pages?:any[]; pageImages?:string[]; sku:Sku }
    if ((!Array.isArray(pages) && !Array.isArray(pageImages)) || !PRINT_SPECS[sku]) {
      return NextResponse.json({ error: 'bad input' }, { status: 400 })
    }
    const spec = PRINT_SPECS[sku]
    const width  = Math.round(inchesToPx(spec.trimW + spec.bleed * 2, spec.dpi))
    const height = Math.round(inchesToPx(spec.trimH + spec.bleed * 2, spec.dpi))

    if (Array.isArray(pageImages) && pageImages.length) {
      try {
        const raw = pageImages[0].replace(/^data:image\/[^;]+;base64,/, '')
        const buf = Buffer.from(raw, 'base64')
        const out = await sharp(buf).resize(width, height, { fit: 'fill' }).png().toBuffer()
        return new NextResponse(out, { headers: { 'content-type': 'image/png' } })
      } catch (err) {
        console.error('[proof/img]', err)
        return NextResponse.json({ error: 'server' }, { status: 500 })
      }
    }

    const clamp = (n:number, min:number, max:number) => Math.max(min, Math.min(max, n))
    const composites: Overlay[] = []
    const page = pages[0] || {}
    const layers = Array.isArray(page.layers) ? page.layers : []

    for (const ly of layers) {
      let x = ly.leftPct != null ? (ly.leftPct / 100) * width  : ly.x
      let y = ly.topPct  != null ? (ly.topPct  / 100) * height : ly.y
      let w = ly.widthPct  != null ? (ly.widthPct  / 100) * width  : ly.width
      let h = ly.heightPct != null ? (ly.heightPct / 100) * height : ly.height

      x = clamp(Math.round(x || 0), 0, width)
      y = clamp(Math.round(y || 0), 0, height)
      if (w != null) w = clamp(Math.round(w), 1, width - x)
      if (h != null) h = clamp(Math.round(h), 1, height - y)

      if (ly.type === 'image' && (ly.src || ly.srcUrl)) {
        try {
          const url = ly.srcUrl || ly.src
          if (typeof url !== 'string' || !/^https?:/i.test(url)) continue
          const res = await fetch(url)
          const buf = Buffer.from(await res.arrayBuffer())
          let imgSharp = sharp(buf)
          if (ly.cropW != null && ly.cropH != null) {
            const left = Math.max(0, Math.round(ly.cropX ?? 0))
            const top = Math.max(0, Math.round(ly.cropY ?? 0))
            const cw = Math.round(ly.cropW)
            const ch = Math.round(ly.cropH)
            imgSharp = imgSharp.extract({ left, top, width: cw, height: ch })
          }
          if (ly.flipY) imgSharp = imgSharp.flip()
          if (ly.flipX) imgSharp = imgSharp.flop()
          const img = await imgSharp.resize(w, h, { fit: 'fill' }).toBuffer()
          composites.push({ input: img, left: x, top: y, opacity: ly.opacity ?? 1 } as Overlay)
        } catch (err) {
          console.error('img', err)
        }
      } else if (ly.type === 'text' && ly.text) {
        const fs = ly.fontSize || 20
        const lh = (ly.lineHeight ?? 1.2) * fs
        const lines = String(ly.text || '').split('\n').map(esc)
        const anchor = ly.textAlign === 'center' ? 'middle'
                     : ly.textAlign === 'right' ? 'end' : 'start'
        const anchorX = ly.textAlign === 'center' ? '50%'
                        : ly.textAlign === 'right' ? '100%' : '0'
        const pad = Math.round(fs * 0.2)
        const svgW = w ?? Math.round(fs * Math.max(...lines.map(l => l.length)) * 0.6)
        const svgH = (h ?? Math.round(lh * lines.length)) + pad * 2
        const tspans = lines.map((t,i)=>`<tspan x='${anchorX}' dy='${i?lh:0}'>${t}</tspan>`).join('')
        const svg = `<?xml version='1.0' encoding='UTF-8'?>`+
          `<svg xmlns='http://www.w3.org/2000/svg' width='${svgW}' height='${svgH}'>`+
          `<text x='${anchorX}' y='${pad}' dominant-baseline='text-before-edge' text-anchor='${anchor}' font-family='${ly.fontFamily || 'Helvetica'}' font-size='${fs}' font-weight='${ly.fontWeight || ''}' font-style='${ly.fontStyle || ''}' fill='${ly.fill || '#000'}' ${ly.underline ? "text-decoration='underline'" : ''} opacity='${ly.opacity ?? 1}'>${tspans}</text>`+
          `</svg>`
        composites.push({ input: Buffer.from(svg), left: x, top: y, opacity: ly.opacity ?? 1 } as Overlay)
      }
    }

    let img = sharp({ create: { width, height, channels: 4, background: '#ffffff' } }).composite(composites)

    const masterRatio = width / height
    const targetRatio = (spec.trimW + spec.bleed * 2) / (spec.trimH + spec.bleed * 2)
    if (targetRatio < masterRatio) {
      const cropW = Math.round(height * targetRatio)
      const offsetX = Math.floor((width - cropW) / 2)
      img = img.extract({ left: offsetX, top: 0, width: cropW, height })
               .extend({ left: 0, right: 0, top: 0, bottom: 0, background: '#ffffff' })
    }

    const out = await img.png().toBuffer()
    return new NextResponse(out, { headers: { 'content-type': 'image/png' } })
  } catch (err) {
    console.error('[proof]', err)
    return NextResponse.json({ error: 'server' }, { status: 500 })
  }
}
