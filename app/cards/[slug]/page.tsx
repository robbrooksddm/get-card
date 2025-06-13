import { templates } from "@/data/templates";
import { notFound } from "next/navigation";
import { getTemplatePages } from '@/app/library/getTemplatePages'

export default async function Product({ params }: { params: { slug: string } }) {
  const tpl = templates.find((t) => t.slug === params.slug)
  if (!tpl) notFound()
  const data = await getTemplatePages(params.slug)
  const coverImage = data?.coverImage

  return (
    <main className="p-6 flex flex-col items-center">
      <img src={coverImage || tpl.cover} alt="" className="w-64 rounded shadow" />
      <h1 className="text-2xl font-bold mt-4">{tpl.title}</h1>

      <a
        href={`/cards/${tpl.slug}/customise`}
        className="mt-6 px-6 py-2 bg-pink-600 text-white rounded"
      >
        Personalise →
      </a>
    </main>
  );
}
