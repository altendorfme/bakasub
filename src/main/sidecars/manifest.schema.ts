import { z } from 'zod'

const httpsUrl = z.url().refine((u) => u.startsWith('https://'), 'URL must be https')

const artifact = z.object({
  url: httpsUrl,
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  archiveType: z.enum(['zip', '7z', 'appimage']),
  binaryRelativePath: z.string().min(1)
})

const tool = z.object({
  name: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  version: z.string().min(1),
  executableName: z.string().min(1),
  /** artifacts[platform][arch], ex.: artifacts.linux.x64 */
  artifacts: z.record(z.string(), z.record(z.string(), artifact))
})

export const sidecarManifestSchema = z.object({
  updatedAt: z.string().min(1),
  tools: z.array(tool).min(1)
})

export type SidecarManifest = z.infer<typeof sidecarManifestSchema>
export type SidecarToolManifest = SidecarManifest['tools'][number]
export type SidecarArtifact = z.infer<typeof artifact>
