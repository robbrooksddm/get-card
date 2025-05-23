/**********************************************************************
 * app/lib/getTemplatePages.ts   (—SERVER-ONLY—)
 * Fetch exactly 4 pages from the template draft / published doc and
 * convert every layer with `fromSanity`.
 *********************************************************************/

import { sanityPreview }          from '@/sanity/lib/client'
import {fromSanity}            from '@/app/library/layerAdapters'
import type {TemplatePage}     from '@/app/components/FabricCanvas'

/* ---------- 4-page fallback so the editor always mounts --------- */
const EMPTY: TemplatePage[] = [
  {name: 'front',    layers: []},
  {name: 'inner-L',  layers: []},
  {name: 'inner-R',  layers: []},
  {name: 'back',     layers: []},
]

/**
 * Accepts a route param (`slug` -or- full `_id` -or- `drafts.<id>`).
 * Returns **exactly 4 pages** with all layers converted to editor
 * format.  Never throws – fallbacks to an empty structure instead.
 */
export async function getTemplatePages(
  idOrSlug: string,
): Promise<TemplatePage[]> {
  /* 1 ─ pick the first match by _id or slug */
  const query = /* groq */ `
  *[
    _type == "cardTemplate" &&
    (
      _id == $key      ||
      _id == $draftKey ||
      slug.current == $key
    )
  ][0]{
    pages[]{
      layers[]{
        ...,                       // keep every native field
        // if this layer has a reference called “source”, pull it in-line:
        "source": source->{
          _id,
          prompt,
          refImage                // we only need these three
        }
      }
    }
  }
`

  const params = {
    key:       idOrSlug,
    draftKey:  idOrSlug.startsWith('drafts.') ? idOrSlug : `drafts.${idOrSlug}`,
  }

  const raw = await sanityPreview.fetch<{pages?: any[]}>(query, params)

  const pages = Array.isArray(raw?.pages) && raw.pages.length === 4
    ? raw.pages
    : EMPTY

  const names = ['front', 'inner-L', 'inner-R', 'back'] as const

// ─── DEBUG – show what actually came back from Sanity ───
console.log(
  '\n▶ getTemplatePages raw =\n',
  JSON.stringify(raw, null, 2),
  '\n',
);

  return names.map((name, i) => ({
    name,
    layers: (pages[i]?.layers ?? [])
      .map(fromSanity)     // (Layer | null)[]
      .filter(Boolean),    // Layer[]
  })) as TemplatePage[]
}