import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRecorded, LOAD_LIMIT_MS, NotRecorded } from '../api'

const answer = (status: number, body: string) => () => Promise.resolve(new Response(body, { status }))

describe('fetchRecorded', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('a request that never answers stops at the limit and says so', async () => {
    vi.stubGlobal('fetch', (_: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const out = fetchRecorded('/x').catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(LOAD_LIMIT_MS)
    expect(await out).toBe('Stopped waiting after 15 seconds. Check your connection and try again.')
  })
  it('a body that stalls after the headers also stops at the limit', async () => {
    vi.stubGlobal('fetch', (_: string, init: RequestInit) => Promise.resolve({
      ok: true, status: 200,
      json: () => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    }))
    const out = fetchRecorded('/x').catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(LOAD_LIMIT_MS)
    expect(await out).toMatch(/^Stopped waiting/)
  })
  it('only a missing file means not recorded', async () => {
    vi.stubGlobal('fetch', answer(404, ''))
    await expect(fetchRecorded('/x')).rejects.toBeInstanceOf(NotRecorded)
  })
  it('a network failure is not "not recorded", and says what to do', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    const e = await fetchRecorded('/x').catch((x: Error) => x)
    expect(e).not.toBeInstanceOf(NotRecorded)
    expect((e as Error).message).toBe("Couldn't reach FINN. Check your connection and try again.")
  })
  it('a page where the data should be is reported, not parsed', async () => {
    vi.stubGlobal('fetch', answer(200, '<!doctype html>'))
    await expect(fetchRecorded('/x')).rejects.toThrow("The data didn't load properly. Try again.")
  })
  it('a server error is reported as one', async () => {
    vi.stubGlobal('fetch', answer(503, ''))
    await expect(fetchRecorded('/x')).rejects.toThrow('The server returned an error (503). Try again.')
  })
  it('a good file comes back, and leaves no timer running', async () => {
    vi.stubGlobal('fetch', answer(200, '{"a":1}'))
    await expect(fetchRecorded('/x')).resolves.toEqual({ a: 1 })
    expect(vi.getTimerCount()).toBe(0)
  })
})
