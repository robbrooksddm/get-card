import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'printSpec',
  type: 'object',
  title: 'Print specification',
  fields: [
    defineField({
      name: 'trimWidthIn',
      type: 'number',
      title: 'Trim width (inches)',
      validation: r => r.required().positive(),
    }),
    defineField({
      name: 'trimHeightIn',
      type: 'number',
      title: 'Trim height (inches)',
      validation: r => r.required().positive(),
    }),
    defineField({
      name: 'bleedIn',
      type: 'number',
      title: 'Bleed (inches)',
      initialValue: 0.125,
      validation: r => r.required().min(0),
    }),
    defineField({
      name: 'dpi',
      type: 'number',
      title: 'DPI',
      initialValue: 300,
      validation: r => r.required().min(72),
    }),
  ],
  preview: {
    select: {
      w: 'trimWidthIn',
      h: 'trimHeightIn',
      d: 'dpi',
    },
    prepare({w, h, d}) {
      return {
        title: `${w} × ${h} in @ ${d} dpi`,
      }
    },
  },
})
