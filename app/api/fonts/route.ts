import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 86400 // cache for 1 day
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const key = process.env.GOOGLE_FONTS_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'Missing GOOGLE_FONTS_API_KEY' }, { status: 500 })
  }
  const res = await fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${key}`)
  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch Google Fonts' }, { status: 500 })
  }
  const data = await res.json()
  const fonts = Array.isArray(data.items)
    ? data.items.map((f: any) => ({ name: f.family, category: f.category }))
    : []
  return NextResponse.json(fonts)
}
