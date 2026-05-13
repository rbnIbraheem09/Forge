const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { registerForgeProtocol, handleForgeProtocol } = require('./protocol')
const { registerSettingsHandlers } = require('./ipc/settings')
const { registerInboxHandlers } = require('./ipc/inbox')
const { registerMainGensHandlers } = require('./ipc/main-gens')
const { registerIterationsHandlers } = require('./ipc/iterations')
const { registerLorasHandlers } = require('./ipc/loras')
const { registerModelsHandlers } = require('./ipc/models')
const { registerDashboardHandlers } = require('./ipc/dashboard')
const { registerSearchHandlers } = require('./ipc/search')
const { registerPromptLibraryHandlers } = require('./ipc/prompt-library')
const { registerPromptChatHandlers } = require('./ipc/prompt-chat')
const { startOutputScanner, stopOutputScanner } = require('./scanner/output-scanner')
const { scanLorasFolder, scanCheckpointsFolder } = require('./scanner/folder-scanner')
const { getDatabase } = require('./db/database')

registerForgeProtocol()

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e0e0f',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }
}

app.whenReady().then(() => {
  handleForgeProtocol()

  registerSettingsHandlers()
  registerInboxHandlers()
  registerMainGensHandlers()
  registerIterationsHandlers()
  registerLorasHandlers()
  registerModelsHandlers()
  registerDashboardHandlers()
  registerSearchHandlers()
  registerPromptLibraryHandlers()
  registerPromptChatHandlers()

  createWindow()

  mainWindow.webContents.once('did-finish-load', () => {
    const db = getDatabase()
    const outputFolder = db.prepare("SELECT value FROM settings WHERE key = 'output_folder'").get()
    if (outputFolder) startOutputScanner(outputFolder.value, mainWindow)

    const lorasFolder = db.prepare("SELECT value FROM settings WHERE key = 'loras_folder'").get()
    if (lorasFolder) scanLorasFolder(lorasFolder.value)

    const checkpointsFolder = db.prepare("SELECT value FROM settings WHERE key = 'checkpoints_folder'").get()
    if (checkpointsFolder) scanCheckpointsFolder(checkpointsFolder.value)
  })

  ipcMain.on('scanner:restart', () => {
    const db = getDatabase()
    const outputFolder = db.prepare("SELECT value FROM settings WHERE key = 'output_folder'").get()
    stopOutputScanner()
    if (outputFolder) startOutputScanner(outputFolder.value, mainWindow)
  })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('window-all-closed', () => {
  stopOutputScanner()
  if (process.platform !== 'darwin') app.quit()
})
