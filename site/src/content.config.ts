import { defineCollection } from 'astro:content'
import { docsSchema } from '@astrojs/starlight/schema'
import { repoDocsLoader } from './docs/loader'

// Starlight reads the repository `docs/*.md` in place (see docs/site.md#documentation).
export const collections = {
  docs: defineCollection({ loader: repoDocsLoader(), schema: docsSchema() })
}
