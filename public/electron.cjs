const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { autoUpdater } = require('electron-updater');

let db;
let mainWindow;

// --- SEGURANÇA E ATIVAÇÃO ---
let sistemaAtivado = false;
let motivoBloqueio = 'unactivated';

const _s = [77, 65, 68, 69, 73, 82, 65, 50, 48, 50, 54]; // MADEIRA2026
const MEU_SEGREDO = process.env.APP_SECRET || String.fromCharCode(..._s);

function criptografar(texto) {
  const key = crypto.createHash('sha256').update(MEU_SEGREDO).digest();
  const iv = crypto.createHash('md5').update(MEU_SEGREDO).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let crypted = cipher.update(texto, 'utf8', 'hex');
  crypted += cipher.final('hex');
  return crypted;
}

function descriptografar(texto) {
  try {
    const key = crypto.createHash('sha256').update(MEU_SEGREDO).digest();
    const iv = crypto.createHash('md5').update(MEU_SEGREDO).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let dec = decipher.update(texto, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (e) {
    return null;
  }
}

async function verificarLicencaLocal() {
  const appData = app.getPath('userData');
  const pastaBase = path.join(appData, 'romaneio-madeira');
  const arquivoLicenca = path.join(pastaBase, 'license.dat');

  if (fs.existsSync(arquivoLicenca)) {
    try {
      const conteudoCriptografado = fs.readFileSync(arquivoLicenca, 'utf-8');
      const conteudoJson = descriptografar(conteudoCriptografado);

      if (!conteudoJson) {
        sistemaAtivado = false;
        motivoBloqueio = 'unactivated';
        return false;
      }

      const licenca = JSON.parse(conteudoJson);
      const machineId = getHardwareId();

      // 1. Valida ID da Máquina
      if (licenca.mid !== machineId) {
        console.error("Máquina não autorizada para esta licença.");
        sistemaAtivado = false;
        motivoBloqueio = 'unactivated';
        return false;
      }

      const agora = new Date();
      const exp = new Date(licenca.exp);
      const lastSeen = licenca.last_seen ? new Date(licenca.last_seen) : null;

      // 2. Verifica Expiração
      if (agora > exp) {
        console.error(`Licença expirou em: ${licenca.exp}`);
        sistemaAtivado = false;
        motivoBloqueio = 'expired';
        return false;
      }

      // 3. ANTI-FRAUDE: Relógio Retrocedido (comparando com last_seen da licença)
      if (lastSeen && agora < lastSeen) {
        console.error("🚨 DETECÇÃO DE FRAUDE: Relógio do computador retrocedido!");
        sistemaAtivado = false;
        motivoBloqueio = 'fraud';
        return false;
      }

      // 4. ANTI-FRAUDE: Relógio Retrocedido (comparando com a maior data de romaneio salva no banco)
      if (db) {
        try {
          const stmt = db.prepare("SELECT data FROM romaneios ORDER BY data DESC LIMIT 1");
          let result = [];
          while (stmt.step()) {
            result.push(stmt.getAsObject());
          }
          stmt.free();
          
          if (result.length > 0 && result[0].data) {
            const dataUltimoRomaneio = new Date(result[0].data + "T12:00:00");
            const hojeSemHora = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
            const romaneioSemHora = new Date(dataUltimoRomaneio.getFullYear(), dataUltimoRomaneio.getMonth(), dataUltimoRomaneio.getDate());
            
            if (hojeSemHora < romaneioSemHora) {
              console.error("🚨 DETECÇÃO DE FRAUDE: O relógio do computador é anterior à data do último romaneio salvo no banco de dados!");
              sistemaAtivado = false;
              motivoBloqueio = 'fraud';
              return false;
            }
          }
        } catch (e) {
          // Ignora
        }
      }

      licenca.last_seen = agora.toISOString();
      fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(licenca)));

      sistemaAtivado = true;
      motivoBloqueio = 'ok';
      return true;

    } catch (err) {
      console.error("Erro ao verificar licença:", err.message);
      sistemaAtivado = false;
      motivoBloqueio = 'unactivated';
      return false;
    }
  }

  sistemaAtivado = false;
  motivoBloqueio = 'unactivated';
  return false;
}

function protectedHandle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!sistemaAtivado) {
      console.warn(`Tentativa de acesso ao canal protegido '${channel}' sem ativação ativa.`);
      return { success: false, error: 'Sistema bloqueado. Por favor, ative a licença de uso do sistema.' };
    }
    return callback(event, ...args);
  });
}

async function initDB() {
  const SQL = await initSqlJs();
  const dbPath = path.join(app.getPath('userData'), 'romaneios.sqlite');
  
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
    // Initialize schema
    db.run(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS especies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cientifico TEXT
      );
      CREATE TABLE IF NOT EXISTS romaneios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        cliente_id INTEGER,
        especie_id INTEGER,
        total_m3 REAL,
        total_ml REAL,
        status TEXT
      );
      CREATE TABLE IF NOT EXISTS romaneio_pacotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        romaneio_id INTEGER,
        numero_pacote INTEGER,
        total_m3 REAL,
        total_ml REAL,
        especie_id INTEGER
      );
      CREATE TABLE IF NOT EXISTS romaneio_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pacote_id INTEGER,
        espessura REAL,
        largura REAL,
        comprimento REAL,
        quantidade INTEGER,
        volume_m3 REAL,
        volume_ml REAL
      );
    `);
  }

  // Garantir a tabela de licença local para suporte a login offline
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS licenca_local (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        status_licenca TEXT NOT NULL,
        data_validade TEXT,
        senha_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        ultimo_login TEXT
      );
    `);
  } catch (e) {
    console.error('Erro ao criar tabela licenca_local:', e.message);
  }

  // Executar migrações seguras no banco já existente
  try {
    db.run(`ALTER TABLE especies ADD COLUMN cientifico TEXT`);
  } catch (e) {
    // Coluna já existe, ignora
  }

  try {
    db.run(`ALTER TABLE romaneio_pacotes ADD COLUMN especie_id INTEGER`);
  } catch (e) {
    // Coluna já existe, ignora
  }

  try {
    db.run(`ALTER TABLE romaneios ADD COLUMN tipo_romaneio TEXT DEFAULT 'padrao'`);
  } catch (e) {
    // Coluna já existe, ignora
  }

  // Verificar se a tabela especies precisa ser populada com o dump oficial
  try {
    let dumpJaRodou = false;
    try {
      const checkAmapa = db.exec("SELECT id FROM especies WHERE nome = 'Amapá'");
      dumpJaRodou = checkAmapa.length > 0 && checkAmapa[0].values.length > 0;
    } catch (e) {
      dumpJaRodou = false;
    }
    
    if (!dumpJaRodou) {
      const pathsToTry = [
        path.join(app.getAppPath(), '..', 'especies.sql'),
        path.join(app.getAppPath(), 'especies.sql'),
        path.join(process.cwd(), 'especies.sql'),
        path.join(process.cwd(), '..', 'especies.sql'),
        'especies.sql'
      ];
      
      let sqlPath = '';
      for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
          sqlPath = p;
          break;
        }
      }

      if (sqlPath) {
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        db.run("DROP TABLE IF EXISTS especies");
        db.run(sqlContent);
        console.log(`Tabela especies dropada e populada com sucesso a partir de ${sqlPath}`);
      } else {
        console.warn('Arquivo especies.sql não foi encontrado nos caminhos buscados.');
      }
    }
  } catch (err) {
    console.error('Erro ao verificar ou popular a tabela especies:', err.message);
  }

  saveDB();
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbPath = path.join(app.getPath('userData'), 'romaneios.sqlite');
  fs.writeFileSync(dbPath, buffer);
}

function getDbFilePath() {
  return path.join(app.getPath('userData'), 'romaneios.sqlite');
}

// ─── CONFIG DE BACKUP ────────────────────────────────────────────────────────

function getBackupConfigPath() {
  return path.join(app.getPath('userData'), 'backup-config.json');
}

function readBackupConfig() {
  const cfgPath = getBackupConfigPath();
  if (fs.existsSync(cfgPath)) {
    try {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function writeBackupConfig(config) {
  fs.writeFileSync(getBackupConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

function doAutoBackup() {
  const cfg = readBackupConfig();
  if (!cfg.autoBackupEnabled || !cfg.backupFolder) return;
  const backupFolder = cfg.backupFolder;
  if (!fs.existsSync(backupFolder)) {
    try { fs.mkdirSync(backupFolder, { recursive: true }); } catch (e) { return; }
  }
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destPath = path.join(backupFolder, `romaneios_backup_${ts}.sqlite`);
  try {
    saveDB();
    fs.copyFileSync(getDbFilePath(), destPath);
    writeBackupConfig({ ...cfg, lastAutoBackup: now.toISOString() });
    console.log(`[Auto-Backup] Backup realizado: ${destPath}`);
  } catch (e) {
    console.error('[Auto-Backup] Falha:', e.message);
  }
}

function scheduleAutoBackup() {
  // Checagem roda a cada 30 segundos para não perder o minuto exato
  setInterval(() => {
    const c = readBackupConfig();
    if (!c.autoBackupEnabled || !c.backupFolder) return;
    
    // Prioridade: se o usuário configurou horários específicos (ex: ["18:00", "12:00"])
    if (c.backupHours && Array.isArray(c.backupHours) && c.backupHours.length > 0) {
      const now = new Date();
      // Pega hora e minuto atual no formato local
      const currentHourMinute = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      
      if (c.backupHours.includes(currentHourMinute)) {
        // Para evitar disparar várias vezes no mesmo minuto
        if (c.lastAutoBackup) {
          const last = new Date(c.lastAutoBackup);
          if (now - last < 5 * 60 * 1000) return; // Só roda se o último foi há mais de 5 minutos
        }
        doAutoBackup();
      }
    } else {
      // Fallback: Lógica legada de frequência (ex: a cada 24h)
      const frequencyHours = { 'diario': 24, 'semanal': 168, 'quinzenal': 360, 'mensal': 720 };
      const h = (frequencyHours[c.frequency] || 24) * 60 * 60 * 1000;
      if (c.lastAutoBackup) {
        if (new Date() - new Date(c.lastAutoBackup) >= h) doAutoBackup();
      } else {
        doAutoBackup();
      }
    }
  }, 30 * 1000); // 30 segundos
}

// ─── APP INIT ────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    Menu.setApplicationMenu(null);
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  await initDB();
  await verificarLicencaLocal();
  scheduleAutoBackup();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: DB QUERY ───────────────────────────────────────────────────────────

protectedHandle('db-query', (event, query, params) => {
  try {
    const stmt = db.prepare(query);
    if (params) {
      stmt.bind(params);
    }
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return { success: true, data: results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('db-execute', (event, query, params) => {
  try {
    if (params) {
      const stmt = db.prepare(query);
      stmt.run(params);
      stmt.free();
    } else {
      db.run(query);
    }
    saveDB();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Helper to get or insert
function getOrInsert(tableName, nome) {
  let stmt = db.prepare(`SELECT id FROM ${tableName} WHERE nome = ?`);
  stmt.bind([nome]);
  if (stmt.step()) {
    const id = stmt.getAsObject().id;
    stmt.free();
    return id;
  }
  stmt.free();
  
  db.run(`INSERT INTO ${tableName} (nome) VALUES (?)`, [nome]);
  const res = db.exec("SELECT last_insert_rowid() as id");
  return res[0].values[0][0];
}

// Helper to get or insert especie (case-insensitive)
function getOrInsertEspecie(nome) {
  if (!nome) return null;
  const cleanNome = nome.trim();
  if (!cleanNome) return null;
  
  let stmt = db.prepare(`SELECT id FROM especies WHERE LOWER(nome) = LOWER(?)`);
  stmt.bind([cleanNome]);
  if (stmt.step()) {
    const id = stmt.getAsObject().id;
    stmt.free();
    return id;
  }
  stmt.free();
  
  db.run(`INSERT INTO especies (nome) VALUES (?)`, [cleanNome]);
  const res = db.exec("SELECT last_insert_rowid() as id");
  return res[0].values[0][0];
}

protectedHandle('save-romaneio', (event, data) => {
  try {
    const cliente_id = getOrInsert('clientes', data.cliente);

    let firstEspecieId = null;
    if (data.pacotes && data.pacotes.length > 0) {
      firstEspecieId = getOrInsertEspecie(data.pacotes[0].especie);
    }

    db.run(
      `INSERT INTO romaneios (data, cliente_id, especie_id, total_m3, total_ml, status, tipo_romaneio) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.data, cliente_id, firstEspecieId, data.total_m3, data.total_ml, 'Ativo', data.tipo_romaneio || 'padrao']
    );
    const romaneio_id = db.exec("SELECT last_insert_rowid()")[0].values[0][0];

    data.pacotes.forEach(p => {
      const especie_id = getOrInsertEspecie(p.especie);
      db.run(
        `INSERT INTO romaneio_pacotes (romaneio_id, numero_pacote, total_m3, total_ml, especie_id) VALUES (?, ?, ?, ?, ?)`,
        [romaneio_id, p.numero_pacote, p.total_m3, p.total_ml, especie_id]
      );
      const pacote_id = db.exec("SELECT last_insert_rowid()")[0].values[0][0];

      p.itens.forEach(item => {
        db.run(
          `INSERT INTO romaneio_itens (pacote_id, espessura, largura, comprimento, quantidade, volume_m3, volume_ml) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [pacote_id, item.espessura, item.largura, item.comprimento, item.quantidade, item.volume_m3, item.volume_ml]
        );
      });
    });

    saveDB();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('update-romaneio', (event, data) => {
  try {
    const { id } = data;

    const cliente_id = getOrInsert('clientes', data.cliente);

    let firstEspecieId = null;
    if (data.pacotes && data.pacotes.length > 0) {
      firstEspecieId = getOrInsertEspecie(data.pacotes[0].especie);
    }

    db.run(
      `UPDATE romaneios SET data = ?, cliente_id = ?, especie_id = ?, total_m3 = ?, total_ml = ?, tipo_romaneio = ? WHERE id = ?`,
      [data.data, cliente_id, firstEspecieId, data.total_m3, data.total_ml, data.tipo_romaneio || 'padrao', id]
    );

    const oldPackages = db.exec(`SELECT id FROM romaneio_pacotes WHERE romaneio_id = ${id}`);
    if (oldPackages.length > 0) {
      const pacoteIds = oldPackages[0].values.map(v => v[0]);
      pacoteIds.forEach(pid => {
        db.run(`DELETE FROM romaneio_itens WHERE pacote_id = ${pid}`);
      });
    }
    db.run(`DELETE FROM romaneio_pacotes WHERE romaneio_id = ${id}`);

    data.pacotes.forEach(p => {
      const especie_id = getOrInsertEspecie(p.especie);
      db.run(
        `INSERT INTO romaneio_pacotes (romaneio_id, numero_pacote, total_m3, total_ml, especie_id) VALUES (?, ?, ?, ?, ?)`,
        [id, p.numero_pacote, p.total_m3, p.total_ml, especie_id]
      );
      const pacote_id = db.exec("SELECT last_insert_rowid()")[0].values[0][0];

      p.itens.forEach(item => {
        db.run(
          `INSERT INTO romaneio_itens (pacote_id, espessura, largura, comprimento, quantidade, volume_m3, volume_ml) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [pacote_id, item.espessura, item.largura, item.comprimento, item.quantidade, item.volume_m3, item.volume_ml]
        );
      });
    });

    saveDB();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: BACKUP MANUAL ─────────────────────────────────────────────────────

protectedHandle('backup-db', async (event, destPath) => {
  try {
    saveDB();
    const src = getDbFilePath();
    let finalDest = destPath;
    if (!finalDest) {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Salvar Backup do Banco de Dados',
        defaultPath: path.join(
          app.getPath('documents'),
          `romaneios_backup_${new Date().toISOString().slice(0, 10)}.sqlite`
        ),
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
      });
      if (canceled || !filePath) return { success: false, canceled: true };
      finalDest = filePath;
    }
    fs.copyFileSync(src, finalDest);
    const cfg = readBackupConfig();
    writeBackupConfig({ ...cfg, lastManualBackup: new Date().toISOString() });
    return { success: true, path: finalDest };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: SELECIONAR PASTA ──────────────────────────────────────────────────

protectedHandle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar Pasta para Backup Automático',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || filePaths.length === 0) return { success: false, canceled: true };
  return { success: true, path: filePaths[0] };
});

// ─── IPC: ABRIR PASTA ───────────────────────────────────────────────────────

protectedHandle('open-backup-folder', async (event, folderPath) => {
  try {
    if (folderPath && fs.existsSync(folderPath)) {
      await shell.openPath(folderPath);
      return { success: true };
    }
    return { success: false, error: 'Pasta não encontrada ou não configurada' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: INFO DO BANCO ─────────────────────────────────────────────────────

protectedHandle('get-db-info', () => {
  try {
    const dbPath = getDbFilePath();
    let sizeBytes = 0;
    if (fs.existsSync(dbPath)) sizeBytes = fs.statSync(dbPath).size;
    const romaneiosCount = db.exec('SELECT COUNT(*) FROM romaneios')[0]?.values[0][0] || 0;
    const especiesCount = db.exec('SELECT COUNT(*) FROM especies')[0]?.values[0][0] || 0;
    const pacotesCount = db.exec('SELECT COUNT(*) FROM romaneio_pacotes')[0]?.values[0][0] || 0;
    return { success: true, path: dbPath, sizeBytes, romaneiosCount, especiesCount, pacotesCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: CONFIG BACKUP ─────────────────────────────────────────────────────

protectedHandle('get-backup-config', () => {
  try {
    return { success: true, config: readBackupConfig() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('set-backup-config', (event, config) => {
  try {
    writeBackupConfig({ ...readBackupConfig(), ...config });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: RESETAR BANCO (preserva espécies) ─────────────────────────────────

protectedHandle('reset-romaneios-db', () => {
  try {
    db.run('DELETE FROM romaneio_itens');
    db.run('DELETE FROM romaneio_pacotes');
    db.run('DELETE FROM romaneios');
    db.run('DELETE FROM clientes');
    try {
      db.run("DELETE FROM sqlite_sequence WHERE name IN ('romaneios','romaneio_pacotes','romaneio_itens','clientes')");
    } catch (e) { /* tabela pode não existir */ }
    saveDB();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: GET HARDWARE ID ───────────────────────────────────────────────────

function getHardwareId() {
  let systemUuid = '';
  
  if (process.platform === 'win32') {
    try {
      systemUuid = execSync('wmic csproduct get uuid', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .replace('UUID', '')
        .trim();
    } catch (e) {
      console.warn('Erro ao obter UUID via wmic:', e.message);
    }
  }

  const invalidUuids = [
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '00000000-0000-0000-0000-000000000000'
  ];

  if (!systemUuid || invalidUuids.includes(systemUuid.toLowerCase())) {
    try {
      const interfaces = os.networkInterfaces();
      const macs = [];
      for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
          if (net.mac && net.mac !== '00:00:00:00:00:00') {
            macs.push(net.mac);
          }
        }
      }
      macs.sort();
      systemUuid = macs.join('-') || os.hostname();
    } catch (e) {
      systemUuid = os.hostname();
    }
  }

  return crypto.createHash('sha256').update(systemUuid).digest('hex');
}

ipcMain.handle('get-hardware-id', () => {
  try {
    return getHardwareId();
  } catch (error) {
    return crypto.createHash('sha256').update(os.hostname() || 'fallback').digest('hex');
  }
});

// ─── AUTO UPDATER CONFIG & LISTENERS ─────────────────────────────────────────

autoUpdater.autoDownload = false;
autoUpdater.logger = console;

autoUpdater.on('checking-for-update', () => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('update-checking');
  }
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes
    });
  }
});

autoUpdater.on('update-not-available', () => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('update-not-available');
  }
});

autoUpdater.on('error', (err) => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('update-error', err.message || err);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('download-progress', {
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  }
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('update-downloaded');
  }
});

// ─── IPC: AUTO UPDATER HANDLERS ─────────────────────────────────────────────

ipcMain.handle('check-for-updates', async () => {
  try {
    const isDev = !app.isPackaged;
    if (isDev) {
      // Simulação em ambiente de desenvolvimento
      if (mainWindow && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('update-checking');
      }
      setTimeout(() => {
        if (mainWindow && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('update-not-available');
        }
      }, 1500);
      return { success: true, isDev: true };
    }
    
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    const isDev = !app.isPackaged;
    if (isDev) {
      return { success: false, error: 'O download de atualizações não está disponível em ambiente de desenvolvimento.' };
    }
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  try {
    autoUpdater.quitAndInstall();
  } catch (error) {
    console.error('Erro ao instalar atualização:', error.message);
  }
});


// ─── IPC: ATIVAÇÃO DE LICENÇA (ZONA DE SEGURANÇA) ───────────────────────────

ipcMain.handle('check-activation-status', () => {
  return {
    ativado: sistemaAtivado,
    motivo: motivoBloqueio
  };
});

ipcMain.handle('ativar-sistema', async (event, chaveDigitada) => {
  try {
    const idHardware = getHardwareId();
    const chaveEsperada = Buffer.from(idHardware + MEU_SEGREDO).toString('base64');

    if (chaveDigitada === chaveEsperada) {
      const appData = app.getPath('userData');
      const pastaLicenca = path.join(appData, 'romaneio-madeira');
      const arquivoLicenca = path.join(pastaLicenca, 'license.dat');

      if (!fs.existsSync(pastaLicenca)) {
        fs.mkdirSync(pastaLicenca, { recursive: true });
      }

      // Validade de 30 dias para a ativação inicial
      const expiraEm = new Date();
      expiraEm.setDate(expiraEm.getDate() + 30);

      const novaLicenca = {
        mid: idHardware,
        exp: expiraEm.toISOString(),
        last_seen: new Date().toISOString()
      };

      fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(novaLicenca)));

      sistemaAtivado = true;
      motivoBloqueio = 'ok';
      return { success: true, validade: expiraEm.toLocaleDateString('pt-BR') };
    } else {
      return { success: false, error: 'Chave de licença inválida para este computador.' };
    }
  } catch (err) {
    console.error("Erro na ativação do sistema:", err.message);
    return { success: false, error: 'Erro interno ao processar ativação: ' + err.message };
  }
});


