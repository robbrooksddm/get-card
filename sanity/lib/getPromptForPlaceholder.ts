/**********************************************************************
 * sanity/lib/getPromptForPlaceholder.ts
 * Returns prompt-metadata for an aiPlaceholder doc
 *********************************************************************/
import { sanity } from './client'

/** Everything the variants endpoint needs */
export interface PlaceholderPrompt {
  prompt    : string
  version   : string            //  _updatedAt (for cache-busting)
  refUrl?   : string            //  CDN URL for the template PNG (may be undefined)
  ratio     : '1:1' | '3:2' | '2:3'
  quality   : 'low' | 'medium' | 'high' | 'auto'
  background: 'transparent' | 'opaque' | 'auto'
  faceSwap  : boolean
}

/*───────────────────────────────────────────────────────────────────*/
export async function getPromptForPlaceholder(
  id: string,
): Promise<PlaceholderPrompt> {
  const query = /* groq */ `
    *[_type == "aiPlaceholder" && _id == $id][0]{
      "prompt"    : prompt,
      "version"   : _updatedAt,
      "refUrl"    : refImage.asset->url,
      "ratio"     : coalesce(ratio,      "1:1"),
      "quality"   : coalesce(quality,    "medium"),
      "background": coalesce(background, "transparent"),
    "faceSwap"  : coalesce(doFaceSwap, true)
  }
  `
  console.log('[GROQ]', query)
  console.log('[PARAMS]', { id })
  return sanity.fetch(query, { id })
}