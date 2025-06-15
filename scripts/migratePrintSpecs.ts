import 'dotenv/config'
import {createClient} from '@sanity/client'
import {nanoid} from 'nanoid'

const sanity = createClient({
  projectId : process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset   : process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2025-02-19',
  token     : process.env.SANITY_SERVICE_TOKEN,
  useCdn    : false,
})

async function run() {
  const products = await sanity.fetch<{
    _id: string
    printSpec?: any
    trimWidthMm?: number
    trimHeightMm?: number
  }[]>(`*[_type=="cardProduct"]{_id, printSpec, trimWidthMm, trimHeightMm}`)

  const specs = await sanity.fetch<{
    _id: string
    dpi: number
    spreadLayout?: {
      artboardWidthIn?: number
      artboardHeightIn?: number
    }
  }[]>(`*[_type=="printSpec"]{_id, dpi, spreadLayout}`)

  for (const s of specs) {
    const sl = s.spreadLayout
    if (sl && sl.artboardWidthIn && sl.artboardHeightIn) {
      const widthPx = Math.ceil(sl.artboardWidthIn * s.dpi)
      const heightPx = Math.ceil(sl.artboardHeightIn * s.dpi)
      await sanity
        .patch(s._id)
        .set({
          'spreadLayout.artboardWidthPx': widthPx,
          'spreadLayout.artboardHeightPx': heightPx,
        })
        .unset([
          'spreadLayout.artboardWidthIn',
          'spreadLayout.artboardHeightIn',
        ])
        .commit()
      console.log(`✔ migrated spec ${s._id}`)
    }
  }

  for (const p of products) {
    if (p.printSpec?._ref) continue
    const spec = p.printSpec ?? (p.trimWidthMm && p.trimHeightMm ? {
      trimWidthIn : p.trimWidthMm / 25.4,
      trimHeightIn: p.trimHeightMm / 25.4,
      bleedIn     : 0.125,
      dpi         : 300,
    } : null)
    if (!spec) continue

    const q = `*[_type=="printSpec" && trimWidthIn==$w && trimHeightIn==$h && bleedIn==$b && dpi==$d][0]._id`
    let specId = await sanity.fetch<string|null>(q, {
      w: spec.trimWidthIn,
      h: spec.trimHeightIn,
      b: spec.bleedIn,
      d: spec.dpi,
    })

    if (!specId) {
      specId = `spec-${nanoid()}`
      await sanity.create({ _id: specId, _type: 'printSpec', ...spec })
    }

    await sanity
      .patch(p._id)
      .set({ printSpec: { _type: 'reference', _ref: specId } })
      .unset([
        'trimWidthMm',
        'trimHeightMm',
        'printSpec.trimWidthIn',
        'printSpec.trimHeightIn',
        'printSpec.bleedIn',
        'printSpec.dpi',
      ])
      .commit()

    console.log(`✔ migrated ${p._id} → ${specId}`)
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
