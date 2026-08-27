export interface RomaneioItem {
  espessura: number;
  largura: number;
  comprimento: number;
  quantidade: number;
  volume_m3: number;
  volume_ml: number;
}

export interface RomaneioPacote {
  numero_pacote: number;
  especie: string;
  total_m3: number;
  total_ml: number;
  itens: RomaneioItem[];
}

export interface RomaneioData {
  cliente: string;
  especie?: string;
  data: string;
  total_m3: number;
  total_ml: number;
  tipo_romaneio?: string;
  pacotes: RomaneioPacote[];
}

export interface BackupConfig {
  autoBackupEnabled?: boolean;
  backupFolder?: string;
  frequency?: string;
  backupHours?: string[];
  lastManualBackup?: string;
  lastAutoBackup?: string;
}

export interface DbInfo {
  path: string;
  sizeBytes: number;
  romaneiosCount: number;
  especiesCount: number;
  pacotesCount: number;
}

export interface ElectronAPI {
  // DB Core
  queryDB: <T = Record<string, unknown>>(query: string, params?: unknown[]) => Promise<{ success: boolean; data?: T[]; error?: string }>;
  executeDB: (query: string, params?: unknown[]) => Promise<{ success: boolean; error?: string }>;
  saveRomaneio: (data: RomaneioData) => Promise<{ success: boolean; error?: string }>;
  updateRomaneio: (data: RomaneioData & { id: number }) => Promise<{ success: boolean; error?: string }>;

  // Backup
  backupDB: (destPath?: string) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
  selectFolder: () => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
  openBackupFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;

  // Info do Banco
  getDbInfo: () => Promise<{ success: boolean } & Partial<DbInfo> & { error?: string }>;

  // Config de Backup
  getBackupConfig: () => Promise<{ success: boolean; config?: BackupConfig; error?: string }>;
  setBackupConfig: (config: Partial<BackupConfig>) => Promise<{ success: boolean; error?: string }>;

  // Reset (preserva espécies)
  resetRomaneiosDB: () => Promise<{ success: boolean; error?: string }>;

  // Hardware ID
  getHardwareId: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
