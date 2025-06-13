/**********************************************************************
 * cards/[slug]/customise/page.tsx
 *********************************************************************/

import CustomiseClient from "./CustomiseClient";
import { getTemplatePages } from '@/app/library/getTemplatePages'

// Ensure the latest draft is fetched on every visit
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Path: app/cards/[slug]/customise/page.tsx
// This is a **server component**. In Next 15 `params` is a Promise, so we need to
// unwrap it with `await` before we read `slug`.

export default async function CustomisePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // 🡇 open the "params" gift‑box and pull out slug
  const { slug } = await params;

  const { pages } = await getTemplatePages(slug)
  console.log('SERVER tpl.pages =', pages)

  return <CustomiseClient tpl={{ pages }} />;
}
