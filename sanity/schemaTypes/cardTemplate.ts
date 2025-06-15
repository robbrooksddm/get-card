/**********************************************************************
 * cardTemplate.ts – master schema for printable greeting-cards
 * 2025-06-09 • bgImage now stores raw URLs in hidden “srcUrl”
 * 2025-06-10 • Pages moved into Basics group (pageLayout group gone)
 * 2025-06-11 • Robust page preview:
 *               – No more React “invalid tag name” crashes
 *               – Thumbnails for Sanity assets **and** temp URLs
 *********************************************************************/

import React from 'react'
import {
  defineType,
  defineField,
  defineArrayMember,
} from 'sanity'
import {ImageIcon} from '@sanity/icons'

/*──────────────── fieldsets ────────────────────────────────────────*/
const fieldsets = [
  {name: 'pageset', title: 'Pages', options: {columns: 1}},
]

/*──────────────── reusable layer members ───────────────────────────*/
const layerMembers = [
  /* locked background image (inline) */
  defineArrayMember({
    type: 'image',
    name: 'bgImage',
    title: 'Background (locked)',
    options: {hotspot: true},
    fields: [{name: 'srcUrl', type: 'url', hidden: true}], // raw-URL mirror
  }),
  defineArrayMember({type: 'editableImage'}),
  defineArrayMember({type: 'editableText'}),
  defineArrayMember({type: 'aiLayer'}),
]

/**********************************************************************
 * helper – resolve page preview media
 *********************************************************************/

type PagePreviewArgs = {
  title: string
  imgAsset?: {_ref: string}
  imgUrl?: string
  text?: string
}

function pagePreviewPrepare({
  title,
  imgAsset,
  imgUrl,
  text,
}: PagePreviewArgs) {
  /* 1 ▸ human-readable page name */
  const pageName =
    title === 'front'
      ? 'Front cover'
      : title === 'inner-L'
        ? 'Inner left'
        : title === 'inner-R'
          ? 'Inner right'
          : 'Back cover'

  /* 2 ▸ thumbnail React node */
  const media: React.ReactNode =
    imgAsset
      ? ({asset: {_ref: imgAsset._ref}} as unknown as React.ReactNode) // let Studio resolve
      : imgUrl
          ? React.createElement('img', {
              src: imgUrl,
              style: {
                objectFit: 'cover',
                width: '100%',
                height: '100%',
                borderRadius: 4,
              },
            })
          : React.createElement(ImageIcon)

  /* 3 ▸ object Sanity expects */
  return {
    title: pageName,
    media,
    subtitle:
      !imgAsset && imgUrl
        ? 'external image'
        : text?.slice(0, 40) || undefined,
  }
}

/*──────────────── schema ───────────────────────────────────────────*/
export default defineType({
  name: 'cardTemplate',
  type: 'document',
  title: 'Card template',

  groups: [
    {name: 'basic', title: 'Basics', default: true},
    {name: 'store', title: 'Store data'},
  ],

  fieldsets,

  fields: [
    /* —— Basics ——————————————————————————— */
    defineField({
      name: 'title',
      type: 'string',
      title: 'Template name',
      group: 'basic',
      validation: r => r.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      title: 'Slug',
      group: 'basic',
      options: {source: 'title', maxLength: 96},
      validation: r => r.required(),
    }),

    defineField({
      name: 'previewSpec',
      type: 'object',
      title: 'Preview canvas',
      group: 'basic',
      fields: [
        {
          name: 'previewWidthPx',
          type: 'number',
          title: 'Width (px)',
          initialValue: 420,
          validation: r => r.required().positive(),
        },
        {
          name: 'previewHeightPx',
          type: 'number',
          title: 'Height (px)',
          initialValue: 580,
          validation: r => r.required().positive(),
        },
        defineField({
          name: 'maxMobileWidthPx',
          type: 'number',
          title: 'Max mobile width (px)',
        }),
      ],
    }),

    /* —— Pages —————————————————————————— */
    defineField({
      name: 'pages',
      title: 'Pages (Front · Inner-L · Inner-R · Back)',
      group: 'basic',
      fieldset: 'pageset',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'page',
          fields: [
            defineField({name: 'name', type: 'string', hidden: true}),
            defineField({name: 'layers', type: 'array', of: layerMembers}),
          ],
          preview: {
             /* grab both the asset ref and the url from the first *image* layer */
 select: {
   title    : 'name',
   imgAsset : 'layers[ type=="image"][0].src.asset',
   imgUrl   : 'layers[ type=="image"][0].srcUrl',
   text     : 'layers[ type=="text" ][0].text',
 },
            prepare: pagePreviewPrepare,
          },
        }),
      ],
      initialValue: [
        {name: 'front', layers: []},
        {name: 'inner-L', layers: []},
        {name: 'inner-R', layers: []},
        {name: 'back', layers: []},
      ],
      validation: r => r.length(4),
    }),

    /* hidden raw JSON mirror */
    defineField({name: 'json', type: 'text', hidden: true}),

    /* —— Store data ———————————————————— */
    defineField({
      name: 'isLive',
      type: 'boolean',
      title: 'Visible in store?',
      group: 'store',
      initialValue: false,
      options: {layout: 'switch'},
      validation: r => r.required(),
    }),
    defineField({
      name: 'products',
      type: 'array',
      title: 'Available as…',
      group: 'store',
      of: [{type: 'reference', to: [{type: 'cardProduct'}]}],
      validation: r =>
        r.min(1).error('Choose at least one product SKU'),
    }),
    defineField({
      name: 'description',
      type: 'text',
      title: 'Product description',
      group: 'store',
      rows: 3,
      validation: r => r.max(300),
    }),

    defineField({
      name: 'coverImage',
      type: 'image',
      title: 'Cover image',
      group: 'store',
      options: { hotspot: true },
    }),

    /* category facets */
    defineField({
      name: 'occasion',
      type: 'array',
      title: 'Occasion',
      group: 'store',
      options: {layout: 'tags'},
      of: [{type: 'reference', to: [{type: 'occasion'}]}],
    }),
    defineField({
      name: 'audience',
      type: 'array',
      title: 'Who’s it for?',
      group: 'store',
      options: {layout: 'tags'},
      of: [{type: 'reference', to: [{type: 'audience'}]}],
    }),
    defineField({
      name: 'theme',
      type: 'array',
      title: 'Theme',
      group: 'store',
      options: {layout: 'tags'},
      of: [{type: 'reference', to: [{type: 'theme'}]}],
    }),
    defineField({
      name: 'relation',
      type: 'array',
      title: 'Relation to buyer (optional)',
      group: 'store',
      options: {layout: 'tags'},
      of: [{type: 'reference', to: [{type: 'relation'}]}],
    }),
  ],
})