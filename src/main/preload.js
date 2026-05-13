const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('forge', {
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    openFolderPicker: () => ipcRenderer.invoke('settings:openFolderPicker'),
  },
  inbox: {
    list: () => ipcRenderer.invoke('inbox:list'),
    count: () => ipcRenderer.invoke('inbox:count'),
    assign: (args) => ipcRenderer.invoke('inbox:assign', args),
    dismiss: (args) => ipcRenderer.invoke('inbox:dismiss', args),
  },
  mainGens: {
    list: () => ipcRenderer.invoke('main-gens:list'),
    get: (id) => ipcRenderer.invoke('main-gens:get', { id }),
    create: (title) => ipcRenderer.invoke('main-gens:create', { title }),
    update: (args) => ipcRenderer.invoke('main-gens:update', args),
    delete: (id) => ipcRenderer.invoke('main-gens:delete', { id }),
    setHero: (id, iterationId) => ipcRenderer.invoke('main-gens:set-hero', { id, iterationId }),
  },
  iterations: {
    list: (mainGenId) => ipcRenderer.invoke('iterations:list', { mainGenId }),
    listAll: () => ipcRenderer.invoke('iterations:list-all'),
    get: (id) => ipcRenderer.invoke('iterations:get', { id }),
    create: (args) => ipcRenderer.invoke('iterations:create', args),
    update: (args) => ipcRenderer.invoke('iterations:update', args),
    delete: (id) => ipcRenderer.invoke('iterations:delete', { id }),
    setLoras: (id, loras) => ipcRenderer.invoke('iterations:set-loras', { id, loras }),
    setCustomFields: (id, fields) => ipcRenderer.invoke('iterations:set-custom-fields', { id, fields }),
  },
  globalFields: {
    list: () => ipcRenderer.invoke('global-fields:list'),
    pin: (key) => ipcRenderer.invoke('global-fields:pin', { key }),
    unpin: (key) => ipcRenderer.invoke('global-fields:unpin', { key }),
  },
  loras: {
    scan: () => ipcRenderer.invoke('loras:scan'),
    list: () => ipcRenderer.invoke('loras:list'),
    get: (id) => ipcRenderer.invoke('loras:get', { id }),
    update: (args) => ipcRenderer.invoke('loras:update', args),
    usage: (args) => ipcRenderer.invoke('loras:usage', args),
    create: (args) => ipcRenderer.invoke('loras:create', args),
    merge: (args) => ipcRenderer.invoke('loras:merge', args),
    addExampleImage: (args) => ipcRenderer.invoke('loras:add-example-image', args),
    removeExampleImage: (exampleId) => ipcRenderer.invoke('loras:remove-example-image', { exampleId }),
    pickExampleImageFile: () => ipcRenderer.invoke('loras:pick-example-image-file'),
  },
  models: {
    scan: () => ipcRenderer.invoke('models:scan'),
    list: () => ipcRenderer.invoke('models:list'),
    get: (id) => ipcRenderer.invoke('models:get', { id }),
    update: (args) => ipcRenderer.invoke('models:update', args),
    usage: (id) => ipcRenderer.invoke('models:usage', { id }),
    create: (args) => ipcRenderer.invoke('models:create', args),
    merge: (args) => ipcRenderer.invoke('models:merge', args),
    addExampleImage: (args) => ipcRenderer.invoke('models:add-example-image', args),
    removeExampleImage: (exampleId) => ipcRenderer.invoke('models:remove-example-image', { exampleId }),
    pickExampleImageFile: () => ipcRenderer.invoke('models:pick-example-image-file'),
  },
  dashboard: {
    stats: () => ipcRenderer.invoke('dashboard:stats'),
    topLoras: () => ipcRenderer.invoke('dashboard:top-loras'),
    topCheckpoints: () => ipcRenderer.invoke('dashboard:top-checkpoints'),
    pinnedMainGens: () => ipcRenderer.invoke('dashboard:pinned-main-gens'),
    starredIterations: () => ipcRenderer.invoke('dashboard:starred-iterations'),
    recentMainGens: () => ipcRenderer.invoke('dashboard:recent-main-gens'),
  },
  search: {
    query: (args) => ipcRenderer.invoke('search:query', args),
  },
  prompt: {
    searchTags: (query, options) => ipcRenderer.invoke('prompt:search-tags', { query, options }),
    libraryStatus: () => ipcRenderer.invoke('prompt:library-status'),
    libraryRefresh: () => ipcRenderer.invoke('prompt:library-refresh'),
    libraryDelete: () => ipcRenderer.invoke('prompt:library-delete'),
  },
  scanner: {
    restart: () => ipcRenderer.send('scanner:restart'),
  },
  on: (channel, callback) => {
    const allowed = ['inbox:new-item', 'prompt:library-progress']
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_e, ...args) => callback(...args))
    }
  },
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback)
  },
})
