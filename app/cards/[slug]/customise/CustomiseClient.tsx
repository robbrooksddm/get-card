"use client";

/**
 * Client wrapper for the customer-facing editor.
 * Only used for previewing templates, so we keep things simple
 * and do not allow saving.
 */

import CardEditor from "@/app/components/CardEditor";

export default function CustomiseClient({ tpl }: { tpl: { pages: any[] } }) {
  // 1️⃣ keep the old log
  console.log("TPL pages 👉", tpl.pages);

  // 2️⃣ NEW: put them on window so we can inspect in DevTools
  if (typeof window !== "undefined") {
    (window as any).tplPages = tpl.pages;
  }

  // 3️⃣ use customer mode so shoppers get the streamlined editor
  return <CardEditor initialPages={tpl.pages} mode="customer" />;
}
