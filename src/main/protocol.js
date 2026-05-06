const { protocol, net } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

function registerForgeProtocol() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'forge',
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        bypassCSP: true,
      },
    },
  ])
}

function handleForgeProtocol() {
  protocol.handle('forge', (request) => {
    const url = new URL(request.url)
    // forge://image/absolute/path/to/file.png
    // The pathname will be the file path
    const filePath = decodeURIComponent(url.pathname)
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

module.exports = { registerForgeProtocol, handleForgeProtocol }
