import type { Project } from '../engine/types'
import { importJson } from './storage'

export const SHARE_PREFIX = '#/s/'

function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(body).arrayBuffer())
}

/** Whole project → deflate → URL-safe base64. No backend: the link is the project. */
export async function encodeProject(project: Project): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(project))
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodeProject(data: string): Promise<Project> {
  const bytes = await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw'))
  return importJson(new TextDecoder().decode(bytes))
}

export async function shareUrl(project: Project): Promise<string> {
  return `${location.href.split('#')[0]}${SHARE_PREFIX}${await encodeProject(project)}`
}
