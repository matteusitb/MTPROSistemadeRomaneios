// @ts-check
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

/**
 * @typedef {'disconnected' | 'connecting' | 'qr_ready' | 'connected'} WhatsAppStatus
 */

class WhatsAppService {
  constructor() {
    /** @type {any} */
    this.sock = null;
    /** @type {WhatsAppStatus} */
    this.status = 'disconnected';
    /** @type {string | null} */
    this.qrCodeDataUrl = null;
    /** @type {{ id: string, phone: string, name?: string } | null} */
    this.connectedUser = null;
    /** @type {Electron.BrowserWindow | null} */
    this.mainWindow = null;
    /** @type {NodeJS.Timeout | null} */
    this.reconnectTimer = null;
    /** @type {boolean} */
    this.isManualDisconnect = false;
    /** @type {boolean} */
    this.isStartingSocket = false;

    // Pasta persistente de sessão dentro do perfil de usuário (%APPDATA%/MT PRO - Madeira Serrada/whatsapp_session)
    const userDataPath = (app && typeof app.getPath === 'function') 
      ? app.getPath('userData') 
      : path.join(process.cwd(), '.wa_session');
    this.sessionDir = path.join(userDataPath, 'whatsapp_session');
  }

  /**
   * Inicializa o serviço e verifica se já existe sessão salva
   * @param {Electron.BrowserWindow} mainWindow
   */
  async init(mainWindow) {
    this.mainWindow = mainWindow;

    // Se já existem credenciais salvas, tenta auto-conectar silenciosamente
    const credsPath = path.join(this.sessionDir, 'creds.json');
    if (fs.existsSync(credsPath)) {
      console.log('📱 WhatsApp: Credenciais existentes encontradas. Conectando...');
      this.connect().catch(err => {
        console.warn('📱 WhatsApp: Falha na reconexão automática:', err.message);
      });
    }
  }

  /**
   * Notifica a janela do Electron sobre mudanças de status ou QR Code
   */
  notifyStatus() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('whatsapp-status', {
        status: this.status,
        user: this.connectedUser,
        qr: this.qrCodeDataUrl
      });
    }
  }

  /**
   * Retorna o estado atual da conexão
   */
  getStatus() {
    return {
      status: this.status,
      user: this.connectedUser,
      qr: this.qrCodeDataUrl
    };
  }

  /**
   * Conecta ao WhatsApp gerando QR Code ou restaurando sessão
   */
  async connect() {
    if (this.status === 'connected' && this.sock) {
      return { success: true, status: this.status, user: this.connectedUser };
    }

    if (this.isStartingSocket) {
      return { success: true, status: this.status, qr: this.qrCodeDataUrl };
    }

    this.isStartingSocket = true;
    this.isManualDisconnect = false;
    this.status = 'connecting';
    this.notifyStatus();

    try {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners('connection.update');
          this.sock.ev.removeAllListeners('creds.update');
        } catch (_) {}
      }

      if (!fs.existsSync(this.sessionDir)) {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['MT PRO Romaneios', 'Desktop', '1.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: false,
        retryRequestDelayMs: 250
      });
      this.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              width: 280,
              color: { dark: '#059669', light: '#ffffff' }
            });
            this.status = 'qr_ready';
            this.notifyStatus();
          } catch (qrErr) {
            console.error('📱 Erro ao gerar imagem do QR Code:', qrErr);
          }
        }

        if (connection === 'open') {
          this.status = 'connected';
          this.qrCodeDataUrl = null;

          const rawId = sock.user?.id || '';
          const cleanPhone = (rawId.split(':')[0] || rawId.split('@')[0]).replace(/\D/g, '');
          this.connectedUser = {
            id: rawId,
            phone: cleanPhone,
            name: sock.user?.name || ''
          };

          console.log(`📱 WhatsApp: Conectado com sucesso como +${cleanPhone}!`);
          this.notifyStatus();
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const isRestart = statusCode === DisconnectReason.restartRequired; // 515

          console.log(`📱 WhatsApp: Conexão fechada. Código: ${statusCode} (${isRestart ? 'restartRequired' : isLoggedOut ? 'loggedOut' : 'outro'}), Deslogado: ${isLoggedOut}`);

          if (isLoggedOut) {
            this.status = 'disconnected';
            this.connectedUser = null;
            this.qrCodeDataUrl = null;
            if (this.sock) {
              try { this.sock.ev.removeAllListeners(); } catch (_) {}
              this.sock = null;
            }
            this.notifyStatus();
            setTimeout(() => {
              this.clearSessionFolder();
            }, 600);
          } else if (!this.isManualDisconnect) {
            this.status = 'connecting';
            this.notifyStatus();

            const delay = isRestart ? 500 : 3000;
            console.log(`📱 WhatsApp: Reiniciando conexão em ${delay}ms...`);

            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
              this.connect().catch(err => {
                console.warn('📱 WhatsApp: Erro na reconexão:', err.message);
              });
            }, delay);
          } else {
            this.status = 'disconnected';
            this.sock = null;
            this.notifyStatus();
          }
        }
      });

      return { success: true, status: this.status };
    } catch (error) {
      console.error('📱 Erro ao inicializar conexão Baileys:', error);
      this.status = 'disconnected';
      this.notifyStatus();
      return { success: false, error: error.message };
    } finally {
      this.isStartingSocket = false;
    }
  }

  /**
   * Desconecta o socket temporariamente sem apagar credenciais
   */
  async disconnect() {
    this.isManualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const currentSock = this.sock;
    this.sock = null;
    if (currentSock) {
      try {
        currentSock.ev.removeAllListeners();
        currentSock.end(new Error('Manual disconnect'));
      } catch (_) {}
    }
    this.status = 'disconnected';
    this.qrCodeDataUrl = null;
    this.notifyStatus();
    return { success: true };
  }

  /**
   * Desconecta e apaga as credenciais salvas (logout total)
   */
  async logout() {
    this.isManualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const currentSock = this.sock;
    this.sock = null;

    if (currentSock) {
      try {
        currentSock.ev.removeAllListeners('creds.update');
        // Dá um timeout de segurança de 1.5s para o logout remoto do WhatsApp
        await Promise.race([
          currentSock.logout().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 1500))
        ]);
      } catch (_) {
        try { currentSock.end(new Error('Logout')); } catch (_) {}
      }
      try {
        currentSock.ev.removeAllListeners();
      } catch (_) {}
    }

    this.status = 'disconnected';
    this.connectedUser = null;
    this.qrCodeDataUrl = null;
    this.notifyStatus();

    // Limpa a pasta após liberação completa de handles do Node/libuv
    setTimeout(() => {
      this.clearSessionFolder();
    }, 600);

    return { success: true };
  }

  /**
   * Limpa a pasta de sessão de forma segura e não bloqueante
   */
  clearSessionFolder() {
    try {
      if (fs.existsSync(this.sessionDir)) {
        fs.rmSync(this.sessionDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        console.log('📱 WhatsApp: Pasta de sessão limpa.');
      }
    } catch (err) {
      console.warn('📱 WhatsApp: Aviso ao limpar pasta de sessão:', err.message);
    }
  }

  /**
   * Envia o Romaneio em PDF diretamente para o número informado
   * @param {{ telefone: string, mensagem: string, pdfBase64: string, fileName?: string }} param0
   */
  async sendRomaneio({ telefone, mensagem, pdfBase64, fileName }) {
    if (this.status !== 'connected' || !this.sock) {
      return {
        success: false,
        error: 'O WhatsApp não está conectado. Conecte seu aparelho nas Configurações ou no botão WhatsApp antes de enviar.'
      };
    }

    if (!telefone || !telefone.trim()) {
      return { success: false, error: 'Número de telefone do destinatário não informado.' };
    }

    if (!pdfBase64) {
      return { success: false, error: 'Arquivo PDF não fornecido para envio.' };
    }

    try {
      // 1. Sanitizar número
      let cleanPhone = String(telefone).replace(/\D/g, '');
      if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
        cleanPhone = '55' + cleanPhone;
      }

      // 2. Descobrir o JID exato no servidor do WhatsApp (evita erro de 9º dígito no Brasil)
      let targetJid = null;
      try {
        const results = await this.sock.onWhatsApp(cleanPhone);
        if (results && results.length > 0 && results[0].exists) {
          targetJid = results[0].jid;
        }
      } catch (errCheck) {
        console.warn('📱 WhatsApp: Aviso na verificação onWhatsApp:', errCheck.message);
      }

      if (!targetJid) {
        targetJid = `${cleanPhone}@s.whatsapp.net`;
      }

      // 3. Converter base64 para Buffer
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      const docName = (fileName || 'Romaneio.pdf').replace(/[\\/:*?"<>|]/g, '_');

      // 4. Enviar documento com a mensagem formatada na legenda
      const sentMsg = await this.sock.sendMessage(targetJid, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: docName,
        caption: mensagem || ''
      });

      console.log(`📱 WhatsApp: Romaneio "${docName}" enviado para ${cleanPhone}! ID: ${sentMsg?.key?.id}`);
      return {
        success: true,
        messageId: sentMsg?.key?.id,
        destinatario: cleanPhone
      };
    } catch (error) {
      console.error('📱 WhatsApp: Erro ao enviar mensagem:', error);
      return {
        success: false,
        error: error?.message || 'Falha desconhecida ao enviar documento via WhatsApp.'
      };
    }
  }
}

const whatsappService = new WhatsAppService();
module.exports = whatsappService;
