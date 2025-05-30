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

    /* commercial bits */
    defineField({
      name : 'price',
      type : 'number',
      title: 'Retail price (£)',
      validation: (Rule) => Rule.required().positive(),
    }),

    /* print specs – the editor can read these if you ever show guides
       per product */
    defineField({name:'trimWidthMm',  type:'number', title:'Trim width (mm)',  validation:(R)=>R.required()}),
    defineField({name:'trimHeightMm', type:'number', title:'Trim height (mm)', validation:(R)=>R.required()}),
    defineField({name:'pageCount',    type:'number', title:'Pages',            initialValue:4, validation:(R)=>R.required().integer().min(1).max(4)}),
  ],
})