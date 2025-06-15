/**********************************************************************
 * app/admin/templates/[id]/page.tsx       (SERVER COMPONENT)
 * Admin-side page that loads a template draft and renders the editor.
 * --------------------------------------------------------------------
 * 2025-05-06  server-only; client code lives in ./EditorWrapper.tsx
 * 2025-05-07  ✱ force-dynamic + no FS cache  (fresh data on every hit)
 *********************************************************************/

/* ---- Next.js route-level options -------------------------------- */
export const revalidate = 0               // never read the FS cache
export const dynamic    = 'force-dynamic' // disable the route cache

/* ---- imports ---------------------------------------------------- */
import nextDynamic         from 'next/dynamic'   // ← renamed helper
import {notFound}          from 'next/navigation'
import {sanityPreview}     from '@/sanity/lib/client'
import {getTemplatePages}  from '@/app/library/getTemplatePages'

/* ---- page component -------------------------------------------- */
export default async function AdminTemplatePage({
  params: {id},
}: {
  params: {id: string}
}) {
  /* 1. fetch the *draft* template (404 if missing) */
  const exists = await sanityPreview.fetch(
    `*[_type=="cardTemplate" && (_id==$id || _id==$draft)][0]._id`,
    { id, draft: `drafts.${id}` }
  )
  if (!exists) return notFound();

  const { pages, spec, previewSpec, products } = await getTemplatePages(id)
  console.log('↳ template printSpec', spec)

  /* 2. load the client wrapper *only on the client* */
  const EditorWrapper = nextDynamic(
    () => import('./EditorWrapper'),   // colocated “use client” file
    {ssr: false},
  )

  return (
    <EditorWrapper
      templateId={id}
      initialPages={pages}
      printSpec={spec}
      previewSpec={previewSpec}
      products={products}
    />
  )
}