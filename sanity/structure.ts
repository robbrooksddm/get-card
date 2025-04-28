// sanity/structure.ts
import type {StructureResolver} from 'sanity/structure'

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      /* the only doc type we actually have right now */
      S.documentTypeListItem('cardTemplate').title('Card templates'),

      /* keep this – it shows any future types you add */
      S.divider(),
      ...S.documentTypeListItems().filter(
        (item) =>
          item.getId() && !['cardTemplate'].includes(item.getId()!),
      ),
    ])