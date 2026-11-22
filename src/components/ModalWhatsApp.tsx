import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Phone, MessageSquare, CheckSquare, 
  Square, FileText, Check, Copy, Box
} from 'lucide-react';
import Swal from 'sweetalert2';
import { 
  formatarMascaraTelefone, 
  gerarTextoWhatsApp, 
  obterLinkWhatsApp, 
  type DadosRomaneioWhatsApp 
} from '../utils/whatsappHelper';
import { gerarPdfRomaneio } from '../utils/pdfGenerator';
import { ModalConexaoWhatsApp } from './ModalConexaoWhatsApp';

// Ícone oficial SVG do WhatsApp
export const WhatsAppIcon = ({ className = "w-5 h-5", size }: { className?: string; size?: number }) => (
  <svg 
    viewBox="0 0 24 24" 
    width={size || 20} 
    height={size || 20} 
    className={className} 
    fill="currentColor"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface ModalWhatsAppProps {
  isOpen: boolean;
  onClose: () => void;
  romaneio: DadosRomaneioWhatsApp;
  pacotes: any[];
}

export const ModalWhatsApp: React.FC<ModalWhatsAppProps> = ({
  isOpen,
  onClose,
  romaneio,
  pacotes
}) => {
  const getPacoteKey = (p: any, idx: number) => String(p.id || p.numero_pacote || p.numero || `pacote_${idx}`);

  const [telefone, setTelefone] = useState('');
  const [mensagemExtra, setMensagemExtra] = useState('');
  const [pacotesSelecionados, setPacotesSelecionados] = useState<string[]>(() =>
    pacotes.map((p, idx) => getPacoteKey(p, idx))
  );
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [waStatus, setWaStatus] = useState<'disconnected' | 'connecting' | 'qr_ready' | 'connected'>('disconnected');
  const [waUser, setWaUser] = useState<{ id: string; phone: string; name?: string } | null>(null);
  const [modalConexaoAberto, setModalConexaoAberto] = useState(false);

  // Monitorar status da conexão WhatsApp (Baileys)
  useEffect(() => {
    if (!isOpen) return;

    const checarStatus = async () => {
      if (window.electronAPI?.whatsapp?.getStatus) {
        try {
          const res = await window.electronAPI.whatsapp.getStatus();
          setWaStatus(res.status);
          setWaUser(res.user);
        } catch (e) {
          console.warn('Erro ao checar status whatsapp:', e);
        }
      }
    };

    let unsubscribe: (() => void) | undefined;
    if (window.electronAPI?.whatsapp?.onStatusChange) {
      unsubscribe = window.electronAPI.whatsapp.onStatusChange((data) => {
        setWaStatus(data.status);
        setWaUser(data.user);
      });
    }

    checarStatus();
    return () => {
      if (unsubscribe) unsubscribe();
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

  // Atualiza pacotes selecionados quando a lista de pacotes mudar
  React.useEffect(() => {
    if (pacotes && pacotes.length > 0) {
      setPacotesSelecionados(pacotes.map((p, idx) => getPacoteKey(p, idx)));
    }
  }, [pacotes]);

  // Filtrar pacotes que estão marcados
  const pacotesFiltrados = useMemo(() => {
    return pacotes.filter((p, idx) => pacotesSelecionados.includes(getPacoteKey(p, idx)));
  }, [pacotes, pacotesSelecionados]);

  // Totais calculados dinamicamente com base na seleção
  const totalM3 = useMemo(() => {
    return pacotesFiltrados.reduce((acc, p) => acc + (Number(p.total_m3) || 0), 0);
  }, [pacotesFiltrados]);

  const totalMl = useMemo(() => {
    return pacotesFiltrados.reduce((acc, p) => acc + (Number(p.total_ml) || 0), 0);
  }, [pacotesFiltrados]);

  // Texto formatado para o WhatsApp
  const mensagemFormatada = useMemo(() => {
    return gerarTextoWhatsApp(romaneio, pacotesFiltrados, mensagemExtra);
  }, [romaneio, pacotesFiltrados, mensagemExtra]);

  const handleTogglePacote = (key: string) => {
    setPacotesSelecionados(prev =>
      prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
    );
  };

  const handleSelecionarTodos = () => {
    setPacotesSelecionados(pacotes.map((p, idx) => getPacoteKey(p, idx)));
  };

  const handleDesmarcarTodos = () => {
    setPacotesSelecionados([]);
  };

  const handleCopiarMensagem = async () => {
    try {
      await navigator.clipboard.writeText(mensagemFormatada);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback
    }
  };

  const extrairBase64DoPdf = async (pdfDoc: any): Promise<string> => {
    if (!pdfDoc) {
      throw new Error('Documento PDF não foi gerado.');
    }

    const extrair = async (): Promise<string> => {
      // No pdfmake 0.3+, getBase64() retorna diretamente uma Promise<string>
      if (typeof pdfDoc.getBase64 === 'function') {
        try {
          const resultado = pdfDoc.getBase64();
          if (resultado && typeof resultado.then === 'function') {
            const data = await resultado;
            if (data) return data;
          } else if (typeof resultado === 'string' && resultado) {
            return resultado;
          }
        } catch (e) {
          console.warn('getBase64() via Promise falhou, tentando fallback por callback:', e);
        }

        // Fallback para assinaturas legadas com callback caso não retorne Promise
        try {
          const dataFromCb = await new Promise<string>((resolve, reject) => {
            pdfDoc.getBase64((data: string) => {
              if (data) resolve(data);
              else reject(new Error('Base64 vazio recebido no callback.'));
            });
          });
          if (dataFromCb) return dataFromCb;
        } catch {
          // segue para getBlob
        }
      }

      // Método 2: Fallback via getBlob (compatível com Promise e Callback)
      if (typeof pdfDoc.getBlob === 'function') {
        let blob: Blob | null = null;
        try {
          const blobRes = pdfDoc.getBlob();
          if (blobRes && typeof blobRes.then === 'function') {
            blob = await blobRes;
          }
        } catch {
          // tenta callback
        }

        if (!blob) {
          blob = await new Promise<Blob>((resolve, reject) => {
            pdfDoc.getBlob((b: Blob) => {
              if (b) resolve(b);
              else reject(new Error('Blob vazio gerado pelo PDF.'));
            });
          });
        }

        if (!blob) throw new Error('Não foi possível obter o Blob do PDF.');

        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = reader.result as string;
            if (res && res.includes(',')) {
              resolve(res.split(',')[1]);
            } else {
              resolve(res || '');
            }
          };
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(blob);
        });
      }

      throw new Error('Função de extração do PDF não encontrada no pdfDoc.');
    };

    // Timeout de segurança de 15 segundos
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Tempo limite excedido ao processar o PDF (mais de 15 segundos).'));
      }, 15000);
    });

    return Promise.race([extrair(), timeoutPromise]);
  };

  const handleEnviarDireto = async () => {
    if (!telefone || !telefone.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Número Obrigatório',
        text: 'Informe o número do WhatsApp do destinatário com DDD.',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl' }
      });
      return;
    }

    if (pacotesFiltrados.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Selecione os Pacotes',
        text: 'Você precisa selecionar pelo menos um pacote para enviar.',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl' }
      });
      return;
    }

    setEnviando(true);

    try {
      const nomeClienteLimpo = (romaneio.cliente || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
      const numeroFormatado = romaneio.id.toString().padStart(4, '0');
      const fileName = `Romaneio_${numeroFormatado}_${nomeClienteLimpo}.pdf`;

      // 1. Gerar documento PDF
      const pdfDoc = gerarPdfRomaneio(romaneio, pacotesFiltrados);
      const base64Data = await extrairBase64DoPdf(pdfDoc);

      if (!base64Data) {
        throw new Error('Falha ao processar o arquivo PDF para envio.');
      }

      // 2. Chamar envio direto via Baileys no Electron
      if (!window.electronAPI?.whatsapp?.sendRomaneio) {
        throw new Error('Módulo de WhatsApp não disponível.');
      }

      const res = await window.electronAPI.whatsapp.sendRomaneio({
        telefone,
        mensagem: mensagemFormatada,
        pdfBase64: base64Data,
        fileName
      });

      if (!res.success) {
        throw new Error(res.error || 'Falha ao enviar romaneio pelo WhatsApp.');
      }

      onClose();

      Swal.fire({
        icon: 'success',
        title: 'Romaneio Enviado com Sucesso',
        width: 480,
        html: `
          <div class="space-y-3.5 my-3 text-left">
            <div class="p-4 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60">
              <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5 font-bold text-sm">
                  ✓
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-xs font-bold text-emerald-950 dark:text-emerald-200 uppercase tracking-wider mb-1">
                    Entrega Concluída no WhatsApp
                  </h4>
                  <p class="text-xs font-bold text-emerald-800 dark:text-emerald-300 leading-relaxed break-all">
                    📄 ${fileName}
                  </p>
                  <p class="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-1">
                    O PDF e o resumo detalhado dos pacotes foram entregues diretamente ao contato.
                  </p>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs">
              <span class="text-slate-500 dark:text-slate-400 font-medium">Destinatário:</span>
              <span class="font-bold text-slate-800 dark:text-slate-200 font-mono text-sm tracking-wide">${telefone}</span>
            </div>
          </div>
        `,
        confirmButtonText: 'Excelente!',
        confirmButtonColor: '#059669',
        customClass: {
          popup: 'rounded-3xl p-6 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 shadow-2xl',
          title: 'text-xl font-black text-slate-800 dark:text-white',
          confirmButton: 'rounded-xl font-bold px-8 py-3 text-sm cursor-pointer shadow-lg shadow-emerald-500/20'
        }
      });
    } catch (error: any) {
      console.error('Erro no envio direto WhatsApp:', error);
      Swal.fire({
        icon: 'error',
        title: 'Falha no Envio Direto',
        text: error?.message || 'Ocorreu um erro ao enviar o documento pelo WhatsApp.',
        confirmButtonColor: '#ef4444',
        customClass: { popup: 'rounded-3xl' }
      });
    } finally {
      setEnviando(false);
    }
  };

  const handleCompartilharWhatsAppWeb = async () => {
    if (pacotesFiltrados.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Selecione os Pacotes',
        text: 'Você precisa selecionar pelo menos um pacote para compartilhar.',
        confirmButtonColor: '#10b981',
        customClass: { popup: 'rounded-3xl' }
      });
      return;
    }

    setEnviando(true);

    try {
      const nomeClienteLimpo = (romaneio.cliente || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
      const numeroFormatado = romaneio.id.toString().padStart(4, '0');
      const fileName = `Romaneio_${numeroFormatado}_${nomeClienteLimpo}.pdf`;

      // 1. Gerar o documento PDF
      const pdfDoc = gerarPdfRomaneio(romaneio, pacotesFiltrados);

      // 2. Tentar salvar arquivo PDF via Electron ou fallback para download direto
      let filePathSaved = '';
      try {
        const base64Data = await extrairBase64DoPdf(pdfDoc);
        if (window.electronAPI?.saveTempPdf && base64Data) {
          const resSave = await window.electronAPI.saveTempPdf(fileName, base64Data);
          if (resSave && resSave.success && resSave.filePath) {
            filePathSaved = resSave.filePath;
          }
        }
      } catch (pdfErr) {
        console.warn('Fallback: executando download direto do PDF:', pdfErr);
        try {
          pdfDoc.download(fileName);
        } catch (dlErr) {
          console.error('Erro no download direto:', dlErr);
        }
      }

      // 3. Copiar o texto da mensagem para o Clipboard
      try {
        await navigator.clipboard.writeText(mensagemFormatada);
      } catch {
        // Ignora se clipboard falhar
      }

      // 4. Gerar o link do WhatsApp Web e abrir no navegador padrão
      const whatsappUrl = obterLinkWhatsApp(telefone, mensagemFormatada);
      
      if (window.electronAPI?.openExternalUrl) {
        try {
          await window.electronAPI.openExternalUrl(whatsappUrl);
        } catch {
          window.open(whatsappUrl, '_blank');
        }
      } else {
        window.open(whatsappUrl, '_blank');
      }

      // 5. Destacar o arquivo no Windows Explorer para o usuário arrastar facilmente
      if (filePathSaved && window.electronAPI?.showItemInFolder) {
        setTimeout(async () => {
          try {
            await window.electronAPI.showItemInFolder(filePathSaved);
          } catch (e) {
            console.warn('Erro ao abrir pasta:', e);
          }
        }, 400);
      }

      // 6. Feedback de sucesso e instrução ao usuário
      onClose();

      Swal.fire({
        icon: 'success',
        title: 'WhatsApp Web Aberto!',
        html: `
          <div class="text-left text-xs text-slate-600 dark:text-slate-350 space-y-3 font-medium mt-2 leading-relaxed">
            <p class="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-2">
              <span class="text-base">✅</span> A conversa e o texto formatado foram abertos no WhatsApp Web.
            </p>
            <div class="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <span class="font-bold text-slate-800 dark:text-slate-200 block mb-1">📎 Envio do PDF:</span>
              <span>${filePathSaved 
                ? `O arquivo <strong>${fileName}</strong> foi preparado na pasta de Romaneios. Basta <strong>arrastar e soltar</strong> na conversa do WhatsApp!` 
                : `O arquivo PDF foi baixado no seu computador. Basta anexá-lo na conversa.`}</span>
            </div>
            <p class="text-[11px] text-slate-400">💡 O resumo também foi copiado para a sua área de transferência.</p>
          </div>
        `,
        confirmButtonText: 'Entendi',
        confirmButtonColor: '#10b981',
        customClass: {
          popup: 'rounded-3xl p-6 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800',
          title: 'text-xl font-black text-slate-800 dark:text-white',
          confirmButton: 'rounded-xl font-bold px-6 py-2.5 text-sm cursor-pointer'
        }
      });

    } catch (error: any) {
      console.error('Erro ao compartilhar via WhatsApp:', error);
      Swal.fire({
        icon: 'error',
        title: 'Erro ao Abrir WhatsApp',
        text: error?.message || 'Ocorreu um erro ao preparar o PDF e abrir o WhatsApp.',
        confirmButtonColor: '#ef4444',
        customClass: { popup: 'rounded-3xl' }
      });
    } finally {
      setEnviando(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[99990] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop com Blur */}
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
          className="relative w-full max-w-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 my-8 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="relative px-6 sm:px-8 py-5 border-b border-slate-100 dark:border-slate-850 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#25D366] text-white flex items-center justify-center shadow-lg shadow-[#25D366]/30">
                <WhatsAppIcon size={26} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  Enviar Romaneio no WhatsApp
                </h3>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Romaneio #{romaneio.id.toString().padStart(4, '0')} • {romaneio.cliente || 'Consumidor'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-850 transition-all cursor-pointer"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>

          {/* Conteúdo do Modal */}
          <div className="p-6 sm:p-8 overflow-y-auto space-y-6 custom-scrollbar flex-1">
            {/* Banner de Status da Conexão Direta (Baileys) */}
            <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs transition-all shadow-xs ${
              waStatus === 'connected'
                ? 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                : 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center shrink-0">
                  <span className={`w-3 h-3 rounded-full ${waStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {waStatus === 'connected' && (
                    <span className="absolute w-3 h-3 rounded-full bg-emerald-400 animate-ping opacity-75" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-xs font-black tracking-wide">
                      {waStatus === 'connected' ? 'WhatsApp Integrado Conectado' : 'WhatsApp Direto Desconectado'}
                    </strong>
                    {waStatus === 'connected' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                        Ativo
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium block mt-0.5">
                    {waStatus === 'connected'
                      ? `Pronto para envio imediato (Vinculado: +${waUser?.phone || 'Dispositivo'})`
                      : 'Conecte seu WhatsApp para enviar romaneios com 1 clique diretamente do sistema.'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalConexaoAberto(true)}
                className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs ${
                  waStatus === 'connected'
                    ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 active:scale-95'
                }`}
              >
                {waStatus === 'connected' ? 'Configurar Aparelho' : 'Conectar Agora'}
              </button>
            </div>

            {/* Input de Telefone / Destinatário */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Phone size={14} className="text-emerald-500" /> WhatsApp do Destinatário:
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="(00) 00000-0000"
                  value={telefone}
                  onChange={(e) => setTelefone(formatarMascaraTelefone(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition-all placeholder:text-slate-400 placeholder:font-normal"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                  DDD + Número
                </span>
              </div>
            </div>

            {/* Seleção de Pacotes para Incluir no Texto */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Box size={14} className="text-emerald-500" /> Pacotes para Incluir no Resumo:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelecionarTodos}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Marcar Todos
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <button
                    type="button"
                    onClick={handleDesmarcarTodos}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline cursor-pointer"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-2.5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/60 dark:bg-slate-900/40 custom-scrollbar">
                {pacotes.map((pacote, idx) => {
                  const key = getPacoteKey(pacote, idx);
                  const isChecked = pacotesSelecionados.includes(key);
                  return (
                    <div
                      key={key}
                      onClick={() => handleTogglePacote(key)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                        isChecked
                          ? 'bg-white dark:bg-slate-850 border-emerald-400/80 dark:border-emerald-500/60 shadow-xs'
                          : 'bg-white/40 dark:bg-slate-900/50 border-transparent opacity-60 hover:opacity-100 hover:bg-white dark:hover:bg-slate-850'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isChecked ? (
                          <CheckSquare size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <Square size={16} className="text-slate-400 shrink-0" />
                        )}
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          Pacote {pacote.numero_pacote} {pacote.especie ? `• ${pacote.especie}` : ''}
                        </span>
                      </div>
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 shrink-0 ml-2 border border-emerald-200/50 dark:border-emerald-800/40">
                        {Number(pacote.total_m3 || 0).toFixed(3)} m³
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Badges de Totais dos Selecionados */}
              <div className="flex items-center justify-between pt-1 px-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>Volume selecionado:</span>
                <div className="flex gap-3">
                  <span className="text-slate-800 dark:text-slate-200 font-semibold">{totalMl.toFixed(2).replace('.', ',')} ML</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-black">{totalM3.toFixed(3).replace('.', ',')} M³</span>
                </div>
              </div>
            </div>

            {/* Mensagem Opcional Extra */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <MessageSquare size={14} className="text-emerald-500" /> Observação ou Nota Extra (Opcional):
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Segue romaneio para conferência da carga..."
                value={mensagemExtra}
                onChange={(e) => setMensagemExtra(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-xs font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition-all resize-none placeholder:text-slate-400"
              />
            </div>

            {/* Preview da Mensagem */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <FileText size={14} className="text-emerald-500" /> Prévia da Mensagem:
                </label>
                <button
                  type="button"
                  onClick={handleCopiarMensagem}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer transition-colors"
                >
                  {copiado ? (
                    <>
                      <Check size={14} className="text-emerald-500" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copiar Texto
                    </>
                  )}
                </button>
              </div>
              <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl font-mono text-[11px] leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap border border-slate-800 custom-scrollbar selection:bg-emerald-500 selection:text-white">
                {mensagemFormatada}
              </div>
            </div>
          </div>

          {/* Footer de Ações */}
          <div className="px-6 sm:px-8 py-4 border-t border-slate-100 dark:border-slate-850 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Cancelar
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleCompartilharWhatsAppWeb}
                disabled={enviando}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all cursor-pointer shadow-2xs hover:border-slate-300 dark:hover:border-slate-600"
                title="Abre a conversa no navegador com o texto preparado"
              >
                Abrir WhatsApp Web
              </button>

              <button
                type="button"
                onClick={waStatus === 'connected' ? handleEnviarDireto : () => setModalConexaoAberto(true)}
                disabled={enviando}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs text-white transition-all shadow-md cursor-pointer ${
                  enviando
                    ? 'bg-slate-700 cursor-not-allowed opacity-75'
                    : 'bg-[#25D366] hover:bg-[#20bd5a] shadow-[#25D366]/25 hover:shadow-[#25D366]/40 hover:-translate-y-0.5 active:translate-y-0'
                }`}
              >
                {enviando ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Enviando Romaneio...</span>
                  </>
                ) : (
                  <>
                    <WhatsAppIcon size={16} />
                    <span>{waStatus === 'connected' ? 'Enviar Romaneio Direto' : 'Conectar e Enviar'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </motion.div>
      </div>

      {/* Modal de Conexão com QR Code */}
      <ModalConexaoWhatsApp
        isOpen={modalConexaoAberto}
        onClose={() => setModalConexaoAberto(false)}
      />
    </AnimatePresence>,
    document.body
  );
};
