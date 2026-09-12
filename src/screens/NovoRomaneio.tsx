import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRomaneioStore } from '../store/useRomaneioStore';
import GridCubagem from '../components/GridCubagem';
import { ModalTipoRomaneio } from '../components/ModalTipoRomaneio';
import {
  Plus, Save, Trash2, BarChart3, ChevronDown, ChevronUp,
  Copy, RotateCcw, AlertTriangle, Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'framer-motion';
import {
  calcularVolumeM3,
  calcularMetrosLineares,
  calcularResumosConsolidados
} from '../utils/cubagemEngine';

interface CardPacoteProps {
  pacoteId: string;
  numero: number;
  especie: string;
  index: number;
  totalPacotes: number;
  especiesList: any[];
  onNumeroChange: (id: string, numero: number) => void;
  onEspecieChange: (id: string, especie: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

const CardPacoteComponent = ({
  pacoteId,
  numero,
  especie,
  index,
  totalPacotes,
  especiesList,
  onNumeroChange,
  onEspecieChange,
  onDuplicate,
  onRemove
}: CardPacoteProps) => {
  return (
    <div className="glass-card p-6 border border-slate-200/50 dark:border-slate-800/50 transition-all">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Pacote Nº
          </span>
          <input
            type="number"
            min="1"
            className="w-20 glass-input px-3 py-2 text-center font-black text-slate-800 dark:text-slate-100 text-lg"
            value={numero}
            onChange={e => onNumeroChange(pacoteId, Number(e.target.value) || 1)}
          />
        </div>

        <div className="flex-1 max-w-md w-full">
          <div className="flex items-center gap-3">
            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest shrink-0">
              Espécie: <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              list={`especies-list-${pacoteId}`}
              placeholder="Selecione ou digite"
              className={`w-full glass-input px-4 py-2.5 font-bold text-slate-800 dark:text-slate-100 text-sm ${
                !especie.trim()
                  ? 'border-amber-300/60 dark:border-amber-900/40'
                  : 'border-emerald-300/60 dark:border-emerald-900/40'
              }`}
              value={especie}
              onChange={e => onEspecieChange(pacoteId, e.target.value)}
            />
            <datalist id={`especies-list-${pacoteId}`}>
              {especiesList.map(esp => (
                <option key={esp.id} value={esp.nome} className="dark:bg-slate-900 dark:text-slate-200">
                  {esp.cientifico ? `${esp.nome} (${esp.cientifico})` : esp.nome}
                </option>
              ))}
            </datalist>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onDuplicate(pacoteId)}
            className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 px-3.5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-1.5 border border-slate-200/60 dark:border-slate-700 cursor-pointer"
            title="Duplicar este pacote com todas as suas peças"
          >
            <Copy size={15} /> Duplicar Pacote
          </button>

          {totalPacotes > 1 && (
            <button
              type="button"
              onClick={() => onRemove(pacoteId)}
              className="text-xs text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 px-3.5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-1.5 border border-red-100 dark:border-red-900/30 cursor-pointer"
              title="Remover pacote"
            >
              <Trash2 size={15} /> Remover
            </button>
          )}
        </div>
      </div>

      <GridCubagem pacoteId={pacoteId} pacoteIndex={index} />
    </div>
  );
};

const CardPacote = React.memo(CardPacoteComponent, (prev, next) => {
  return (
    prev.pacoteId === next.pacoteId &&
    prev.numero === next.numero &&
    prev.especie === next.especie &&
    prev.index === next.index &&
    prev.totalPacotes === next.totalPacotes &&
    prev.especiesList === next.especiesList
  );
});

CardPacote.displayName = 'CardPacote';

export default function NovoRomaneio() {
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);
  const [mostrarResumo, setMostrarResumo] = useState(false);
  const [especiesList, setEspeciesList] = useState<any[]>([]);
  const [clienteError, setClienteError] = useState(false);
  const [addPacoteError, setAddPacoteError] = useState('');
  const [temRascunhoAviso, setTemRascunhoAviso] = useState(false);
  const [modalTipoAberto, setModalTipoAberto] = useState(false);

  const cliente = useRomaneioStore(state => state.cliente);
  const data = useRomaneioStore(state => state.data);
  const pacotes = useRomaneioStore(state => state.pacotes);
  const setCliente = useRomaneioStore(state => state.setCliente);
  const setData = useRomaneioStore(state => state.setData);
  const addPacote = useRomaneioStore(state => state.addPacote);
  const removePacote = useRomaneioStore(state => state.removePacote);
  const duplicatePacote = useRomaneioStore(state => state.duplicatePacote);
  const setEspeciePacote = useRomaneioStore(state => state.setEspeciePacote);
  const setNumeroPacote = useRomaneioStore(state => state.setNumeroPacote);
  const resetForm = useRomaneioStore(state => state.resetForm);
  const tipoRomaneio = useRomaneioStore(state => state.tipoRomaneio);
  const setTipoRomaneio = useRomaneioStore(state => state.setTipoRomaneio);
  const carregarRascunho = useRomaneioStore(state => state.carregarRascunho);
  const limparRascunho = useRomaneioStore(state => state.limparRascunho);
  const temRascunhoSalvo = useRomaneioStore(state => state.temRascunhoSalvo);

  // Carregar lista de espécies
  useEffect(() => {
    const buscarEspecies = async () => {
      try {
        const res = await window.electronAPI.queryDB('SELECT * FROM especies ORDER BY nome');
        if (res.success && res.data) setEspeciesList(res.data);
      } catch (err) {
        console.error('Erro ao buscar espécies', err);
      }
    };
    buscarEspecies();
  }, []);

  // Checar se há rascunho salvo ao abrir a tela
  useEffect(() => {
    if (temRascunhoSalvo()) {
      setTemRascunhoAviso(true);
    }
  }, [temRascunhoSalvo]);

  const handleRestaurarRascunho = useCallback(() => {
    const ok = carregarRascunho();
    if (ok) {
      setTemRascunhoAviso(false);
      Swal.fire({
        icon: 'success',
        title: 'Rascunho Restaurado!',
        text: 'Seus dados foram recuperados com sucesso.',
        timer: 1800,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    }
  }, [carregarRascunho]);

  const handleDescartarRascunho = useCallback(() => {
    limparRascunho();
    resetForm();
    setTemRascunhoAviso(false);
    Swal.fire({
      icon: 'info',
      title: 'Rascunho Descartado',
      text: 'O rascunho anterior foi descartado.',
      timer: 1600,
      showConfirmButton: false,
      toast: true,
      position: 'top-end'
    });
  }, [limparRascunho, resetForm]);

  const handleAddPacote = useCallback(() => {
    const lastPacote = pacotes[pacotes.length - 1];
    if (lastPacote) {
      const temEspecie = lastPacote.especie && lastPacote.especie.trim().length > 0;
      const temLinhaCompleta = lastPacote.itens.some(
        i =>
          i.espessura !== '' &&
          i.largura !== '' &&
          i.comprimento !== '' &&
          i.quantidade !== '' &&
          Number(i.espessura) > 0 &&
          Number(i.comprimento) > 0 &&
          Number(i.quantidade) > 0
      );
      if (!temEspecie) {
        setAddPacoteError('Defina a espécie do pacote atual antes de adicionar um novo.');
        setTimeout(() => setAddPacoteError(''), 3500);
        return;
      }
      if (!temLinhaCompleta) {
        setAddPacoteError('Preencha pelo menos uma linha de cubagem completa no pacote atual.');
        setTimeout(() => setAddPacoteError(''), 3500);
        return;
      }
    }
    setAddPacoteError('');
    addPacote();
  }, [addPacote, pacotes]);

  const totaisGerais = useMemo(() => {
    let totalM3 = 0;
    let totalML = 0;
    let totalPecas = 0;

    for (let p = 0; p < (pacotes || []).length; p++) {
      const pacote = pacotes[p];
      const itens = pacote.itens || [];
      for (let i = 0; i < itens.length; i++) {
        const it = itens[i];
        if (it.espessura && it.largura && it.comprimento && it.quantidade) {
          totalM3 += calcularVolumeM3(it.espessura, it.largura, it.comprimento, it.quantidade, tipoRomaneio);
          totalML += calcularMetrosLineares(it.comprimento, it.quantidade, tipoRomaneio);
          totalPecas += Number(it.quantidade) || 0;
        }
      }
    }

    return { totalGeralM3: totalM3, totalGeralML: totalML, totalGeralPecas: totalPecas };
  }, [pacotes, tipoRomaneio]);

  const totalGeralM3 = totaisGerais.totalGeralM3;
  const totalGeralML = totaisGerais.totalGeralML;

  const resumos = useMemo(() => {
    if (!mostrarResumo) return null;
    return calcularResumosConsolidados(pacotes, tipoRomaneio);
  }, [pacotes, tipoRomaneio, mostrarResumo]);

  const salvarRomaneio = useCallback(async () => {
    if (!cliente.trim()) {
      setClienteError(true);
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: 'Preencha o nome do fornecedor/cliente antes de salvar.',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md' }
      });
      return;
    }

    const isLarguraValida = (l: unknown) => {
      if (l === '' || l === undefined || l === null) return false;
      const lStr = String(l).trim();
      if (lStr === '') return false;
      if (tipoRomaneio === 'aberta' && /[\s-]+/.test(lStr)) {
        const partes = lStr.split(/\s*-\s*|\s+/);
        return partes.length > 0 && partes.every(p => {
          const num = Number(p);
          return !isNaN(num) && num > 0;
        });
      }
      if ((tipoRomaneio === 'padrao' || tipoRomaneio === 'pes') && /[\s-]+/.test(lStr)) return false;
      const num = Number(lStr);
      return !isNaN(num) && num > 0;
    };

    const hasItemValido = (p: typeof pacotes[0]) => {
      return p.itens.some(
        i =>
          i.espessura &&
          i.largura &&
          i.comprimento &&
          i.quantidade &&
          Number(i.espessura) > 0 &&
          isLarguraValida(i.largura) &&
          Number(i.comprimento) > 0 &&
          Number(i.quantidade) > 0
      );
    };

    // Validar espécie de todos os pacotes
    const pacoteSemEspecie = pacotes.find(p => !p.especie || !p.especie.trim());
    if (pacoteSemEspecie) {
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: `Defina a espécie para todos os pacotes. (O Pacote Nº ${pacoteSemEspecie.numero} está sem espécie).`,
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md' }
      });
      return;
    }

    // Validar que todos os pacotes tenham pelo menos um item completo/válido
    const pacoteSemItens = pacotes.find(p => !hasItemValido(p));
    if (pacoteSemItens) {
      Swal.fire({
        icon: 'warning',
        title: 'Pacote Incompleto',
        text: `O Pacote Nº ${pacoteSemItens.numero} não possui nenhuma linha de cubagem preenchida corretamente.`,
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md' }
      });
      return;
    }

    setSalvando(true);

    try {
      const pacotesFormatados = pacotes.map(p => {
        let pM3 = 0;
        let pML = 0;
        const itensFormatados: any[] = [];

        const itensFiltrados = p.itens.filter(
          i =>
            i.espessura &&
            i.largura &&
            i.comprimento &&
            i.quantidade &&
            Number(i.espessura) > 0 &&
            isLarguraValida(i.largura) &&
            Number(i.comprimento) > 0 &&
            Number(i.quantidade) > 0
        );

        itensFiltrados.forEach(i => {
          const esp = Number(i.espessura);
          const comp = Number(i.comprimento);
          const lStr = String(i.largura).trim();

          if (tipoRomaneio === 'aberta' && /[\s-]+/.test(lStr)) {
            const larguras = lStr.split(/[\s-]+/).map(Number).filter(x => !isNaN(x) && x > 0);
            for (const l of larguras) {
              const subM3 = calcularVolumeM3(esp, l, comp, 1, tipoRomaneio);
              const subML = calcularMetrosLineares(comp, 1, tipoRomaneio);
              pM3 += subM3;
              pML += subML;
              itensFormatados.push({
                espessura: esp,
                largura: l,
                comprimento: comp,
                quantidade: 1,
                volume_m3: subM3,
                volume_ml: subML
              });
            }
          } else {
            const larg = Number(i.largura);
            const qtd = Number(i.quantidade);
            const itemM3 = calcularVolumeM3(esp, larg, comp, qtd, tipoRomaneio);
            const itemML = calcularMetrosLineares(comp, qtd, tipoRomaneio);
            pM3 += itemM3;
            pML += itemML;
            itensFormatados.push({
              espessura: esp,
              largura: larg,
              comprimento: comp,
              quantidade: qtd,
              volume_m3: itemM3,
              volume_ml: itemML
            });
          }
        });

        return {
          numero_pacote: p.numero,
          especie: p.especie.trim(),
          total_m3: pM3,
          total_ml: pML,
          itens: itensFormatados
        };
      });

      const payload = {
        cliente: cliente.trim(),
        data,
        tipo_romaneio: tipoRomaneio,
        total_m3: totalGeralM3,
        total_ml: totalGeralML,
        pacotes: pacotesFormatados
      };

      const res = await window.electronAPI.saveRomaneio(payload);
      if (!res.success) {
        throw new Error(res.error || 'Erro ao salvar romaneio');
      }

      // Limpar rascunho após salvar com sucesso
      limparRascunho();
      resetForm();

      const novoId = res.id;
      await Swal.fire({
        icon: 'success',
        title: 'Romaneio Salvo!',
        text: novoId ? `O Romaneio #${novoId} foi gravado com sucesso!` : 'Romaneio gravado com sucesso!',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3' }
      });

      if (novoId) {
        navigate(`/visualizar/${novoId}`);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Erro ao Salvar',
        text: err.message || 'Houve uma falha inesperada ao tentar salvar.',
        confirmButtonColor: '#059669'
      });
    } finally {
      setSalvando(false);
    }
  }, [cliente, data, pacotes, tipoRomaneio, totalGeralM3, totalGeralML, limparRascunho, resetForm, navigate]);

  // Atalhos de teclado globais
  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        salvarRomaneio();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleAddPacote();
      }
    };
    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => window.removeEventListener('keydown', handleKeyDownGlobal);
  }, [salvarRomaneio, handleAddPacote]);

  const getTipoLabel = () => {
    switch (tipoRomaneio) {
      case 'aberta':
        return 'Larguras Variadas (Bica Corrida)';
      case 'pes':
        return 'Pés Corridos / Polegadas (Exportação)';
      case 'padrao':
      default:
        return 'Larguras Fixas (Padrão M³)';
    }
  };

  return (
    <>
      <div className="space-y-6 max-w-7xl mx-auto pb-24">
        {/* Banner de Rascunho Recuperável */}
        <AnimatePresence>
          {temRascunhoAviso && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-amber-500/10 border border-amber-500/30 dark:bg-amber-500/10 dark:border-amber-500/20 p-4 rounded-2xl flex items-center justify-between gap-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                    Rascunho Não Salvo Encontrado
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    Existe um romaneio que você começou a preencher anteriormente. Deseja restaurá-lo?
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleRestaurarRascunho}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <RotateCcw size={14} /> Restaurar
                </button>
                <button
                  type="button"
                  onClick={handleDescartarRascunho}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
                >
                  Descartar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Header Card */}
        <div className="glass-card p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

          <div className="space-y-2 relative">
            <div className="flex items-center gap-3">
              <span className="badge badge-emerald">Novo Romaneio</span>
              <button
                type="button"
                onClick={() => setModalTipoAberto(true)}
                className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200/50 dark:border-emerald-800/40 flex items-center gap-1 transition-all cursor-pointer hover:shadow-xs"
              >
                <Sparkles size={13} /> {getTipoLabel()} • Trocar
              </button>
            </div>
            <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
              Lançamento de Romaneio
            </h1>
            <p className="text-sm text-slate-400 font-medium">
              Preencha os dados do cliente e lance os pacotes de madeira serrada.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 relative">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                Data do Romaneio
              </label>
              <input
                type="date"
                className="glass-input px-4 py-2.5 font-bold text-slate-700 dark:text-slate-200 text-sm"
                value={data}
                onChange={e => setData(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[240px]">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                Fornecedor / Cliente <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Madeireira São Bento"
                className={`w-full glass-input px-4 py-2.5 font-bold text-slate-800 dark:text-slate-100 text-sm ${
                  clienteError && !cliente.trim()
                    ? 'border-red-500 ring-2 ring-red-500/20'
                    : 'focus:border-emerald-500'
                }`}
                value={cliente}
                onChange={e => {
                  setCliente(e.target.value);
                  if (clienteError) setClienteError(false);
                }}
              />
            </div>
          </div>
        </div>

        {/* Lista de Pacotes */}
        <div className="space-y-6">
          {pacotes.map((pacote, index) => (
            <CardPacote
              key={pacote.id}
              pacoteId={pacote.id}
              numero={pacote.numero}
              especie={pacote.especie}
              index={index}
              totalPacotes={pacotes.length}
              especiesList={especiesList}
              onNumeroChange={setNumeroPacote}
              onEspecieChange={setEspeciePacote}
              onDuplicate={duplicatePacote}
              onRemove={removePacote}
            />
          ))}
        </div>

        {/* Botão Adicionar Pacote */}
        <div className="flex flex-col items-center justify-center gap-2 pt-2">
          {addPacoteError && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-900/50">
              <AlertTriangle size={14} /> {addPacoteError}
            </span>
          )}
          <button
            onClick={handleAddPacote}
            type="button"
            className="w-full md:w-auto px-8 py-4 glass-card border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all hover:shadow-lg cursor-pointer"
          >
            <Plus size={20} strokeWidth={3} /> Adicionar Novo Pacote
          </button>
        </div>

        {/* Painel Sanfona do Resumo Consolidado */}
        {totalGeralM3 > 0 && (
          <div className="glass-card overflow-hidden border border-slate-200/50 dark:border-slate-800/50">
            <button
              type="button"
              onClick={() => setMostrarResumo(!mostrarResumo)}
              className="w-full p-5 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <BarChart3 size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight">
                    Resumo Consolidado do Romaneio
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Totais por Espécie, Bitola e Faixas de Madeira
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-full font-black tracking-widest border border-slate-200 dark:border-slate-800 uppercase">
                  {mostrarResumo && resumos
                    ? `${resumos.porEspecie.length} Espécie(s) | ${resumos.totalPecasGeral} Peças`
                    : `${pacotes.length} Pacote(s) | ${totaisGerais.totalGeralPecas} Peças`}
                </span>
                {mostrarResumo ? (
                  <ChevronUp className="text-slate-400" size={20} strokeWidth={2.5} />
                ) : (
                  <ChevronDown className="text-slate-400" size={20} strokeWidth={2.5} />
                )}
              </div>
            </button>

            <AnimatePresence>
              {mostrarResumo && resumos && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="p-6 border-t border-slate-100 dark:border-slate-800 space-y-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Resumo por Espécie */}
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                        Consolidado por Espécie
                      </h4>
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-black tracking-widest border-b border-slate-200 dark:border-slate-800 text-[9px]">
                            <tr>
                              <th className="px-5 py-3.5">Espécie</th>
                              <th className="px-5 py-3.5 text-center">Peças</th>
                              <th className="px-5 py-3.5 text-center">Total ML</th>
                              <th className="px-5 py-3.5 text-center">Total M³</th>
                              <th className="px-5 py-3.5 text-center w-20">% Vol</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                            {resumos.porEspecie.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">{item.especie}</td>
                                <td className="px-5 py-3 text-center">{item.totalPecas}</td>
                                <td className="px-5 py-3 text-center">{item.totalMl.toFixed(2)}</td>
                                <td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450">
                                  {item.totalM3.toFixed(3)}
                                </td>
                                <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">
                                  {item.percentual.toFixed(1)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Resumo por Categoria de Comprimento */}
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                        Faixas de Comprimento
                      </h4>
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-black tracking-widest border-b border-slate-200 dark:border-slate-800 text-[9px]">
                            <tr>
                              <th className="px-5 py-3.5">Categoria</th>
                              <th className="px-5 py-3.5 text-center">Volume M³</th>
                              <th className="px-5 py-3.5 text-center w-24">% Volume</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                            {tipoRomaneio === 'pes' ? (
                              <>
                                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">
                                    6 PÉS E ABAIXO (&lt;= 6&apos;)
                                  </td>
                                  <td className="px-5 py-3 text-center font-black text-red-600 dark:text-red-450 bg-red-50/20 dark:bg-red-950/10">
                                    {resumos.totalAbaixo6M3.toFixed(3).replace('.', ',')}
                                  </td>
                                  <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">
                                    {(resumos.totalVolumeGeral > 0
                                      ? (resumos.totalAbaixo6M3 / resumos.totalVolumeGeral) * 100
                                      : 0
                                    ).toFixed(1)}
                                    %
                                  </td>
                                </tr>
                                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">
                                    7 PÉS (7&apos;)
                                  </td>
                                  <td className="px-5 py-3 text-center font-black text-amber-600 dark:text-amber-450 bg-amber-50/20 dark:bg-amber-950/10">
                                    {resumos.total7M3.toFixed(3).replace('.', ',')}
                                  </td>
                                  <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">
                                    {(resumos.totalVolumeGeral > 0
                                      ? (resumos.total7M3 / resumos.totalVolumeGeral) * 100
                                      : 0
                                    ).toFixed(1)}
                                    %
                                  </td>
                                </tr>
                                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">
                                    8 PÉS E ACIMA (&gt;= 8&apos;)
                                  </td>
                                  <td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450 bg-emerald-50/20 dark:bg-emerald-950/10">
                                    {resumos.totalAcima8M3.toFixed(3).replace('.', ',')}
                                  </td>
                                  <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">
                                    {(resumos.totalVolumeGeral > 0
                                      ? (resumos.totalAcima8M3 / resumos.totalVolumeGeral) * 100
                                      : 0
                                    ).toFixed(1)}
                                    %
                                  </td>
                                </tr>
                              </>
                            ) : (
                              <>
                                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">
                                    MADEIRA LONGA (&gt;= 2,00 m)
                                  </td>
                                  <td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450 bg-emerald-50/20 dark:bg-emerald-950/10">
                                    {resumos.totalMadeiraLongaM3.toFixed(3).replace('.', ',')}
                                  </td>
                                  <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">
                                    {(resumos.totalVolumeGeral > 0
                                      ? (resumos.totalMadeiraLongaM3 / resumos.totalVolumeGeral) * 100
                                      : 0
                                    ).toFixed(1)}
                                    %
                                  </td>
                                </tr>
                                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">
                                    SHORT (&lt;= 1,90 m)
                                  </td>
                                  <td className="px-5 py-3 text-center font-black text-red-600 dark:text-red-450 bg-red-50/20 dark:bg-red-950/10">
                                    {resumos.totalShortM3.toFixed(3).replace('.', ',')}
                                  </td>
                                  <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">
                                    {(resumos.totalVolumeGeral > 0
                                      ? (resumos.totalShortM3 / resumos.totalVolumeGeral) * 100
                                      : 0
                                    ).toFixed(1)}
                                    %
                                  </td>
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      Consolidado por Bitola (Seção)
                    </h4>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-black tracking-widest border-b border-slate-200 dark:border-slate-800 text-[9px]">
                          <tr>
                            <th className="px-5 py-3.5">Espécie</th>
                            <th className="px-5 py-3.5 text-center">Bitola (cm)</th>
                            <th className="px-5 py-3.5 text-center">Peças</th>
                            <th className="px-5 py-3.5 text-center">Total ML</th>
                            <th className="px-5 py-3.5 text-center">Total M³</th>
                            <th className="px-5 py-3.5 text-center w-20">% Vol</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                          {resumos.porBitola.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-5 py-3 text-slate-800 dark:text-slate-100">{item.especie}</td>
                              <td className="px-5 py-3 text-center font-black text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-950/25">
                                {item.espessura} <span className="text-[10px] text-slate-400 font-bold mx-0.5">X</span>{' '}
                                {item.largura}
                              </td>
                              <td className="px-5 py-3 text-center">{item.totalPecas}</td>
                              <td className="px-5 py-3 text-center">{item.totalMl.toFixed(2)}</td>
                              <td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450">
                                {item.totalM3.toFixed(3)}
                              </td>
                              <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">
                                {item.percentual.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Sticky Floating Footer Island */}
      <div className="w-full mx-auto sticky bottom-6 z-40 pointer-events-none">
        <div className="w-full bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 p-5 rounded-[2rem] flex items-center justify-between shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] pointer-events-auto text-white">
          <div className="text-slate-400 text-xs font-semibold hidden md:block">
            Atalhos: <kbd className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300">Ctrl+S</kbd> Salvar | <kbd className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300">Ctrl+Enter</kbd> Novo Pacote
          </div>
          <div className="flex gap-8 items-center ml-auto md:ml-0">
            <div className="text-right">
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Total ML</span>
              <span className="text-2xl font-black text-slate-100">{totalGeralML.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Total M³</span>
              <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
                {totalGeralM3.toFixed(3)}
              </span>
            </div>
            <button
              onClick={salvarRomaneio}
              disabled={salvando}
              className={`px-6 py-3.5 rounded-2xl font-black transition-all ml-4 flex items-center gap-2 cursor-pointer ${
                salvando
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] hover:-translate-y-1'
              }`}
            >
              <Save size={18} strokeWidth={2.5} />
              {salvando ? 'Salvando...' : 'Salvar Romaneio'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal para Troca de Tipo de Romaneio */}
      <ModalTipoRomaneio
        isOpen={modalTipoAberto}
        onClose={() => setModalTipoAberto(false)}
        onSelect={(tipo) => {
          setTipoRomaneio(tipo);
          setModalTipoAberto(false);
        }}
        tipoAtual={tipoRomaneio}
      />
    </>
  );
}
