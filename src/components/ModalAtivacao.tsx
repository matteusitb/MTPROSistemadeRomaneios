import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, RefreshCw, Zap, ShieldCheck } from 'lucide-react';
import Swal from 'sweetalert2';

interface ModalAtivacaoProps {
  isOpen: boolean;
  onClose: () => void;
  onActivated: () => void;
  diasRestantes?: number;
  validade?: string;
}

export const ModalAtivacao: React.FC<ModalAtivacaoProps> = ({
  isOpen,
  onClose,
  onActivated,
  diasRestantes = 7,
  validade
}) => {
  const [hardwareId, setHardwareId] = useState('');
  const [chave, setChave] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [ativando, setAtivando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const fetchId = async () => {
        if (window.electronAPI && typeof window.electronAPI.getHardwareId === 'function') {
          const id = await window.electronAPI.getHardwareId();
          setHardwareId(id);
        } else {
          setHardwareId('development-web-client-id');
        }
      };
      fetchId();
      setErro(null);
      setChave('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyId = () => {
    if (hardwareId) {
      navigator.clipboard.writeText(hardwareId);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  const handleOpenWhatsApp = () => {
    if (!hardwareId) return;
    const texto = encodeURIComponent(`Olá! Gostaria de adquirir/ativar a licença completa do MT PRO - Romaneio de Madeira Serrada.\nMeu ID de Hardware: ${hardwareId}`);
    const url = `https://wa.me/5593984035819?text=${texto}`;
    if (window.electronAPI && typeof window.electronAPI.openExternalUrl === 'function') {
      window.electronAPI.openExternalUrl(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const handleAtivar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chave.trim()) return;

    setAtivando(true);
    setErro(null);

    try {
      const res = await window.electronAPI.ativarSistema(chave.trim());
      if (res.success) {
        onClose();
        await Swal.fire({
          icon: 'success',
          title: 'Licença Ativada com Sucesso!',
          text: `Sua licença completa está ativa e é válida até ${res.validade || 'período contratado'}.`,
          confirmButtonColor: '#059669',
          customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md' }
        });
        onActivated();
      } else {
        setErro(res.error || 'Chave de ativação inválida ou expirada.');
      }
    } catch (err: any) {
      setErro(err.message || 'Falha ao processar ativação.');
    } finally {
      setAtivando(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop com Blur */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
        />

        {/* Card do Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden my-auto z-10 p-6 sm:p-8"
        >
          {/* Botão Fechar */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X size={20} />
          </button>

          <div className="flex flex-col items-center text-center">
            {/* Ícone de Licença */}
            <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20 mb-4 text-white">
              <Zap size={32} strokeWidth={2.5} />
            </div>

            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
              Modo Demonstração (Trial)
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-1 mb-6">
              Você possui <strong className="text-amber-600 dark:text-amber-400 font-bold">{diasRestantes} dia{diasRestantes === 1 ? '' : 's'} restante{diasRestantes === 1 ? '' : 's'}</strong> de avaliação gratuita com acesso a todos os recursos{validade ? ` (válido até ${validade})` : ''}.
            </p>

            <form onSubmit={handleAtivar} className="w-full space-y-4 text-left">
              {erro && (
                <div className="bg-red-50 dark:bg-red-955/20 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 px-4 py-2.5 rounded-xl text-xs font-bold">
                  {erro}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">
                  Chave de Licença Definitiva
                </label>
                <input
                  type="text"
                  value={chave}
                  onChange={e => setChave(e.target.value)}
                  placeholder="Cole aqui o token de ativação"
                  className="glass-input w-full px-4 py-3 text-slate-800 dark:text-slate-100 font-bold text-center text-xs tracking-wider outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={ativando || !chave.trim()}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
              >
                {ativando ? (
                  <><RefreshCw size={16} className="animate-spin" /> <span>Validando Chave...</span></>
                ) : (
                  <><ShieldCheck size={18} /> <span>Ativar Licença Completa</span></>
                )}
              </button>
            </form>

            {/* Hardware ID & WhatsApp Box */}
            <div className="mt-6 w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center gap-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider">
                ID do seu Computador (Hardware ID)
              </span>
              <span className="text-[11px] font-mono text-slate-700 dark:text-slate-300 font-bold bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 w-full select-all text-center break-all shadow-inner">
                {hardwareId || 'Carregando...'}
              </span>

              <div className="flex items-center justify-center gap-4 w-full mt-1">
                {hardwareId && (
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 font-black transition-all hover:underline cursor-pointer flex items-center gap-1"
                  >
                    {copiado ? (
                      <><Check size={12} strokeWidth={3} className="text-emerald-500" /> <span className="text-emerald-500 font-bold">Copiado!</span></>
                    ) : (
                      <><Copy size={12} strokeWidth={2.5} /> Copiar ID</>
                    )}
                  </button>
                )}
                {hardwareId && (
                  <button
                    type="button"
                    onClick={handleOpenWhatsApp}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-black transition-all hover:underline cursor-pointer flex items-center gap-1"
                  >
                    💬 Solicitar Chave no WhatsApp
                  </button>
                )}
              </div>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
