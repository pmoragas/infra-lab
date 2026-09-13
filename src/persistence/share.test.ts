import { describe, it, expect } from 'vitest'
import { decodeProject, encodeProject } from './share'
import { wlsProject } from '../engine/fixtures'

describe('share links', () => {
  it('encode → decode is a round trip and the payload is URL-safe', async () => {
    const p = { ...wlsProject(3, { lb: { algorithm: 'leastConnections' } }), failures: [{ id: 'f1', kind: 'kill' as const, target: 's1', atMs: 1000, durationMs: 2000, factor: 1 }] }
    const data = await encodeProject(p)
    expect(data).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await decodeProject(data)).toEqual(p)
  })

  it('compresses: the payload is much shorter than the JSON', async () => {
    const p = wlsProject(20)
    expect((await encodeProject(p)).length).toBeLessThan(JSON.stringify(p).length / 3)
  })

  it('rejects anything that is not a shared project', async () => {
    await expect(decodeProject('bm90LWEtcHJvamVjdA')).rejects.toThrow()
  })
})
