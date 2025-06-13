import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

export const dynamic = 'force-dynamic'

const DPI = 300
const mm = (n:number) => (n / 25.4) * DPI

const SPECS = {
  'card-7x5': { trimW: 150, trimH: 214, bleed: 3 },
} as const

function esc(s: string) {
  return s.replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]!))
}

function imageUrl(ly: any): string | undefined {
  if (typeof ly.srcUrl === 'string') return ly.srcUrl
  if (typeof ly.src === 'string') return ly.src
  const ref = ly.assetId || ly.src?.asset?._ref
  if (typeof ref === 'string') {
    const id = ref.replace(/^image-/, '').replace(/-(png|jpg|jpeg|webp)$/, '')
    const pid =
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
      process.env.SANITY_STUDIO_PROJECT_ID
    if (pid) return `https://cdn.sanity.io/images/${pid}/production/${id}.png`
  }
  return undefined
}

export async function POST(req: NextRequest) {
  try {
    const { pages, sku } = await req.json() as { pages:any[]; sku:keyof typeof SPECS }
    if (!Array.isArray(pages) || !SPECS[sku]) {
      return NextResponse.json({ error: 'bad input' }, { status: 400 })
    }
    const spec = SPECS[sku]
    const width  = Math.round(mm(spec.trimW + spec.bleed * 2))
    const height = Math.round(mm(spec.trimH + spec.bleed * 2))

    const clamp = (n:number, min:number, max:number) => Math.max(min, Math.min(max, n))
    const composites: sharp.OverlayOptions[] = []
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

      if (ly.type === 'image') {
        const url = imageUrl(ly)
        if (!url || !/^https?:/i.test(url)) continue
        try {
          const res = await fetch(url)
          const buf = Buffer.from(await res.arrayBuffer())
          let imgSharp = sharp(buf, { failOn: 'warn', limitInputPixels: false })
          if (ly.cropW != null && ly.cropH != null) {
            const left = Math.max(0, Math.round(ly.cropX ?? 0))
            const top = Math.max(0, Math.round(ly.cropY ?? 0))
            const cw = Math.round(ly.cropW)
            const ch = Math.round(ly.cropH)
            imgSharp = imgSharp.extract({ left, top, width: cw, height: ch })
          }
          if (ly.flipY) imgSharp = imgSharp.flip()
          if (ly.flipX) imgSharp = imgSharp.flop()
          imgSharp = imgSharp.resize(w, h, { fit: 'fill' })
          if (ly.opacity != null && ly.opacity < 1) {
            imgSharp = imgSharp.ensureAlpha().linear([1, 1, 1, ly.opacity])
          }
          const img = await imgSharp.toBuffer()
          composites.push({ input: img, left: x, top: y } as sharp.OverlayOptions)
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
        const underlineAttr = ly.underline ? " text-decoration='underline'" : ''
        const style = ly.opacity != null && ly.opacity < 1 ? ` style='opacity:${ly.opacity}'` : ''
        const svg = `<?xml version='1.0' encoding='UTF-8'?>`+
          `<svg xmlns='http://www.w3.org/2000/svg' width='${svgW}' height='${svgH}'>`+
          `<text x='${anchorX}' y='${pad}' dominant-baseline='text-before-edge' text-anchor='${anchor}' font-family='${ly.fontFamily || 'Helvetica'}' font-size='${fs}' font-weight='${ly.fontWeight || ''}' font-style='${ly.fontStyle || ''}' fill='${ly.fill || '#000'}'${underlineAttr}${style}>${tspans}</text>`+
          `</svg>`
        composites.push({ input: Buffer.from(svg), left: x, top: y } as sharp.OverlayOptions)
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
