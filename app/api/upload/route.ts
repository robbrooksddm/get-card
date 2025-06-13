/**********************************************************************
 app/api/upload/route.ts
 *********************************************************************/
import { NextRequest, NextResponse } from 'next/server'
import { sanityWriteClient as sanity } from '@/sanity/lib/client'
import sharp from 'sharp'
export async function POST (req: NextRequest) {
  const data = await req.formData()
  const file = data.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'no file' }, { status: 400 })
  }

  /* 1. convert the File into a Node.js Buffer so Sanity can read it */
  let buffer = Buffer.from(await file.arrayBuffer())

  /* 1b. downscale very large images to keep Fabric stable */
  try {
    const img = sharp(buffer)
    const meta = await img.metadata()
    if ((meta.width ?? 0) > 4000 || (meta.height ?? 0) > 4000) {
      buffer = await img
        .resize({ width: 4000, height: 4000, fit: 'inside' })
        .toBuffer()
    }
  } catch (err) {
    console.error('[upload] resize failed', err)
  }

  /* 2. push it straight into Sanity’s asset pipeline */
  const asset = await sanity.assets.upload('image', buffer, {
    filename    : file.name,
    contentType : file.type,
    label       : 'temp-upload',   // 👈 optional “tag” we can filter on later
  })

  /* 3. respond with the CDN URL + asset ID */
  return NextResponse.json({ url: asset.url, assetId: asset._id })
}