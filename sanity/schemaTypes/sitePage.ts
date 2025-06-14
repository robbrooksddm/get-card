import {defineArrayMember, defineField, defineType} from 'sanity'

export default defineType({
  name: 'sitePage',
  type: 'document',
  title: 'Site page',
  fields: [
    defineField({name: 'title', type: 'string', validation: r => r.required()}),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: r => r.required(),
    }),
    defineField({
      name: 'sections',
      type: 'array',
      of: [
        defineArrayMember({type: 'heroSection'}),
      ],
    }),
  ],
})
