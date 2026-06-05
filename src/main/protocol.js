const { protocol, nativeImage, app } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { Readable } = require('stream')

const MIME = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
}

// 320px fits 160px-min cards at 2× DPR; aspect ratio is preserved by nativeImage
const THUMB_SIZE = { width: 320, height: 320 }
let thumbCacheDir = null

function getThumbCacheDir() {
  if (!thumbCacheDir) {
    thumbCacheDir = path.join(app.getPath('userData'), 'thumbnails')
    if (!fs.existsSync(thumbCacheDir)) fs.mkdirSync(thumbCacheDir, { recursive: true })
  }
  return thumbCacheDir
}

async function serveThumbnail(filePath) {
  const cachePath = path.join(
    getThumbCacheDir(),
    crypto.createHash('md5').update(filePath).digest('hex') + '.jpg'
  )

  // Cache hit — stream from disk
  if (fs.existsSync(cachePath)) {
    const stream = fs.createReadStream(cachePath)
    stream.on('error', () => stream.destroy())
    return new Response(Readable.toWeb(stream), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' },
    })
  }

  // Cache miss — generate via nativeImage, persist, respond
  try {
    const img = await nativeImage.createThumbnailFromPath(filePath, THUMB_SIZE)
    const jpegBuffer = img.toJPEG(82)
    fs.writeFileSync(cachePath, jpegBuffer)
    return new Response(jpegBuffer, {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}

function registerForgeProtocol() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'forge',
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        bypassCSP: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

function handleForgeProtocol() {
  protocol.handle('forge', async (request) => {
    // Chromium lowercases only the hostname, not the path.
    // forge://thumb/Users/... → slice(8) = 'thumb/Users/...'
    //   slice(5) = '/Users/...' (the '/' between host and path is included)
    // forge:///Users/...   → Chromium normalises empty host: 'users/foo/bar'
    //   '/' + raw gives '/users/...' — macOS case-insensitive FS resolves it
    const raw = request.url.slice(8)

    if (raw.startsWith('thumb/')) {
      const filePath = decodeURIComponent(raw.slice(5))
      return serveThumbnail(filePath)
    }

    const filePath = decodeURIComponent(raw.startsWith('/') ? raw : '/' + raw)
    const ext = path.extname(filePath).toLowerCase()
    const nodeStream = fs.createReadStream(filePath)
    nodeStream.on('error', () => nodeStream.destroy())
    return new Response(Readable.toWeb(nodeStream), {
      headers: {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  })
}

module.exports = { registerForgeProtocol, handleForgeProtocol }
