import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RefreshCw, Smartphone, LogOut, CheckCircle2, QrCode, ShieldCheck } from 'lucide-react';
import Swal from 'sweetalert2';
import { WhatsAppIcon } from './ModalWhatsApp';

interface ModalConexaoWhatsAppProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ModalConexaoWhatsApp: React.FC<ModalConexaoWhatsAppProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'qr_ready' | 'connected'>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; phone: string; name?: string } | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Carregar status inicial e escutar eventos push do Main Process
  useEffect(() => {
    if (!isOpen) return;

    let cancelSubscription: (() => void) | undefined;

    const carregarStatus = async () => {
      if (window.electronAPI?.whatsapp?.getStatus) {
        try {
          const res = await window.electronAPI.whatsapp.getStatus();
          setStatus(res.status);
          setQrCode(res.qr);
          setUser(res.user);

          // Se estiver desconectado e sem QR, inicia conexão automaticamente para exibir QR
          if (res.status === 'disconnected') {
            iniciarConexao();
          }
        } catch (e) {
          console.error('Erro ao verificar status do WhatsApp:', e);
        }
      }
    };

    if (window.electronAPI?.whatsapp?.onStatusChange) {
      cancelSubscription = window.electronAPI.whatsapp.onStatusChange((data) => {
        setStatus(data.status);
        setQrCode(data.qr);
        setUser(data.user);
        setCarregando(false);
      });
    }

    carregarStatus();

    return () => {
      if (cancelSubscription) cancelSubscription();
    };
  }, [isOpen]);

  // Fechamento acessível com a tecla Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const iniciarConexao = useCallback(async () => {
    setCarregando(true);
    setStatus('connecting');
    try {
      if (window.electronAPI?.whatsapp?.connect) {
        await window.electronAPI.whatsapp.connect();
      }
    } catch (e: any) {
      console.error('Erro ao iniciar conexão:', e);
      Swal.fire({
        icon: 'error',
        title: 'Erro de Conexão',
        text: e?.message || 'Falha ao iniciar o socket do WhatsApp.',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl' }
      });
      setStatus('disconnected');
    } finally {
      setCarregando(false);
    }
  }, []);

  const handleDesconectar = async () => {
    const confirm = await Swal.fire({
      title: 'Desconectar WhatsApp?',
      text: 'Você precisará escanear o QR Code novamente para reconectar este aparelho.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sim, desconectar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-5 py-2.5', cancelButton: 'rounded-xl font-bold px-5 py-2.5' }
    });

    if (confirm.isConfirmed) {
      setCarregando(true);
      try {
        if (window.electronAPI?.whatsapp?.logout) {
          await window.electronAPI.whatsapp.logout();
        }
        setStatus('disconnected');
        setUser(null);
        setQrCode(null);
      } catch (e: any) {
        console.error('Erro ao deslogar:', e);
      } finally {
        setCarregando(false);
      }
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col font-sans"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 shadow-xs">
                <WhatsAppIcon size={24} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                  Conexão WhatsApp Direto
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Envie romaneios em PDF com 1 clique direto do sistema
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6">
            {/* Status Conectado */}
            {status === 'connected' && (
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 ring-8 ring-emerald-50 dark:ring-emerald-950/20">
                  <CheckCircle2 size={36} strokeWidth={2.5} />
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Conectado e Ativo
                </span>
                <h4 className="text-lg font-black text-slate-800 dark:text-slate-100">
                  {user?.phone ? `+${user.phone}` : 'Dispositivo Vinculado'}
                </h4>
                {user?.name && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                    {user.name}
                  </p>
                )}

                <div className="mt-5 p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-2xl w-full text-left text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
                  <ShieldCheck size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold text-slate-700 dark:text-slate-200">Envio direto habilitado</strong>
                    Ao salvar ou visualizar romaneios, você poderá enviá-los diretamente para clientes em formato PDF com um clique.
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-center gap-3 w-full">
                  <button
                    type="button"
                    onClick={handleDesconectar}
                    disabled={carregando}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer shadow-xs"
                  >
                    <LogOut size={14} /> Desconectar Aparelho
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-100 hover:bg-slate-700 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition-all cursor-pointer shadow-sm"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            )}

            {/* Status QR Code Pronto para Leitura */}
            {status === 'qr_ready' && qrCode && (
              <div className="flex flex-col items-center text-center">
                <div className="p-3 bg-white border border-slate-200 dark:border-slate-700 rounded-3xl shadow-md mb-4 inline-block">
                  <img
                    src={qrCode}
                    alt="QR Code WhatsApp"
                    className="w-56 h-56 rounded-2xl"
                  />
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 max-w-xs mx-auto mb-5 text-left bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                  <p className="font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-1.5 text-xs">
                    <Smartphone size={14} className="text-emerald-500" /> Para conectar:
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">1</span>
                    Abra o <strong>WhatsApp</strong> no celular
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">2</span>
                    Toque em <strong>Aparelhos conectados</strong>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">3</span>
                    Toque em <strong>Conectar um aparelho</strong> e aponte para este QR
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                  <RefreshCw size={12} className="animate-spin text-emerald-500" />
                  <span>Aguardando leitura do QR Code pelo celular...</span>
                </div>
              </div>
            )}

            {/* Status Conectando / Carregando */}
            {status === 'connecting' && !qrCode && (
              <div className="flex flex-col items-center text-center py-12">
                <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center mb-4">
                  <RefreshCw size={28} className="animate-spin" />
                </div>
                <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Gerando QR Code...
                </h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Iniciando conexão segura com os servidores do WhatsApp...
                </p>
              </div>
            )}

            {/* Status Desconectado */}
            {status === 'disconnected' && (
              <div className="flex flex-col items-center text-center py-8">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mb-4">
                  <QrCode size={30} />
                </div>
                <h4 className="text-base font-black text-slate-800 dark:text-slate-100">
                  Nenhum aparelho conectado
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-6">
                  Vincule seu WhatsApp comercial para enviar romaneios, listas de pacotes e PDFs diretamente aos seus clientes.
                </p>

                <button
                  type="button"
                  onClick={iniciarConexao}
                  disabled={carregando}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md hover:shadow-lg hover:shadow-emerald-500/20 active:scale-98"
                >
                  <WhatsAppIcon size={16} /> Conectar WhatsApp Agora
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
