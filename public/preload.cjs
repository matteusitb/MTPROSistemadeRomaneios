const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // DB Core
  queryDB: (query, params) => ipcRenderer.invoke('db-query', query, params),
  executeDB: (query, params) => ipcRenderer.invoke('db-execute', query, params),
  saveRomaneio: (data) => ipcRenderer.invoke('save-romaneio', data),
  updateRomaneio: (data) => ipcRenderer.invoke('update-romaneio', data),

  // Backup e Configurações
  backupDB: (destPath) => ipcRenderer.invoke('backup-db', destPath),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openBackupFolder: (folderPath) => ipcRenderer.invoke('open-backup-folder', folderPath),
  getDbInfo: () => ipcRenderer.invoke('get-db-info'),
  getBackupConfig: () => ipcRenderer.invoke('get-backup-config'),
  setBackupConfig: (config) => ipcRenderer.invoke('set-backup-config', config),

  // Reset do banco (preserva espécies)
  resetRomaneiosDB: () => ipcRenderer.invoke('reset-romaneios-db'),

  // Hardware ID para licenciamento
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
});
