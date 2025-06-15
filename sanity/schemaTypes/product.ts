import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'product',
  type: 'document',
  title: 'Product',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      title: 'Product name',
      validation: r => r.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      title: 'Slug',
      options: { source: 'title', maxLength: 96 },
      validation: r => r.required(),
    }),
    defineField({
      name: 'description',
      type: 'text',
      title: 'Description',
    }),
    defineField({
      name: 'variants',
      type: 'array',
      title: 'Variants',
      of: [{ type: 'reference', to: [{ type: 'cardProduct' }] }],
      validation: r => r.min(1),
    }),
  ],
})
