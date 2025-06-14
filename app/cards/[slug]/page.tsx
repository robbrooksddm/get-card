import { notFound } from "next/navigation";
import { sanityPreview } from '@/sanity/lib/client'
import { urlFor } from '@/sanity/lib/image'

export default async function Product({ params }: { params: { slug: string } }) {
  const tpl = await sanityPreview.fetch<{
    title: string
    slug: { current: string }
    coverImage?: any
  }>(
    `*[_type=="cardTemplate" && slug.current==$slug][0]{title,slug,coverImage}`,
    { slug: params.slug },
  )
  if (!tpl) notFound()
  const coverImage = tpl.coverImage ? urlFor(tpl.coverImage).url() : undefined

  return (
    <main className="p-6 flex flex-col items-center">
      {coverImage && (
        <img src={coverImage} alt="" className="w-64 rounded shadow" />
      )}
      <h1 className="text-2xl font-bold mt-4">{tpl.title}</h1>

      <a
        href={`/cards/${tpl.slug.current}/customise`}
        className="mt-6 px-6 py-2 bg-pink-600 text-white rounded"
      >
        Personalise →
      </a>
    </main>
  );
}
