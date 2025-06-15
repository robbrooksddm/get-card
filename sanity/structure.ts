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
      /* ---------------------- Templates branch ------------------ */
      S.listItem()
        .title('Templates')
        .child(
          S.list()
            .title('Templates')
            .items([
              S.listItem()
                .title('All templates')
                .child(cardTemplateList(S)),

              S.listItem()
                .title('By product type')
                .child(
                  S.list()
                    .title('By product type')
                    .items([
                      S.listItem()
                        .title('Greeting Cards')
                        .child(
                          S.documentTypeList('cardTemplate')
                            .title('Greeting Cards')
                            .filter('_type == "cardTemplate" && templateType == "card"')
                            .child((id) => cardTemplateNode(S, id)),
                        ),
                      S.listItem()
                        .title('Mugs')
                        .child(
                          S.documentTypeList('cardTemplate')
                            .title('Mugs')
                            .filter('_type == "cardTemplate" && templateType == "mug"')
                            .child((id) => cardTemplateNode(S, id)),
                        ),
                      S.listItem()
                        .title('Posters')
                        .child(
                          S.documentTypeList('cardTemplate')
                            .title('Posters')
                            .filter('_type == "cardTemplate" && templateType == "poster"')
                            .child((id) => cardTemplateNode(S, id)),
                        ),
                    ]),
                ),

              S.listItem()
                .title('By format')
                .child(
                  S.list()
                    .title('By format')
                    .items([
                      S.listItem()
                        .title('Portrait')
                        .child(
                          S.documentTypeList('cardTemplate')
                            .title('Portrait')
                            .filter(
                              '_type == "cardTemplate" && previewSpec.previewHeightPx > previewSpec.previewWidthPx'
                            )
                            .child((id) => cardTemplateNode(S, id)),
                        ),
                      S.listItem()
                        .title('Landscape')
                        .child(
                          S.documentTypeList('cardTemplate')
                            .title('Landscape')
                            .filter(
                              '_type == "cardTemplate" && previewSpec.previewWidthPx > previewSpec.previewHeightPx'
                            )
                            .child((id) => cardTemplateNode(S, id)),
                        ),
                      S.listItem()
                        .title('Square')
                        .child(
                          S.documentTypeList('cardTemplate')
                            .title('Square')
                            .filter(
                              '_type == "cardTemplate" && previewSpec.previewWidthPx == previewSpec.previewHeightPx'
                            )
                            .child((id) => cardTemplateNode(S, id)),
                        ),
                    ]),
                ),

              S.listItem()
                .title('By occasion')
                .child(
                  S.list()
                    .title('By occasion')
                    .items([
                      S.listItem()
                        .title('Birthday')
                        .child(
                          S.documentTypeList('cardTemplate')
                            .title('Birthday')
                            .filter(
                              '_type == "cardTemplate" && "birthday" in occasion[]->slug.current'
                            )
                            .child((id) => cardTemplateNode(S, id)),
                        ),
                      S.listItem()
                        .title('Wedding')
                        .child(
                          S.documentTypeList('cardTemplate')
                            .title('Wedding')
                            .filter(
                              '_type == "cardTemplate" && "wedding" in occasion[]->slug.current'
                            )
                            .child((id) => cardTemplateNode(S, id)),
                        ),
                      S.listItem()
                        .title('Christmas')
                        .child(
                          S.documentTypeList('cardTemplate')
                            .title('Christmas')
                            .filter(
                              '_type == "cardTemplate" && "christmas" in occasion[]->slug.current'
                            )
                            .child((id) => cardTemplateNode(S, id)),
                        ),
                    ]),
                ),

              S.listItem()
                .title('Drafts / Needs review')
                .child(
                  S.documentTypeList('cardTemplate')
                    .title('Drafts / Needs review')
                    .filter(
                      '_type == "cardTemplate" && (!isLive || _id in path("drafts.**"))'
                    )
                    .child((id) => cardTemplateNode(S, id)),
                ),
            ])
        ),

      S.divider(),

      /* ---------------------- Commerce branch ------------------- */
      S.listItem()
        .title('Commerce')
        .child(
          S.list()
            .title('Commerce')
            .items([
              S.documentTypeListItem('product').title('Products'),
              S.documentTypeListItem('cardProduct').title('Variants'),
              S.documentTypeListItem('printSpec').title('Print specs'),
            ]),
        ),

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
