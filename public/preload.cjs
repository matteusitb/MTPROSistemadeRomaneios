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

  // Auto-Update
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  onUpdateChecking: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('update-checking', subscription);
    return () => ipcRenderer.removeListener('update-checking', subscription);
  },
  onUpdateAvailable: (callback) => {
    const subscription = (_, info) => callback(info);
    ipcRenderer.on('update-available', subscription);
    return () => ipcRenderer.removeListener('update-available', subscription);
  },
  onUpdateNotAvailable: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('update-not-available', subscription);
    return () => ipcRenderer.removeListener('update-not-available', subscription);
  },
  onUpdateError: (callback) => {
    const subscription = (_, error) => callback(error);
    ipcRenderer.on('update-error', subscription);
    return () => ipcRenderer.removeListener('update-error', subscription);
  },
  onDownloadProgress: (callback) => {
    const subscription = (_, progress) => callback(progress);
    ipcRenderer.on('download-progress', subscription);
    return () => ipcRenderer.removeListener('download-progress', subscription);
  },
  onUpdateDownloaded: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('update-downloaded', subscription);
    return () => ipcRenderer.removeListener('update-downloaded', subscription);
  },

  // Ativação e Anti-Clonagem
  checkActivationStatus: () => ipcRenderer.invoke('check-activation-status'),
  ativarSistema: (chave) => ipcRenderer.invoke('ativar-sistema', chave)
});

