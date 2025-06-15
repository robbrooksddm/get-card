/**********************************************************************
 * cardProduct (SKU)
 * One document per BUYABLE variant (size, pages, price …)
 *********************************************************************/
import {defineType, defineField} from 'sanity'

export default defineType({
  name : 'cardProduct',
  type : 'document',
  title: 'Card product',

  fields: [
    /* visible name shown to staff & in checkout */
    defineField({
      name : 'title',
      type : 'string',
      title: 'Product name',
      validation: (Rule) => Rule.required(),
    }),

    /* slug used in URLs (/products/{slug}) */
    defineField({
      name : 'slug',
      type : 'slug',
      title: 'Slug',
      options: {source: 'title', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),

    /* which mockup images define the preview */
    defineField({
      name : 'mockup',
      type : 'reference',
      title: 'Preview mockup',
      to   : [{type: 'productMockup'}],
    }),

    /* commercial bits */
    defineField({
      name : 'price',
      type : 'number',
      title: 'Retail price (£)',
      validation: (Rule) => Rule.required().positive(),
    }),

    /* how the product should be printed */
    defineField({
      name: 'printSpec',
      title: 'Print specification',
      type: 'reference',
      to: [{ type: 'printSpec' }],
      validation: Rule => Rule.required(),
    }),

    /* toggle cropping guides for templates using this SKU */
    defineField({
      name: 'showSafeArea',
      type: 'boolean',
      title: 'Show safe-area overlay',
      initialValue: true,
      description: 'Display the safe-area guide when editing templates',
      options: {layout: 'switch'},
      validation: r => r.required(),
    }),

    defineField({
      name: 'pageCount',
      type: 'number',
      title: 'Pages',
      initialValue: 4,
      validation: R => R.required().integer().min(1).max(4),
    }),
  ],

})
