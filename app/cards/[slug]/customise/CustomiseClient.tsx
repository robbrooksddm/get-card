/* app/cards/[slug]/customise/CustomiseClient.tsx
   (replace the whole file with this) */

   "use client";

   import CardEditor from "@/app/components/CardEditor";
   
   export default function CustomiseClient({ tpl }: { tpl: any }) {
     // 1️⃣ keep the old log
     console.log("TPL pages 👉", tpl.pages);
   
     // 2️⃣ NEW: put them on window so we can inspect in DevTools
     if (typeof window !== "undefined") {
       (window as any).tplPages = tpl.pages;
     }
   
     // 3️⃣ use customer mode so shoppers get the streamlined editor
     return (
       <CardEditor initialPages={tpl.pages} printSpec={tpl.printSpec} mode="customer" />
     );
   }