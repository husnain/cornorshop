'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  auth: {
    login: (data) => ipcRenderer.invoke('auth:login', data),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser')
  },

  products: {
    getAll: () => ipcRenderer.invoke('products:getAll'),
    create: (data) => ipcRenderer.invoke('products:create', data),
    update: (data) => ipcRenderer.invoke('products:update', data),
    delete: (id) => ipcRenderer.invoke('products:delete', id),
    search: (query) => ipcRenderer.invoke('products:search', query),
    getByBarcode: (barcode) => ipcRenderer.invoke('products:getByBarcode', barcode),
    bulkImport: (data) => ipcRenderer.invoke('products:bulkImport', data)
  },

  categories: {
    getAll: () => ipcRenderer.invoke('categories:getAll'),
    create: (data) => ipcRenderer.invoke('categories:create', data)
  },

  suppliers: {
    getAll: () => ipcRenderer.invoke('suppliers:getAll'),
    create: (data) => ipcRenderer.invoke('suppliers:create', data)
  },

  deliveries: {
    getAll: () => ipcRenderer.invoke('deliveries:getAll'),
    create: (data) => ipcRenderer.invoke('deliveries:create', data),
    getById: (id) => ipcRenderer.invoke('deliveries:getById', id)
  },

  sales: {
    create: (data) => ipcRenderer.invoke('sales:create', data),
    getAll: () => ipcRenderer.invoke('sales:getAll'),
    getById: (id) => ipcRenderer.invoke('sales:getById', id),
    getByDate: (data) => ipcRenderer.invoke('sales:getByDate', data)
  },

  dashboard: {
    getStats: () => ipcRenderer.invoke('dashboard:getStats')
  },

  reports: {
    getDailyReport: (date) => ipcRenderer.invoke('reports:getDailyReport', date),
    getSalesReport: (data) => ipcRenderer.invoke('reports:getSalesReport', data)
  },

  users: {
    getAll: () => ipcRenderer.invoke('users:getAll'),
    create: (data) => ipcRenderer.invoke('users:create', data),
    update: (data) => ipcRenderer.invoke('users:update', data),
    delete: (id) => ipcRenderer.invoke('users:delete', id)
  },

  receipt: {
    print: (data) => ipcRenderer.invoke('receipt:print', data)
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (data) => ipcRenderer.invoke('settings:set', data)
  },

  waste: {
    log: (data) => ipcRenderer.invoke('waste:log', data),
    getAll: () => ipcRenderer.invoke('waste:getAll')
  },

  license: {
    check: () => ipcRenderer.invoke('license:check'),
    importFile: () => ipcRenderer.invoke('license:importFile'),
    getMachineId: () => ipcRenderer.invoke('license:getMachineId')
  }
})
