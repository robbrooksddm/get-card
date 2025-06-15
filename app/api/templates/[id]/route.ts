/**********************************************************************
 * PATCH / POST /api/templates/[id]
 * -------------------------------------------------------------------
 * • Always writes to the **draft** (id prefixed with `drafts.`)
 * • If the draft doesn’t exist we create a stub, then patch.
 * • Keeps each page’s `name` so Studio previews show the right titles.
 *********************************************************************/

import { NextRequest, NextResponse } from 'next/server'
import { sanityWriteClient as sanity } from '@/sanity/lib/client'
import { toSanity } from '@/app/library/layerAdapters'
import type { PrintSpec } from '@/app/components/FabricCanvas'

const FALLBACK_NAMES = ['front', 'inner-L', 'inner-R', 'back'] as const

/* ------------------------------------------------------------------ */
/* shared helper – normalises the page array                           */
/* ------------------------------------------------------------------ */
function normalisePages(
  pagesRaw: any[],
  spec: PrintSpec,
): { name: string; layers: any[] }[] {
  return pagesRaw.map((p, i) => ({
    name:   typeof p?.name === 'string' && p.name.trim()
              ? p.name.trim()
              : FALLBACK_NAMES[i] ?? `page-${i}`,
    layers: Array.isArray(p?.layers) ? p.layers.map(l => toSanity(l, spec)) : [],
  }))
}

/* ------------------------------------------------------------------ */
/* route handler                                                      */
/* ------------------------------------------------------------------ */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    /* ---------- 1 ▸ validate body ----------------------------- */
    const { pages, coverImage } = (await req.json()) as {
      pages: any
      coverImage?: string
    }
    if (!Array.isArray(pages) || pages.length !== 4) {
      return NextResponse.json(
        { error: '`pages` must be an array with exactly four items' },
        { status: 400 },
      )
    }
    if (!pages.every(p => Array.isArray(p?.layers))) {
      return NextResponse.json(
        { error: 'Each page object must contain a `layers` array' },
        { status: 400 },
      )
    }

    const specRes = await sanity.fetch<{spec: PrintSpec | null}>(
      `*[_type=="cardTemplate" && _id==$id][0]{"spec":coalesce(products[0]->printSpec->, products[0]->printSpec)}`,
      { id: params.id }
    )
    const spec = specRes?.spec || {
      trimWidthIn : 5,
      trimHeightIn: 7,
      bleedIn     : 0.125,
      dpi         : 300,
    }

    const sanePages = normalisePages(pages, spec)
    /* dev-log AFTER validation, so the console is tidy */
    console.log('▶ sanePages →', JSON.stringify(sanePages, null, 2))

    /* ---------- 2 ▸ draft id ---------------------------------- */
    const draftId = `drafts.${params.id}`

    /* ---------- 3 ▸ create-or-patch in one transaction -------- */
    await sanity
      .transaction()
      .createIfNotExists({
        _id  : draftId,
        _type: 'cardTemplate',
        title: '(untitled)',   // minimal stub so Studio is happy
        pages: [],
      })
      .patch(draftId, p =>
        p.set({
          pages: sanePages,
          json : JSON.stringify(pages), // raw mirror – round-trip safety-net
          ...(coverImage && {
            coverImage: {
              _type: 'image',
              asset: { _type: 'reference', _ref: coverImage },
            },
          }),
        }),
      )
      .commit({ autoGenerateArrayKeys: true })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[save-template]', err)
    return NextResponse.json({ error: 'server' }, { status: 500 })
  }
}

/* Allow POST as an alias for PATCH (the editor still uses POST) */
export const POST = PATCH