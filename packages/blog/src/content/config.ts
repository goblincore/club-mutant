import { defineCollection, z } from 'astro:content'

const devlog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()).default([]),
    description: z.string(),
  }),
})

const changelog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    version: z.string(),
    description: z.string(),
  }),
})

export const collections = { devlog, changelog }
