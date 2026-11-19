import { describe, expect, it } from 'vitest'
import { currentJobId, runWithJob } from './job-context'

describe('job context', () => {
  it('the job id follows awaits and timers started inside the job', async () => {
    expect(currentJobId()).toBeUndefined()
    const seen = await runWithJob('j1', async () => {
      await Promise.resolve()
      const later = await new Promise<string | undefined>((r) =>
        setTimeout(() => r(currentJobId()), 1)
      )
      return [currentJobId(), later]
    })
    expect(seen).toEqual(['j1', 'j1'])
    expect(currentJobId()).toBeUndefined()
  })

  it('concurrent jobs keep their own id', async () => {
    const run = (id: string, ms: number): Promise<string | undefined> =>
      runWithJob(id, () => new Promise((r) => setTimeout(() => r(currentJobId()), ms)))
    expect(await Promise.all([run('a', 5), run('b', 1)])).toEqual(['a', 'b'])
  })
})
