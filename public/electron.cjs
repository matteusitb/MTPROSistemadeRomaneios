const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { autoUpdater } = require('electron-updater');

let db;
let SQLInstance = null;
let mainWindow;

// --- SEGURANÇA E ATIVAÇÃO ---
let sistemaAtivado = false;
let motivoBloqueio = 'unactivated';
let isTrial = false;
let trialDiasRestantes = 0;
let licencaValidade = '';

const _s = [77, 65, 68, 69, 73, 82, 65, 50, 48, 50, 54]; // MADEIRA2026
const MEU_SEGREDO = process.env.APP_SECRET || String.fromCharCode(..._s);

const CHAVE_PUBLICA_RSA = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvLEnwpiuSuFwZHGf4p1T
6S2HG7RD/e4LL1TlfjxwGoFrJHc+Mkj7v/Z9D0SD/P5glN65m+0NSloKVIGplXGO
O2njHUEBoL1OKzqHiazdwE8o6V+/kMzt1cPHNJOgg7puLgAw5nOjrwH28lqcezmW
S4h9Hfe0e2jlMcg4a2wFzdiLNVpnKk+YaPStm2fZdpol+dTi79xCVdcvBJzSlDM5
LKntIrdtump3z5jrzLsZaal3Ok7VONHCmywpOOfa38vBwkKjvwC0AfDjdkgA2Zgt
DjOGJjVa6W/XuSXU+neGE1yKAL4/2EA/PR5iy+zdRrsef+YSdUEzBuCeFw0Dy8+H
9QIDAQAB
-----END PUBLIC KEY-----`;

function obterChaveAES() {
  const hwId = getHardwareId();
  const key = crypto.createHash('sha256').update(MEU_SEGREDO + hwId).digest();
  const iv = crypto.createHash('md5').update(MEU_SEGREDO + hwId).digest();
  return { key, iv };
}

function criptografar(texto) {
  const { key, iv } = obterChaveAES();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let crypted = cipher.update(texto, 'utf8', 'hex');
  crypted += cipher.final('hex');
  return crypted;
}

function descriptografar(texto) {
  try {
    const { key, iv } = obterChaveAES();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let dec = decipher.update(texto, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (e) {
    return null;
  }
}

function getShadowFilePath() {
  const localAppData = process.env.LOCALAPPDATA || app.getPath('userData');
  const dir = path.join(localAppData, 'Microsoft', 'Windows', 'SystemSecurity');
  return {
    dir,
    file: path.join(dir, 'sec_blob.dat')
  };
}

function readRegistryTrial() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execSync('reg query "HKCU\\Software\\MTPRO\\Licensing" /v "TrialVault" 2>nul', { encoding: 'utf8' });
    const match = out.match(/TrialVault\s+REG_SZ\s+([a-f0-9]+)/i);
    if (match && match[1]) {
      const dec = descriptografar(match[1]);
      if (dec) return JSON.parse(dec);
    }
  } catch (e) {
    // Chave não existe
  }
  return null;
}

function writeRegistryTrial(dataObj) {
  if (process.platform !== 'win32') return;
  try {
    const enc = criptografar(JSON.stringify(dataObj));
    execSync(`reg add "HKCU\\Software\\MTPRO\\Licensing" /v "TrialVault" /t REG_SZ /d "${enc}" /f 2>nul`, { stdio: 'ignore' });
  } catch (e) {
    // Ignora
  }
}

function readShadowTrial() {
  try {
    const { file } = getShadowFilePath();
    if (fs.existsSync(file)) {
      const enc = fs.readFileSync(file, 'utf8');
      const dec = descriptografar(enc);
      if (dec) return JSON.parse(dec);
    }
  } catch (e) {
    // Ignora
  }
  return null;
}

function writeShadowTrial(dataObj) {
  try {
    const { dir, file } = getShadowFilePath();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const enc = criptografar(JSON.stringify(dataObj));
    fs.writeFileSync(file, enc);
  } catch (e) {
    // Ignora
  }
}

function readSQLiteTrial() {
  if (!db) return null;
  try {
    const stmt = db.prepare("SELECT valor FROM system_metadata WHERE chave = 'trial_vault'");
    if (stmt.step()) {
      const enc = stmt.getAsObject().valor;
      stmt.free();
      const dec = descriptografar(enc);
      if (dec) return JSON.parse(dec);
    }
    stmt.free();
  } catch (e) {
    // Ignora
  }
  return null;
}

function writeSQLiteTrial(dataObj) {
  if (!db) return;
  try {
    const enc = criptografar(JSON.stringify(dataObj));
    db.run(
      "INSERT OR REPLACE INTO system_metadata (chave, valor, criado_em) VALUES ('trial_vault', ?, ?)",
      [enc, new Date().toISOString()]
    );
  } catch (e) {
    // Ignora
  }
}

function persistirTrialEmTodasCamadas(trialData) {
  writeRegistryTrial(trialData);
  writeShadowTrial(trialData);
  writeSQLiteTrial(trialData);
}

function buscarHistoricoTrialExistente() {
  const machineId = getHardwareId();

  // 1. Tenta Registry do Windows
  const fromReg = readRegistryTrial();
  if (fromReg && fromReg.trial && fromReg.mid === machineId && fromReg.trial_start && fromReg.trial_exp) {
    return fromReg;
  }

  // 2. Tenta Shadow File
  const fromShadow = readShadowTrial();
  if (fromShadow && fromShadow.trial && fromShadow.mid === machineId && fromShadow.trial_start && fromShadow.trial_exp) {
    return fromShadow;
  }

  // 3. Tenta SQLite metadata
  const fromSqlite = readSQLiteTrial();
  if (fromSqlite && fromSqlite.trial && fromSqlite.mid === machineId && fromSqlite.trial_start && fromSqlite.trial_exp) {
    return fromSqlite;
  }

  return null;
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

      const licencaLocal = JSON.parse(conteudoJson);

      // CASO 1: Licença Completa Paga (Token RSA)
      if (licencaLocal && licencaLocal.token && licencaLocal.last_seen) {
        let licencaPacote;
        try {
          const jsonString = Buffer.from(licencaLocal.token, 'base64').toString('utf8');
          licencaPacote = JSON.parse(jsonString);
        } catch (e) {
          console.error("Erro ao decodificar token RSA salvo localmente.");
          sistemaAtivado = false;
          motivoBloqueio = 'unactivated';
          return false;
        }

        if (!licencaPacote || !licencaPacote.data || !licencaPacote.signature) {
          console.error("Token de licença salvo localmente está incompleto ou corrompido.");
          sistemaAtivado = false;
          motivoBloqueio = 'unactivated';
          return false;
        }

        const { data, signature } = licencaPacote;

        // Valida assinatura RSA
        const dadosString = JSON.stringify(data);
        const verifier = crypto.createVerify('SHA256');
        verifier.update(dadosString);
        const assinaturaValida = verifier.verify(CHAVE_PUBLICA_RSA, signature, 'base64');

        if (!assinaturaValida) {
          console.error("🚨 CRÍTICO: Assinatura digital da licença local é inválida! Adulteração detectada.");
          sistemaAtivado = false;
          motivoBloqueio = 'unactivated';
          return false;
        }

        // Valida o Hardware ID
        const machineId = getHardwareId();
        if (data.mid !== machineId) {
          console.error("Máquina não autorizada para esta licença.");
          sistemaAtivado = false;
          motivoBloqueio = 'unactivated';
          return false;
        }

        const agora = new Date();
        const exp = new Date(data.exp);
        const lastSeen = new Date(licencaLocal.last_seen);

        // Anti-Fraude: Relógio retrocedido em mais de 24 horas (tolerância para fusos horários/NTP)
        if (lastSeen.getTime() - agora.getTime() > 24 * 60 * 60 * 1000) {
          console.error("🚨 DETECÇÃO DE FRAUDE: Relógio do computador retrocedido!");
          sistemaAtivado = false;
          motivoBloqueio = 'fraud';
          return false;
        }

        // Verifica Expiração da licença completa
        if (agora > exp) {
          console.error(`Licença expirou em: ${data.exp}`);
          sistemaAtivado = false;
          motivoBloqueio = 'expired';
          isTrial = false;
          trialDiasRestantes = 0;
          licencaValidade = exp.toLocaleDateString('pt-BR');
          return false;
        }

        // Atualiza last_seen localmente
        licencaLocal.last_seen = agora.toISOString();
        fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(licencaLocal)));

        sistemaAtivado = true;
        motivoBloqueio = 'ok';
        isTrial = false;
        trialDiasRestantes = 0;
        licencaValidade = exp.toLocaleDateString('pt-BR');
        return true;
      }

      // CASO 2: Modo Trial de 7 Dias
      if (licencaLocal && licencaLocal.trial) {
        const machineId = getHardwareId();
        if (licencaLocal.mid !== machineId) {
          console.error("Licença trial não pertence a esta máquina.");
          sistemaAtivado = false;
          motivoBloqueio = 'unactivated';
          return false;
        }

        const agora = new Date();
        const trialExp = new Date(licencaLocal.trial_exp);
        const lastSeen = new Date(licencaLocal.last_seen);

        // Anti-Fraude: Relógio retrocedido em mais de 24 horas (tolerância para fusos horários/NTP)
        if (lastSeen.getTime() - agora.getTime() > 24 * 60 * 60 * 1000) {
          console.error("🚨 DETECÇÃO DE FRAUDE NO TRIAL: Relógio do computador retrocedido!");
          sistemaAtivado = false;
          motivoBloqueio = 'fraud';
          return false;
        }

        if (agora > trialExp) {
          console.warn("Período de avaliação de 7 dias expirado.");
          sistemaAtivado = false;
          motivoBloqueio = 'expired';
          isTrial = true;
          trialDiasRestantes = 0;
          licencaValidade = trialExp.toLocaleDateString('pt-BR');
          return false;
        }

        const diffMs = trialExp.getTime() - agora.getTime();
        trialDiasRestantes = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        sistemaAtivado = true;
        motivoBloqueio = 'ok';
        isTrial = true;
        licencaValidade = trialExp.toLocaleDateString('pt-BR');

        // Atualiza last_seen em todas as camadas de segurança
        licencaLocal.last_seen = agora.toISOString();
        fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(licencaLocal)));
        persistirTrialEmTodasCamadas(licencaLocal);
        return true;
      }

    } catch (err) {
      console.error("Erro ao verificar licença:", err.message);
      sistemaAtivado = false;
      motivoBloqueio = 'unactivated';
      return false;
    }
  }

  // CASO 3: license.dat não existe no caminho padrão
  // Verificar se o computador já possui histórico de Trial gravado em outra camada (Registro, Shadow File, SQLite)
  const historicoPrevio = buscarHistoricoTrialExistente();

  if (historicoPrevio) {
    const agora = new Date();
    const trialExp = new Date(historicoPrevio.trial_exp);
    const lastSeen = new Date(historicoPrevio.last_seen || historicoPrevio.trial_start);

    // Anti-Fraude: Relógio retrocedido em mais de 24 horas (tolerância para fusos horários/NTP)
    if (lastSeen.getTime() - agora.getTime() > 24 * 60 * 60 * 1000) {
      console.error("🚨 DETECÇÃO DE FRAUDE NO TRIAL: Relógio do computador retrocedido!");
      sistemaAtivado = false;
      motivoBloqueio = 'fraud';
      return false;
    }

    // Restaura o arquivo license.dat com as datas ORIGINAIS
    if (!fs.existsSync(pastaBase)) {
      fs.mkdirSync(pastaBase, { recursive: true });
    }
    historicoPrevio.last_seen = agora.toISOString();
    fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(historicoPrevio)));
    persistirTrialEmTodasCamadas(historicoPrevio);

    if (agora > trialExp) {
      console.warn("Tentativa de reset de trial detectada: O período de 7 dias original já expirou.");
      sistemaAtivado = false;
      motivoBloqueio = 'expired';
      isTrial = true;
      trialDiasRestantes = 0;
      licencaValidade = trialExp.toLocaleDateString('pt-BR');
      return false;
    }

    const diffMs = trialExp.getTime() - agora.getTime();
    trialDiasRestantes = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    sistemaAtivado = true;
    motivoBloqueio = 'ok';
    isTrial = true;
    licencaValidade = trialExp.toLocaleDateString('pt-BR');
    console.log(`⚡ Trial restaurado a partir do cofre persistente. ${trialDiasRestantes} dia(s) restante(s).`);
    return true;
  }

  // CASO 4: Primeira Execução real no computador (sem histórico prévio em nenhuma camada)
  try {
    if (!fs.existsSync(pastaBase)) {
      fs.mkdirSync(pastaBase, { recursive: true });
    }

    const agora = new Date();
    const trialExp = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
    const trialData = {
      trial: true,
      mid: getHardwareId(),
      trial_start: agora.toISOString(),
      trial_exp: trialExp.toISOString(),
      last_seen: agora.toISOString()
    };

    // Grava no license.dat e em todas as camadas de segurança
    fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(trialData)));
    persistirTrialEmTodasCamadas(trialData);

    sistemaAtivado = true;
    motivoBloqueio = 'ok';
    isTrial = true;
    trialDiasRestantes = 7;
    licencaValidade = trialExp.toLocaleDateString('pt-BR');
    console.log("⚡ Período Trial de 7 dias iniciado com sucesso e registrado no cofre de segurança.");
    return true;
  } catch (errTrial) {
    console.error("Erro ao criar licença Trial inicial:", errTrial.message);
    sistemaAtivado = false;
    motivoBloqueio = 'unactivated';
    return false;
  }
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

function applyMigrations(targetDb) {
  // Garantir a tabela de licença local para suporte a login offline
  try {
    targetDb.run(`
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

  // Garantir a tabela de metadados do sistema para cofre de segurança Trial
  try {
    targetDb.run(`
      CREATE TABLE IF NOT EXISTS system_metadata (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL,
        criado_em TEXT NOT NULL
      );
    `);
  } catch (e) {
    console.error('Erro ao criar tabela system_metadata:', e.message);
  }

  // Executar migrações seguras no banco já existente
  try {
    targetDb.run(`ALTER TABLE especies ADD COLUMN cientifico TEXT`);
  } catch (e) {
    // Coluna já existe, ignora
  }

  try {
    targetDb.run(`ALTER TABLE romaneio_pacotes ADD COLUMN especie_id INTEGER`);
  } catch (e) {
    // Coluna já existe, ignora
  }

  try {
    targetDb.run(`ALTER TABLE romaneios ADD COLUMN tipo_romaneio TEXT DEFAULT 'padrao'`);
  } catch (e) {
    // Coluna já existe, ignora
  }
}

function popularRomaneiosDemo(targetDb) {
  try {
    const d = new Date();
    const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    // Romaneio 1: Padrão M³
    const c1Id = getOrInsert('clientes', 'Madeireira Vale do Verde Ltda');
    const espIpe = getOrInsertEspecie('Ipê');
    
    targetDb.run(
      `INSERT INTO romaneios (data, cliente_id, especie_id, total_m3, total_ml, status, tipo_romaneio) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [hoje, c1Id, espIpe, 3.167, 430.30, 'Ativo', 'padrao']
    );
    const r1Id = targetDb.exec("SELECT last_insert_rowid()")[0].values[0][0];
    
    // R1 - Pacote 1 (Pranchões 5.0 x 15.0)
    targetDb.run(
      `INSERT INTO romaneio_pacotes (romaneio_id, numero_pacote, total_m3, total_ml, especie_id) VALUES (?, ?, ?, ?, ?)`,
      [r1Id, 1, 1.736, 231.50, espIpe]
    );
    const p1_1Id = targetDb.exec("SELECT last_insert_rowid()")[0].values[0][0];
    
    const r1p1_itens = [
      [p1_1Id, 5.0, 15.0, 3.50, 12, 0.315, 42.00],
      [p1_1Id, 5.0, 15.0, 4.00, 18, 0.540, 72.00],
      [p1_1Id, 5.0, 15.0, 4.50, 15, 0.506, 67.50],
      [p1_1Id, 5.0, 15.0, 5.00, 10, 0.375, 50.00]
    ];
    r1p1_itens.forEach(it => {
      targetDb.run(
        `INSERT INTO romaneio_itens (pacote_id, espessura, largura, comprimento, quantidade, volume_m3, volume_ml) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        it
      );
    });

    // R1 - Pacote 2 (Vigas 6.0 x 12.0)
    targetDb.run(
      `INSERT INTO romaneio_pacotes (romaneio_id, numero_pacote, total_m3, total_ml, especie_id) VALUES (?, ?, ?, ?, ?)`,
      [r1Id, 2, 1.431, 198.80, espIpe]
    );
    const p1_2Id = targetDb.exec("SELECT last_insert_rowid()")[0].values[0][0];
    
    const r1p2_itens = [
      [p1_2Id, 6.0, 12.0, 3.00, 14, 0.302, 42.00],
      [p1_2Id, 6.0, 12.0, 4.00, 20, 0.576, 80.00],
      [p1_2Id, 6.0, 12.0, 4.80, 16, 0.553, 76.80]
    ];
    r1p2_itens.forEach(it => {
      targetDb.run(
        `INSERT INTO romaneio_itens (pacote_id, espessura, largura, comprimento, quantidade, volume_m3, volume_ml) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        it
      );
    });

    // Romaneio 2: Bica Corrida / Largura Aberta
    const c2Id = getOrInsert('clientes', 'Exportadora Amazônia Woods');
    const espCumaru = getOrInsertEspecie('Cumaru');
    
    targetDb.run(
      `INSERT INTO romaneios (data, cliente_id, especie_id, total_m3, total_ml, status, tipo_romaneio) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [hoje, c2Id, espCumaru, 0.211, 46.80, 'Ativo', 'aberta']
    );
    const r2Id = targetDb.exec("SELECT last_insert_rowid()")[0].values[0][0];

    // R2 - Pacote 1 (Espessura 2.5cm, variadas)
    targetDb.run(
      `INSERT INTO romaneio_pacotes (romaneio_id, numero_pacote, total_m3, total_ml, especie_id) VALUES (?, ?, ?, ?, ?)`,
      [r2Id, 1, 0.123, 28.80, espCumaru]
    );
    const p2_1Id = targetDb.exec("SELECT last_insert_rowid()")[0].values[0][0];

    const r2p1_itens = [
      [p2_1Id, 2.5, 13.0, 3.20, 1, 0.010, 3.20],
      [p2_1Id, 2.5, 15.0, 3.20, 1, 0.012, 3.20],
      [p2_1Id, 2.5, 18.0, 3.20, 1, 0.014, 3.20],
      [p2_1Id, 2.5, 20.0, 3.20, 1, 0.016, 3.20],
      [p2_1Id, 2.5, 14.0, 4.00, 1, 0.014, 4.00],
      [p2_1Id, 2.5, 16.0, 4.00, 1, 0.016, 4.00],
      [p2_1Id, 2.5, 19.0, 4.00, 1, 0.019, 4.00],
      [p2_1Id, 2.5, 22.0, 4.00, 1, 0.022, 4.00]
    ];
    r2p1_itens.forEach(it => {
      targetDb.run(
        `INSERT INTO romaneio_itens (pacote_id, espessura, largura, comprimento, quantidade, volume_m3, volume_ml) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        it
      );
    });

    // R2 - Pacote 2 (Espessura 2.5cm x 4.50m)
    targetDb.run(
      `INSERT INTO romaneio_pacotes (romaneio_id, numero_pacote, total_m3, total_ml, especie_id) VALUES (?, ?, ?, ?, ?)`,
      [r2Id, 2, 0.088, 18.00, espCumaru]
    );
    const p2_2Id = targetDb.exec("SELECT last_insert_rowid()")[0].values[0][0];

    const r2p2_itens = [
      [p2_2Id, 2.5, 15.0, 4.50, 1, 0.017, 4.50],
      [p2_2Id, 2.5, 18.0, 4.50, 1, 0.020, 4.50],
      [p2_2Id, 2.5, 20.0, 4.50, 1, 0.023, 4.50],
      [p2_2Id, 2.5, 25.0, 4.50, 1, 0.028, 4.50]
    ];
    r2p2_itens.forEach(it => {
      targetDb.run(
        `INSERT INTO romaneio_itens (pacote_id, espessura, largura, comprimento, quantidade, volume_m3, volume_ml) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        it
      );
    });

    // Romaneio 3: Pés Corridos (Exportação)
    const c3Id = getOrInsert('clientes', 'Timber Trade International Inc.');
    const espJatoba = getOrInsertEspecie('Jatobá');

    targetDb.run(
      `INSERT INTO romaneios (data, cliente_id, especie_id, total_m3, total_ml, status, tipo_romaneio) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [hoje, c3Id, espJatoba, 1.121, 289.56, 'Ativo', 'pes']
    );
    const r3Id = targetDb.exec("SELECT last_insert_rowid()")[0].values[0][0];

    // R3 - Pacote 1 (Decking 1" x 6" em pés)
    targetDb.run(
      `INSERT INTO romaneio_pacotes (romaneio_id, numero_pacote, total_m3, total_ml, especie_id) VALUES (?, ?, ?, ?, ?)`,
      [r3Id, 1, 1.121, 289.56, espJatoba]
    );
    const p3_1Id = targetDb.exec("SELECT last_insert_rowid()")[0].values[0][0];

    const r3p1_itens = [
      [p3_1Id, 1.0, 6.0, 8.0, 25, 0.236, 60.96],
      [p3_1Id, 1.0, 6.0, 10.0, 30, 0.354, 91.44],
      [p3_1Id, 1.0, 6.0, 12.0, 20, 0.283, 73.15],
      [p3_1Id, 1.0, 6.0, 14.0, 15, 0.248, 64.01]
    ];
    r3p1_itens.forEach(it => {
      targetDb.run(
        `INSERT INTO romaneio_itens (pacote_id, espessura, largura, comprimento, quantidade, volume_m3, volume_ml) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        it
      );
    });

  } catch (err) {
    console.error('Erro ao popular romaneios de demonstração:', err.message);
  }
}

async function initDB() {
  if (!SQLInstance) {
    SQLInstance = await initSqlJs();
  }
  const dbPath = path.join(app.getPath('userData'), 'romaneios.sqlite');
  
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    db = new SQLInstance.Database(filebuffer);
  } else {
    db = new SQLInstance.Database();
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

  applyMigrations(db);

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

  // Verificar se o banco precisa ser populado com romaneios de demonstração
  try {
    const resRom = db.exec("SELECT COUNT(*) as qtd FROM romaneios");
    const qtdRomaneios = resRom.length > 0 && resRom[0].values.length > 0 ? resRom[0].values[0][0] : 0;
    if (qtdRomaneios === 0) {
      popularRomaneiosDemo(db);
      console.log('⚡ 3 Romaneios de demonstração inseridos com sucesso no banco SQLite.');
    }
  } catch (errDemo) {
    console.error('Erro ao verificar/popular romaneios demo:', errDemo.message);
  }

  saveDB();
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbPath = path.join(app.getPath('userData'), 'romaneios.sqlite');
  const tmpPath = path.join(app.getPath('userData'), 'romaneios.sqlite.tmp');
  try {
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    console.error('Erro na escrita atômica do banco de dados:', err.message);
    // Fallback de contingência
    fs.writeFileSync(dbPath, buffer);
  }
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
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
    },
  });

  mainWindow.maximize();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:') || url.startsWith('whatsapp:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Falha ao carregar interface:', errorCode, errorDescription, validatedURL);
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    Menu.setApplicationMenu(null);

    const primaryPath = path.join(app.getAppPath(), 'dist', 'index.html');
    if (fs.existsSync(primaryPath)) {
      mainWindow.loadFile(primaryPath);
    } else {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  }
}

app.whenReady().then(async () => {
  try {
    await initDB();
  } catch (err) {
    console.error('Erro na inicialização do banco SQLite:', err.message);
  }

  try {
    await verificarLicencaLocal();
  } catch (err) {
    console.error('Erro na verificação de licença:', err.message);
  }

  try {
    scheduleAutoBackup();
  } catch (err) {
    console.error('Erro no agendamento de backup:', err.message);
  }

  createWindow();

  // Verificação automática de atualizações ao inicializar (em produção)
  if (app.isPackaged) {
    setTimeout(() => {
      try {
        console.log('🔍 Checando atualizações automaticamente no GitHub...');
        autoUpdater.checkForUpdates();
      } catch (err) {
        console.warn('⚠️ Falha na checagem automática de atualização:', err.message);
      }
    }, 4000);
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: OPERAÇÕES DE ROMANEIOS & CADASTROS (HANDLERS NOMEADOS E VALIDADOS) ───

protectedHandle('get-romaneios', () => {
  try {
    const stmt = db.prepare(`
      SELECT r.id, r.data, c.nome as cliente, 
             COALESCE(
               (SELECT GROUP_CONCAT(DISTINCT esp.nome) 
                FROM romaneio_pacotes pack 
                LEFT JOIN especies esp ON pack.especie_id = esp.id 
                WHERE pack.romaneio_id = r.id AND pack.especie_id IS NOT NULL),
               e_old.nome
             ) as especie,
             r.total_m3, r.total_ml, r.tipo_romaneio 
      FROM romaneios r 
      LEFT JOIN clientes c ON r.cliente_id = c.id 
      LEFT JOIN especies e_old ON r.especie_id = e_old.id
      ORDER BY r.id DESC
    `);
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

protectedHandle('get-romaneio-by-id', (event, id) => {
  try {
    const numId = Number(id);
    if (!numId || isNaN(numId) || numId <= 0) {
      return { success: false, error: 'ID de romaneio inválido.' };
    }

    // 1. Dados do romaneio
    const rStmt = db.prepare(`
      SELECT r.id, r.data, COALESCE(c.nome, '') as cliente, r.total_m3, r.total_ml, r.tipo_romaneio, r.cliente_id, r.especie_id
      FROM romaneios r
      LEFT JOIN clientes c ON r.cliente_id = c.id
      WHERE r.id = ?
    `);
    rStmt.bind([numId]);
    if (!rStmt.step()) {
      rStmt.free();
      return { success: false, error: 'Romaneio não encontrado.' };
    }
    const romaneio = rStmt.getAsObject();
    rStmt.free();

    // 2. Pacotes do romaneio
    const pStmt = db.prepare(`
      SELECT rp.*, COALESCE(e.nome, e_glob.nome, '') as especie
      FROM romaneio_pacotes rp
      LEFT JOIN especies e ON rp.especie_id = e.id
      LEFT JOIN romaneios r ON rp.romaneio_id = r.id
      LEFT JOIN especies e_glob ON r.especie_id = e_glob.id
      WHERE rp.romaneio_id = ?
      ORDER BY rp.numero_pacote ASC
    `);
    pStmt.bind([numId]);
    const pacotes = [];
    while (pStmt.step()) {
      pacotes.push(pStmt.getAsObject());
    }
    pStmt.free();

    // 3. Itens de cada pacote
    if (pacotes.length > 0) {
      const pacoteIds = pacotes.map(p => p.id);
      const placeholders = pacoteIds.map(() => '?').join(',');
      const iStmt = db.prepare(`
        SELECT * FROM romaneio_itens
        WHERE pacote_id IN (${placeholders})
        ORDER BY id ASC
      `);
      iStmt.bind(pacoteIds);
      const itensMap = new Map();
      while (iStmt.step()) {
        const item = iStmt.getAsObject();
        const list = itensMap.get(item.pacote_id) || [];
        list.push(item);
        itensMap.set(item.pacote_id, list);
      }
      iStmt.free();

      pacotes.forEach(p => {
        p.itens = itensMap.get(p.id) || [];
      });
    }

    // Consolidar string de espécies se necessário
    const temEspecieNosPacotes = pacotes.some(p => p.especie);
    const especiesConsolidadas = temEspecieNosPacotes
      ? Array.from(new Set(pacotes.map(p => p.especie).filter(Boolean))).join(', ')
      : (romaneio.especie || 'Sem espécie');

    return {
      success: true,
      data: {
        ...romaneio,
        especie: especiesConsolidadas,
        pacotes
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('delete-romaneio', (event, id) => {
  try {
    const numId = Number(id);
    if (!numId || isNaN(numId) || numId <= 0) {
      return { success: false, error: 'ID de romaneio inválido.' };
    }

    const pStmt = db.prepare('SELECT id FROM romaneio_pacotes WHERE romaneio_id = ?');
    pStmt.bind([numId]);
    const pacotes = [];
    while (pStmt.step()) {
      pacotes.push(pStmt.getAsObject().id);
    }
    pStmt.free();

    for (const pacoteId of pacotes) {
      const dItemStmt = db.prepare('DELETE FROM romaneio_itens WHERE pacote_id = ?');
      dItemStmt.run([pacoteId]);
      dItemStmt.free();
    }

    const dPacoteStmt = db.prepare('DELETE FROM romaneio_pacotes WHERE romaneio_id = ?');
    dPacoteStmt.run([numId]);
    dPacoteStmt.free();

    const dRomStmt = db.prepare('DELETE FROM romaneios WHERE id = ?');
    dRomStmt.run([numId]);
    dRomStmt.free();

    saveDB();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('get-especies', () => {
  try {
    const stmt = db.prepare('SELECT id, nome, cientifico FROM especies ORDER BY nome ASC');
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

// ─── IPC: AUTENTICAÇÃO OFFLINE / LICENÇA LOCAL ──────────────────────────────

protectedHandle('save-local-license', (event, data) => {
  try {
    if (!data || !data.id || !data.email || !data.machine_id) {
      return { success: false, error: 'Dados de licença local inválidos.' };
    }
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO licenca_local 
      (id, email, machine_id, status_licenca, data_validade, senha_hash, salt, ultimo_login) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      String(data.id),
      String(data.email).trim().toLowerCase(),
      String(data.machine_id),
      String(data.status_licenca),
      data.data_validade ? String(data.data_validade) : null,
      String(data.senha_hash),
      String(data.salt),
      data.ultimo_login || new Date().toISOString()
    ]);
    stmt.free();
    saveDB();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('get-local-license', (event, email) => {
  try {
    if (!email) return { success: false, error: 'E-mail não fornecido.' };
    const stmt = db.prepare('SELECT * FROM licenca_local WHERE LOWER(email) = ?');
    stmt.bind([String(email).trim().toLowerCase()]);
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

protectedHandle('update-local-license-last-login', (event, id) => {
  try {
    if (!id) return { success: false, error: 'ID não fornecido.' };
    const stmt = db.prepare('UPDATE licenca_local SET ultimo_login = ? WHERE id = ?');
    stmt.run([new Date().toISOString(), String(id)]);
    stmt.free();
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
    return { success: true, id: romaneio_id };
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
    return { success: true, id };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── CRIPTOGRAFIA DE BACKUPS (AES-256-GCM + PBKDF2) ──────────────────────────

const BACKUP_MAGIC_HEADER = 'MTPRO_ENC_BACKUP_V1\n';

function encryptBackupBuffer(rawBuffer, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(rawBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const magicBuf = Buffer.from(BACKUP_MAGIC_HEADER, 'utf8');

  // Estrutura: [Magic (20B)] + [Salt (16B)] + [IV (12B)] + [AuthTag (16B)] + [Ciphertext]
  return Buffer.concat([magicBuf, salt, iv, authTag, encrypted]);
}

function decryptBackupBuffer(encryptedBuffer, password) {
  const magicBuf = Buffer.from(BACKUP_MAGIC_HEADER, 'utf8');
  const magicLen = magicBuf.length;

  if (encryptedBuffer.length < magicLen + 16 + 12 + 16) {
    throw new Error('Arquivo de backup criptografado inválido ou corrompido.');
  }

  const magicInFile = encryptedBuffer.subarray(0, magicLen).toString('utf8');
  if (magicInFile !== BACKUP_MAGIC_HEADER) {
    throw new Error('Formato de cabeçalho criptografado não reconhecido.');
  }

  let offset = magicLen;
  const salt = encryptedBuffer.subarray(offset, offset + 16);
  offset += 16;
  const iv = encryptedBuffer.subarray(offset, offset + 12);
  offset += 12;
  const authTag = encryptedBuffer.subarray(offset, offset + 16);
  offset += 16;
  const ciphertext = encryptedBuffer.subarray(offset);

  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted;
}

// ─── IPC: BACKUP MANUAL ─────────────────────────────────────────────────────

protectedHandle('backup-db', async (event, destPath, password) => {
  try {
    saveDB();
    const src = getDbFilePath();
    let finalDest = destPath;
    const isEncrypted = typeof password === 'string' && password.trim().length > 0;

    if (!finalDest) {
      const defaultExt = isEncrypted ? 'mtbk' : 'sqlite';
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: isEncrypted ? 'Salvar Backup Criptografado do Banco' : 'Salvar Backup do Banco de Dados',
        defaultPath: path.join(
          app.getPath('documents'),
          `romaneios_backup_${new Date().toISOString().slice(0, 10)}.${defaultExt}`
        ),
        filters: isEncrypted
          ? [
              { name: 'Backup Protegido MTPRO (*.mtbk)', extensions: ['mtbk'] },
              { name: 'Banco de Dados SQLite (*.sqlite)', extensions: ['sqlite', 'db'] },
              { name: 'Todos os Arquivos', extensions: ['*'] }
            ]
          : [
              { name: 'Banco de Dados SQLite (*.sqlite)', extensions: ['sqlite', 'db'] },
              { name: 'Backup Protegido MTPRO (*.mtbk)', extensions: ['mtbk'] },
              { name: 'Todos os Arquivos', extensions: ['*'] }
            ],
      });
      if (canceled || !filePath) return { success: false, canceled: true };
      finalDest = filePath;
    }

    if (isEncrypted) {
      const rawBuffer = fs.readFileSync(src);
      const encryptedBuffer = encryptBackupBuffer(rawBuffer, password.trim());
      fs.writeFileSync(finalDest, encryptedBuffer);
    } else {
      fs.copyFileSync(src, finalDest);
    }

    const cfg = readBackupConfig();
    writeBackupConfig({ ...cfg, lastManualBackup: new Date().toISOString() });
    return { success: true, path: finalDest, encrypted: isEncrypted };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: RESTAURAR BACKUP ──────────────────────────────────────────────────

protectedHandle('restore-db', async (event, customFilePath, password) => {
  try {
    let targetFile = customFilePath;
    if (!targetFile) {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar Arquivo de Backup para Restaurar',
        filters: [
          { name: 'Arquivos de Backup (*.sqlite, *.db, *.mtbk)', extensions: ['sqlite', 'db', 'mtbk'] },
          { name: 'Todos os Arquivos', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      targetFile = filePaths[0];
    }

    if (!fs.existsSync(targetFile)) {
      return { success: false, error: 'Arquivo de backup não encontrado no caminho especificado.' };
    }

    const rawFileBuffer = fs.readFileSync(targetFile);
    const magicLen = Buffer.from(BACKUP_MAGIC_HEADER, 'utf8').length;
    const isEncrypted = rawFileBuffer.length >= magicLen &&
      rawFileBuffer.subarray(0, magicLen).toString('utf8') === BACKUP_MAGIC_HEADER;

    let fileBuffer;
    if (isEncrypted) {
      if (!password || typeof password !== 'string' || password.trim().length === 0) {
        return {
          success: false,
          requiresPassword: true,
          path: targetFile,
          error: 'Este backup está protegido por senha. Forneça a senha para descriptografar.'
        };
      }
      try {
        fileBuffer = decryptBackupBuffer(rawFileBuffer, password.trim());
      } catch (decErr) {
        return {
          success: false,
          invalidPassword: true,
          path: targetFile,
          error: 'Senha incorreta ou arquivo de backup corrompido.'
        };
      }
    } else {
      fileBuffer = rawFileBuffer;
    }

    if (!SQLInstance) {
      SQLInstance = await initSqlJs();
    }

    let testDb;
    try {
      testDb = new SQLInstance.Database(fileBuffer);
    } catch (parseErr) {
      return { success: false, error: 'O arquivo selecionado não é um banco de dados SQLite válido ou a senha de descriptografia está incorreta.' };
    }

    // Verificar se as tabelas principais existem
    let tables = [];
    try {
      const tablesRes = testDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
      if (tablesRes.length > 0) {
        tables = tablesRes[0].values.map(v => v[0]);
      }
    } catch (tblErr) {
      return { success: false, error: 'Não foi possível ler a estrutura do banco de dados.' };
    }

    if (!tables.includes('romaneios')) {
      return { success: false, error: 'O arquivo selecionado não possui a estrutura válida do sistema de romaneios.' };
    }

    // Criar backup de segurança preventivo do banco atual antes da substituição
    try {
      saveDB();
      const currentDbPath = getDbFilePath();
      if (fs.existsSync(currentDbPath)) {
        const now = new Date();
        const ts = now.toISOString().replace(/[:.]/g, '-');
        const safetyBackupPath = path.join(app.getPath('userData'), `romaneios_seguranca_pre_restore_${ts}.sqlite`);
        fs.copyFileSync(currentDbPath, safetyBackupPath);
        console.log(`[Backup Segurança] Criado em: ${safetyBackupPath}`);
      }
    } catch (safetyErr) {
      console.warn('Aviso: Falha ao criar backup preventivo de segurança:', safetyErr.message);
    }

    // Aplicar migrações ao banco restaurado
    applyMigrations(testDb);

    // Substituir a instância ativa
    db = testDb;

    // Salvar o novo banco no caminho do app
    saveDB();

    // Obter estatísticas do banco restaurado
    let romaneiosCount = 0;
    let especiesCount = 0;
    let pacotesCount = 0;
    try {
      romaneiosCount = db.exec('SELECT COUNT(*) FROM romaneios')[0]?.values[0][0] || 0;
      especiesCount = db.exec('SELECT COUNT(*) FROM especies')[0]?.values[0][0] || 0;
      pacotesCount = db.exec('SELECT COUNT(*) FROM romaneio_pacotes')[0]?.values[0][0] || 0;
    } catch (cntErr) {
      console.warn('Erro ao obter contagens após restauração:', cntErr.message);
    }

    return {
      success: true,
      path: targetFile,
      romaneiosCount,
      especiesCount,
      pacotesCount
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: SINCRONIZAR ESPÉCIES COM SUPABASE ─────────────────────────────────

protectedHandle('sync-especies', (event, remoteEspecies) => {
  try {
    if (!Array.isArray(remoteEspecies)) {
      return { success: false, error: 'Lista de espécies inválida.' };
    }

    let inserted = 0;
    let updated = 0;

    const selectStmt = db.prepare('SELECT id, nome, cientifico FROM especies WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?))');
    const updateStmt = db.prepare('UPDATE especies SET cientifico = ? WHERE id = ?');
    const insertStmt = db.prepare('INSERT INTO especies (nome, cientifico) VALUES (?, ?)');

    for (const item of remoteEspecies) {
      if (!item || !item.nome) continue;
      const cleanNome = item.nome.trim();
      const cleanCientifico = item.cientifico ? item.cientifico.trim() : null;

      selectStmt.bind([cleanNome]);
      if (selectStmt.step()) {
        const localRow = selectStmt.getAsObject();
        selectStmt.reset();

        // Atualiza o nome científico se houver alteração
        if ((localRow.cientifico || null) !== cleanCientifico) {
          updateStmt.bind([cleanCientifico, localRow.id]);
          updateStmt.step();
          updateStmt.reset();
          updated++;
        }
      } else {
        selectStmt.reset();
        insertStmt.bind([cleanNome, cleanCientifico]);
        insertStmt.step();
        insertStmt.reset();
        inserted++;
      }
    }

    selectStmt.free();
    updateStmt.free();
    insertStmt.free();

    saveDB();

    const totalRes = db.exec('SELECT COUNT(*) FROM especies');
    const totalCount = totalRes.length > 0 ? totalRes[0].values[0][0] : 0;

    return {
      success: true,
      inserted,
      updated,
      total: totalCount
    };
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

// ─── IPC: COMPARTILHAMENTO & ARQUIVOS (WHATSAPP) ───────────────────────────

protectedHandle('save-temp-pdf', async (event, fileName, base64Data) => {
  try {
    const sanitizedFileName = (fileName || 'Romaneio.pdf').replace(/[\\/:*?"<>|]/g, '_');
    let targetDir = path.join(app.getPath('downloads'), 'Romaneios');
    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch (e) {
        targetDir = app.getPath('temp');
      }
    }
    const filePath = path.join(targetDir, sanitizedFileName);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('show-item-in-folder', async (event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { success: true };
    }
    return { success: false, error: 'Arquivo não encontrado' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('open-external-url', async (event, url) => {
  try {
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('whatsapp://'))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'URL inválida' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: GET HARDWARE ID ───────────────────────────────────────────────────

function getHardwareId() {
  let systemUuid = '';
  
  if (process.platform === 'win32') {
    // 1. Tenta obter o MachineGuid diretamente do Registro do Windows (Mais rápido e confiável)
    try {
      const output = execSync('reg query "HKLM\\Software\\Microsoft\\Cryptography" /v MachineGuid', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const match = output.match(/MachineGuid\s+REG_SZ\s+([a-fA-F0-9-]+)/i);
      if (match && match[1]) {
        systemUuid = match[1].trim();
      }
    } catch (e) {
      console.warn('Erro ao obter UUID via Registro:', e.message);
    }

    // 2. Fallback: Tenta obter o UUID via PowerShell CIM (Moderno)
    if (!systemUuid) {
      try {
        systemUuid = execSync('powershell -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim();
      } catch (e) {
        console.warn('Erro ao obter UUID via PowerShell CIM:', e.message);
      }
    }

    // 3. Segundo Fallback: Tenta via wmic csproduct (Legado, pode estar ausente em Windows 11 moderno)
    if (!systemUuid) {
      try {
        systemUuid = execSync('wmic csproduct get uuid', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .replace('UUID', '')
          .trim();
      } catch (e) {
        console.warn('Erro ao obter UUID via wmic:', e.message);
      }
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

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ─── AUTO UPDATER CONFIG & LISTENERS ─────────────────────────────────────────

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
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
    motivo: motivoBloqueio,
    isTrial: isTrial,
    diasRestantes: trialDiasRestantes,
    validade: licencaValidade,
    hardwareId: getHardwareId()
  };
});

ipcMain.handle('ativar-sistema', async (event, chaveDigitada) => {
  try {
    const idHardware = getHardwareId();
    
    // 1. Decodifica o token Base64 enviado pelo cliente
    let licencaPacote;
    try {
      const jsonString = Buffer.from(chaveDigitada, 'base64').toString('utf8');
      licencaPacote = JSON.parse(jsonString);
    } catch (e) {
      return { success: false, error: 'Chave de licença em formato inválido ou corrompida.' };
    }

    if (!licencaPacote || !licencaPacote.data || !licencaPacote.signature) {
      return { success: false, error: 'Chave de licença incompleta ou corrompida.' };
    }

    const { data, signature } = licencaPacote;

    // 2. Valida o Hardware ID
    if (data.mid !== idHardware) {
      return { success: false, error: 'Esta chave de licença não pertence a este computador.' };
    }

    // 3. Valida a Assinatura RSA
    const dadosString = JSON.stringify(data);
    const verifier = crypto.createVerify('SHA256');
    verifier.update(dadosString);
    const assinaturaValida = verifier.verify(CHAVE_PUBLICA_RSA, signature, 'base64');

    if (!assinaturaValida) {
      return { success: false, error: 'Assinatura digital inválida. Chave de ativação falsificada!' };
    }

    // 4. Valida se a data de expiração da chave já passou
    const agora = new Date();
    const expiraEm = new Date(data.exp);
    if (agora > expiraEm) {
      return { success: false, error: 'A chave de licença fornecida já está expirada.' };
    }

    // Gravando licença ativada localmente com AES
    const appData = app.getPath('userData');
    const pastaLicenca = path.join(appData, 'romaneio-madeira');
    const arquivoLicenca = path.join(pastaLicenca, 'license.dat');

    if (!fs.existsSync(pastaLicenca)) {
      fs.mkdirSync(pastaLicenca, { recursive: true });
    }

    // Grava o token original completo e a data last_seen para validação local completa posterior
    const novaLicenca = {
      token: chaveDigitada,
      last_seen: agora.toISOString()
    };

    fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(novaLicenca)));

    sistemaAtivado = true;
    motivoBloqueio = 'ok';
    isTrial = false;
    trialDiasRestantes = 0;
    licencaValidade = expiraEm.toLocaleDateString('pt-BR');
    return { success: true, validade: expiraEm.toLocaleDateString('pt-BR') };

  } catch (err) {
    console.error("Erro na ativação do sistema:", err.message);
    return { success: false, error: 'Erro interno ao processar ativação: ' + err.message };
  }
});


