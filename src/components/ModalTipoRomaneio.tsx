import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Layers, Ruler, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

interface ModalTipoRomaneioProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (tipo: 'padrao' | 'aberta' | 'pes') => void;
  tipoAtual?: 'padrao' | 'aberta' | 'pes';
}

export const ModalTipoRomaneio: React.FC<ModalTipoRomaneioProps> = ({
  isOpen,
  onClose,
  onSelect,
  tipoAtual = 'padrao'
}) => {
  if (!isOpen) return null;

  const opcoes = [
    {
      tipo: 'padrao' as const,
      titulo: 'Padrão (Larguras Fixas)',
      badge: 'Mais Utilizado',
      badgeColor: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/40',
      icone: Layers,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-800/50',
      descricao: 'Espessura (cm), Largura (cm) e Comprimento (m) com valor fixo por linha.',
      destaque: 'Ideal para caibros, vigas, tábuas e pranchas convencionais.'
    },
    {
      tipo: 'aberta' as const,
      titulo: 'Bica Corrida (Largura Aberta)',
      badge: 'Bica Corrida',
      badgeColor: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/40',
      icone: Ruler,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200/60 dark:border-blue-800/50',
      descricao: 'Múltiplas larguras na mesma linha com a mesma espessura e comprimento.',
      destaque: 'Digitação super rápida com separação automática por traço (Ex: 10 - 15 - 20).'
    },
    {
      tipo: 'pes' as const,
      titulo: 'Ipê / Exportação (Pés)',
      badge: 'Medição em Pés',
      badgeColor: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/40',
      icone: Sparkles,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-900/50',
      descricao: 'Comprimento lançado em pés lineares com conversão para M³ e faixas.',
      destaque: 'Gera consolidados detalhados de 6 pés e abaixo, 7 pés e 8 pés acima.'
    }
  ];

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop com Blur cobrindo 100% da tela */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-md"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden my-auto z-10"
        >
          {/* Header */}
          <div className="p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-850">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 block mb-1">
                Novo Romaneio
              </span>
              <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                Selecione o Tipo de Romaneio
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                Escolha o formato de cubagem adequado para a sua medição
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>

          {/* Opções em Cards */}
          <div className="p-6 sm:p-8 space-y-4 max-h-[68vh] overflow-y-auto custom-scrollbar">
            {opcoes.map((opcao) => {
              const Icone = opcao.icone;
              const isSelecionado = tipoAtual === opcao.tipo;

              return (
                <button
                  key={opcao.tipo}
                  type="button"
                  onClick={() => onSelect(opcao.tipo)}
                  className={`w-full text-left p-5 rounded-2xl border-2 transition-all flex items-start gap-4 cursor-pointer group relative overflow-hidden ${
                    isSelecionado
                      ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-md shadow-emerald-500/5'
                      : 'border-slate-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-600/60 bg-white dark:bg-slate-950 hover:bg-slate-50/60 dark:hover:bg-slate-850/60'
                  }`}
                >
                  <div className={`p-3.5 rounded-2xl border ${opcao.iconBg} ${opcao.iconColor} shrink-0 mt-0.5 transition-transform group-hover:scale-105`}>
                    <Icone size={24} strokeWidth={2.2} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                      <h3 className="text-base font-black text-slate-800 dark:text-slate-100 tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {opcao.titulo}
                      </h3>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${opcao.badgeColor}`}>
                        {opcao.badge}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 font-bold leading-relaxed mb-1">
                      {opcao.descricao}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                      💡 {opcao.destaque}
                    </p>
                  </div>

                  <div className="shrink-0 self-center pl-2">
                    {isSelecionado ? (
                      <CheckCircle2 size={22} className="text-emerald-500 shrink-0" />
                    ) : (
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/40 transition-all">
                        <ArrowRight size={16} strokeWidth={2.5} />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 text-right flex items-center justify-between">
            <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold">
              Você também poderá alternar o tipo a qualquer momento dentro do romaneio.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
