/**********************************************************************
 * sanity/structure.ts – sidebar + custom document view (v3.88-safe)
 *********************************************************************/

import type {StructureBuilder, StructureResolver} from 'sanity/desk'

/* ------------------------------------------------------------------ */
/* 1️⃣  helper – our 3-tab editor that’s already defined inside
        cardTemplate.ts.  We simply open the document by its id.      */
/* ------------------------------------------------------------------ */
const cardTemplateNode = (S: StructureBuilder, id: string) =>
  S.document()
    .schemaType('cardTemplate')
    .documentId(id)

/* ------------------------------------------------------------------ */
/* 2️⃣  helper – the list of all card templates                       */
/*      (single-select; bulk actions removed for v3.88 compatibility) */
/* ------------------------------------------------------------------ */
const cardTemplateList = (S: StructureBuilder) =>
  S.documentTypeList('cardTemplate')
    .title('Card templates')
    .child((id) => cardTemplateNode(S, id))

/* ------------------------------------------------------------------ */
/* 3️⃣  main sidebar structure                                        */
/* ------------------------------------------------------------------ */
export const structure: StructureResolver = (S: StructureBuilder) =>
  S.list()
    .title('Content')
    .items([
      /* day-to-day documents -------------------------------------- */
      S.listItem()
        .title('Card templates')
        .schemaType('cardTemplate')
        .child(cardTemplateList(S)),

      S.documentTypeListItem('cardProduct').title('Card products'),

      S.documentTypeListItem('sitePage').title('Site pages'),

      /* look-ups & presets tucked into a drawer ------------------- */
      S.listItem()
        .title('Taxonomies')
        .icon(() => '📂' as any)
        .child(
          S.list()
            .title('Taxonomies')
            .items([
              S.documentTypeListItem('occasion'),
              S.documentTypeListItem('audience'),
              S.documentTypeListItem('theme'),
              S.documentTypeListItem('relation'),
              S.divider(),
              S.documentTypeListItem('aiPlaceholder')
                .title('AI face-swap presets'),
            ]),
        ),
    ])