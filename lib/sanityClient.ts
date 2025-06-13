import {sanity} from '@/sanity/lib/client'

export async function sanityFetch<QueryT>(
  query: string,
  params: Record<string, any> = {},
) {
  console.log('[GROQ]', query)
  console.log('[PARAMS]', params)
  return sanity.fetch<QueryT>(query, params, {
    next: {revalidate: 60},
  })
}
