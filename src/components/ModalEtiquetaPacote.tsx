import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Tag, CheckSquare, Square, Printer, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { gerarPdfEtiquetasPacote, type PacoteEtiqueta, type RomaneioEtiquetaInfo } from '../utils/etiquetaGenerator';

interface ModalEtiquetaPacoteProps {
  isOpen: boolean;
  onClose: () => void;
  romaneio: RomaneioEtiquetaInfo;
  pacotes: PacoteEtiqueta[];
}

export const ModalEtiquetaPacote: React.FC<ModalEtiquetaPacoteProps> = ({
  isOpen,
  onClose,
  romaneio,
  pacotes
}) => {
  const [pacotesSelecionados, setPacotesSelecionados] = useState<number[]>(() =>
    pacotes.map(p => p.numero_pacote)
  );
  const [gerando, setGerando] = useState(false);

  React.useEffect(() => {
    if (pacotes && pacotes.length > 0) {
      setPacotesSelecionados(pacotes.map(p => p.numero_pacote));
    }
  }, [pacotes]);

  const pacotesFiltrados = useMemo(() => {
    return pacotes.filter(p => pacotesSelecionados.includes(p.numero_pacote));
  }, [pacotes, pacotesSelecionados]);

  const handleTogglePacote = (num: number) => {
    setPacotesSelecionados(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const handleSelecionarTodos = () => {
    setPacotesSelecionados(pacotes.map(p => p.numero_pacote));
  };

  const handleDesmarcarTodos = () => {
    setPacotesSelecionados([]);
  };

  const handleImprimir = () => {
    if (pacotesFiltrados.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: 'Selecione pelo menos um pacote para gerar as etiquetas.',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl' }
      });
      return;
    }

    setGerando(true);
    setTimeout(() => {
      try {
        const pdfDoc = gerarPdfEtiquetasPacote(romaneio, pacotesFiltrados);
        pdfDoc.download(`Etiquetas_Romaneio_${String(romaneio.id).padStart(4, '0')}.pdf`);
        onClose();
        Swal.fire({
          icon: 'success',
          title: 'Etiquetas Geradas!',
          text: 'O arquivo PDF com as etiquetas foi baixado com sucesso.',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      } catch (err) {
        console.error('Erro ao gerar etiquetas:', err);
        Swal.fire({
          icon: 'error',
          title: 'Erro',
          text: 'Falha ao gerar o PDF das etiquetas.',
          customClass: { popup: 'rounded-3xl' }
        });
      } finally {
        setGerando(false);
      }
    }, 100);
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop com Blur cobrindo 100% da tela */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 my-8 flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 dark:bg-emerald-950/40 p-2.5 rounded-xl text-emerald-600 dark:text-emerald-400">
                <Tag size={20} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">
                  Gerar Etiquetas de Fardo
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                  Romaneio #{romaneio.id.toString().padStart(4, '0')} • {romaneio.cliente}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Selecione os Pacotes ({pacotesFiltrados.length} de {pacotes.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelecionarTodos}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Todos
                </button>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  type="button"
                  onClick={handleDesmarcarTodos}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline cursor-pointer"
                >
                  Nenhum
                </button>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar pr-1">
              {pacotes.map((p) => {
                const isSelected = pacotesSelecionados.includes(p.numero_pacote);
                return (
                  <div
                    key={p.numero_pacote}
                    onClick={() => handleTogglePacote(p.numero_pacote)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50 text-slate-800 dark:text-slate-100 shadow-2xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800/80 text-slate-400 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isSelected ? (
                        <CheckSquare size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <Square size={18} className="text-slate-300 dark:text-slate-600 shrink-0" />
                      )}
                      <div>
                        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                          Pacote Nº {p.numero_pacote}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold ml-2">
                          {p.especie || 'Mista'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {Number(p.total_m3).toFixed(3)} M³
                      </span>
                      <span className="block text-[10px] text-slate-400 font-semibold">
                        {Number(p.total_ml).toFixed(2)} ML
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              💡 As etiquetas incluem QR Code para conferência de carga rápida e formatação padrão de fardo (100mm × 150mm).
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-950/20">
            <button
              onClick={onClose}
              className="px-5 py-3 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleImprimir}
              disabled={gerando || pacotesFiltrados.length === 0}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black text-xs px-6 py-3 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {gerando ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Gerando PDF...
                </>
              ) : (
                <>
                  <Printer size={16} /> Gerar {pacotesFiltrados.length} Etiqueta(s)
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
