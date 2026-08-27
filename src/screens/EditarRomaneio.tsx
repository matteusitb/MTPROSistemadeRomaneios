import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRomaneioStore } from '../store/useRomaneioStore';
import GridCubagem from '../components/GridCubagem';
import { Plus, Save, Trash2, PackageSearch, ArrowLeft, Loader2, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'framer-motion';

export default function EditarRomaneio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);
  const [mostrarResumo, setMostrarResumo] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [especiesList, setEspeciesList] = useState<any[]>([]);
  const [clienteError, setClienteError] = useState(false);
  const [addPacoteError, setAddPacoteError] = useState('');

  const store = useRomaneioStore();
  const { 
    cliente, data, pacotes, setCliente, setData, addPacote, removePacote, setEspeciePacote, 
    setNumeroPacote, loadRomaneio, resetForm
  } = store;

  useEffect(() => {
    const carregar = async () => {
      if (!id) return;
      setCarregando(true);
      try {
        const espRes = await window.electronAPI.queryDB('SELECT * FROM especies ORDER BY nome');
        if (espRes.success && espRes.data) setEspeciesList(espRes.data);

        const rResult = await window.electronAPI.queryDB(`
          SELECT r.id, r.data, c.nome as cliente, r.total_m3, r.total_ml, r.tipo_romaneio
          FROM romaneios r LEFT JOIN clientes c ON r.cliente_id = c.id WHERE r.id = ?
        `, [Number(id)]);

        if (!rResult.success || !rResult.data || rResult.data.length === 0) {
          Swal.fire({ icon: 'error', title: 'Erro', text: 'Romaneio não encontrado.' });
          navigate('/'); return;
        }

        const romaneio = rResult.data[0] as any;

        const pResult = await window.electronAPI.queryDB(`
          SELECT rp.*, COALESCE(e.nome, e_glob.nome) as especie
          FROM romaneio_pacotes rp
          LEFT JOIN especies e ON rp.especie_id = e.id
          LEFT JOIN romaneios r ON rp.romaneio_id = r.id
          LEFT JOIN especies e_glob ON r.especie_id = e_glob.id
          WHERE rp.romaneio_id = ? ORDER BY rp.numero_pacote
        `, [Number(id)]);
        
        const pacotesBD = pResult.data || [];

        for (const pacote of pacotesBD) {
          const iResult = await window.electronAPI.queryDB('SELECT * FROM romaneio_itens WHERE pacote_id = ?', [pacote.id]);
          pacote.itens = iResult.data || [];
        }

        loadRomaneio({ cliente: romaneio.cliente, data: romaneio.data, pacotes: pacotesBD, tipoRomaneio: romaneio.tipo_romaneio || 'padrao' });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha ao carregar o romaneio.' }); navigate('/');
      } finally { setCarregando(false); }
    };
    carregar();
    return () => { resetForm(); };
  }, [id]);

  const calcularM3 = (espessura: any, largura: any, comprimento: any, qtd: any) => {
    const e = Number(espessura), c = Number(comprimento);
    if (!e || !c) return 0;
    const cMetros = store.tipoRomaneio === 'pes' ? c * 0.3048 : c;
    const largStr = String(largura).trim();
    if (/[\s-]+/.test(largStr)) {
      const largSoma = largStr.split(/\s*-\s*|\s+/).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
      return (e / 100) * (largSoma / 100) * cMetros;
    }
    const l = Number(largura), q = Number(qtd);
    if (!l || !q) return 0;
    return (e / 100) * (l / 100) * cMetros * q;
  };

  const calcularML = (comprimento: any, qtd: any) => {
    const c = Number(comprimento), q = Number(qtd);
    if (!c || !q) return 0;
    const cMetros = store.tipoRomaneio === 'pes' ? c * 0.3048 : c;
    return cMetros * q;
  };

  const handleAddPacote = () => {
    const lastPacote = pacotes[pacotes.length - 1];
    if (lastPacote) {
      const temEspecie = lastPacote.especie && lastPacote.especie.trim().length > 0;
      const temLinhaCompleta = lastPacote.itens.some(i =>
        i.espessura !== '' && i.largura !== '' && i.comprimento !== '' && i.quantidade !== '' &&
        Number(i.espessura) > 0 && Number(i.comprimento) > 0 && Number(i.quantidade) > 0
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
  };

  let totalGeralM3 = 0, totalGeralML = 0;
  pacotes.forEach(p => p.itens.forEach(i => {
    totalGeralM3 += calcularM3(i.espessura, i.largura, i.comprimento, i.quantidade);
    totalGeralML += calcularML(i.comprimento, i.quantidade);
  }));

  const resumos = useMemo(() => {
    const resumoEspecieMap: { [key: string]: { especie: string; totalMl: number; totalM3: number } } = {};
    const resumoBitolaMap: { [key: string]: { especie: string; espessura: number; largura: number; totalMl: number; totalM3: number } } = {};
    let totalMadeiraLongaM3 = 0;
    let totalShortM3 = 0;
    let totalAbaixo6M3 = 0;
    let total7M3 = 0;
    let totalAcima8M3 = 0;

    pacotes.forEach(p => {
      const especie = p.especie?.trim() || 'Sem espécie';
      p.itens.forEach((i: any) => {
        const e = Number(i.espessura) || 0, lVal = i.largura, c = Number(i.comprimento) || 0, q = Number(i.quantidade) || 0;
        if (!e || !lVal || !c || !q) return;
        
        const cMetros = store.tipoRomaneio === 'pes' ? c * 0.3048 : c;
        const lStr = String(lVal).trim();
        if (/[\s-]+/.test(lStr)) {
          const larguras = lStr.split(/\s*-\s*|\s+/).map(Number).filter(x => !isNaN(x) && x > 0);
          larguras.forEach(l => {
            const m3 = (e / 100) * (l / 100) * cMetros * 1, ml = cMetros * 1;
            
            if (store.tipoRomaneio === 'pes') {
              if (c <= 6) {
                totalAbaixo6M3 += m3;
              } else if (c > 6 && c < 8) {
                total7M3 += m3;
              } else {
                totalAcima8M3 += m3;
              }
            } else {
              if (cMetros >= 2.00) {
                totalMadeiraLongaM3 += m3;
              } else {
                totalShortM3 += m3;
              }
            }

            if (!resumoEspecieMap[especie]) resumoEspecieMap[especie] = { especie, totalMl: 0, totalM3: 0 };
            resumoEspecieMap[especie].totalMl += ml; resumoEspecieMap[especie].totalM3 += m3;
            
            const bitolaKey = `${especie}_${e}_${l}`;
            if (!resumoBitolaMap[bitolaKey]) resumoBitolaMap[bitolaKey] = { especie, espessura: e, largura: l, totalMl: 0, totalM3: 0 };
            resumoBitolaMap[bitolaKey].totalMl += ml; resumoBitolaMap[bitolaKey].totalM3 += m3;
          });
        } else {
          const l = Number(lVal) || 0, m3 = (e / 100) * (l / 100) * cMetros * q, ml = cMetros * q;
          
          if (store.tipoRomaneio === 'pes') {
            if (c <= 6) {
              totalAbaixo6M3 += m3;
            } else if (c > 6 && c < 8) {
              total7M3 += m3;
            } else {
              totalAcima8M3 += m3;
            }
          } else {
            if (cMetros >= 2.00) {
              totalMadeiraLongaM3 += m3;
            } else {
              totalShortM3 += m3;
            }
          }

          if (!resumoEspecieMap[especie]) resumoEspecieMap[especie] = { especie, totalMl: 0, totalM3: 0 };
          resumoEspecieMap[especie].totalMl += ml; resumoEspecieMap[especie].totalM3 += m3;
          
          const bitolaKey = `${especie}_${e}_${l}`;
          if (!resumoBitolaMap[bitolaKey]) resumoBitolaMap[bitolaKey] = { especie, espessura: e, largura: l, totalMl: 0, totalM3: 0 };
          resumoBitolaMap[bitolaKey].totalMl += ml; resumoBitolaMap[bitolaKey].totalM3 += m3;
        }
      });
    });

    const totalVolumeGeral = Object.values(resumoEspecieMap).reduce((acc, curr) => acc + curr.totalM3, 0);

    return {
      porEspecie: Object.values(resumoEspecieMap).sort((a, b) => b.totalM3 - a.totalM3).map(x => ({ ...x, percentual: totalVolumeGeral > 0 ? (x.totalM3 / totalVolumeGeral) * 100 : 0 })),
      porBitola: Object.values(resumoBitolaMap).sort((a, b) => {
          if (a.especie !== b.especie) return a.especie.localeCompare(b.especie);
          if (a.espessura !== b.espessura) return b.espessura - a.espessura;
          return b.largura - a.largura;
        }).map(x => ({ ...x, percentual: totalVolumeGeral > 0 ? (x.totalM3 / totalVolumeGeral) * 100 : 0 })),
      totalMadeiraLongaM3,
      totalShortM3,
      totalAbaixo6M3,
      total7M3,
      totalAcima8M3,
      totalVolumeGeral
    };
  }, [pacotes]);

  const salvarEdicao = async () => {
    if (!cliente.trim()) {
      setClienteError(true);
      Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Preencha o nome do fornecedor antes de salvar.', customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3' }});
      return;
    }

    const isLarguraValida = (l: any) => {
      if (l === '' || l === undefined || l === null) return false;
      const lStr = String(l).trim();
      if (lStr === '') return false;
      if (/[\s-]+/.test(lStr)) {
        if (store.tipoRomaneio !== 'aberta') return false;
        const partes = lStr.split(/\s*-\s*|\s+/);
        return partes.length > 0 && partes.every(p => { const num = Number(p); return !isNaN(num) && num > 0; });
      }
      const num = Number(lStr); return !isNaN(num) && num > 0;
    };

    const hasItemValido = (p: typeof pacotes[0]) => {
      return p.itens.some(i =>
        i.espessura && i.largura && i.comprimento && i.quantidade &&
        Number(i.espessura) > 0 && isLarguraValida(i.largura) &&
        Number(i.comprimento) > 0 && Number(i.quantidade) > 0
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
        title: 'Atenção',
        text: `Preencha pelo menos uma linha de cubagem completa para todos os pacotes. (O Pacote Nº ${pacoteSemItens.numero} está vazio ou incompleto).`,
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md' }
      });
      return;
    }

    // Validar se existem números de pacotes duplicados
    const numerosPacotes = pacotes.map(p => p.numero);
    const temNumeroDuplicado = numerosPacotes.some((num, idx) => numerosPacotes.indexOf(num) !== idx);
    if (temNumeroDuplicado) {
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: 'Existem pacotes com numeração duplicada.',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md' }
      });
      return;
    }

    const pacotesValidos = pacotes.map(p => ({
        ...p,
        itens: p.itens.filter(i =>
          i.espessura && i.largura && i.comprimento && i.quantidade &&
          Number(i.espessura) > 0 && isLarguraValida(i.largura) &&
          Number(i.comprimento) > 0 && Number(i.quantidade) > 0
        )
      }));

    setSalvando(true);
    try {
      const result = await window.electronAPI.updateRomaneio({
        id: Number(id), cliente, data, total_m3: totalGeralM3, total_ml: totalGeralML, tipo_romaneio: store.tipoRomaneio,
        pacotes: pacotesValidos.map(p => {
          const itensDesmembrados = p.itens.flatMap(i => {
            const lStr = String(i.largura).trim();
            if (/[\s-]+/.test(lStr)) {
              const larguras = lStr.split(/\s*-\s*|\s+/).map(Number);
              return larguras.map(l => ({
                  espessura: Number(i.espessura), largura: l, comprimento: Number(i.comprimento), quantidade: 1,
                  volume_m3: (Number(i.espessura) / 100) * (l / 100) * Number(i.comprimento) * 1, volume_ml: Number(i.comprimento) * 1
              }));
            } else {
              return [{
                espessura: Number(i.espessura), largura: Number(i.largura), comprimento: Number(i.comprimento), quantidade: Number(i.quantidade),
                volume_m3: calcularM3(i.espessura, i.largura, i.comprimento, i.quantidade), volume_ml: calcularML(i.comprimento, i.quantidade)
              }];
            }
          });

          return {
            numero_pacote: p.numero, especie: p.especie,
            total_m3: itensDesmembrados.reduce((acc, i) => acc + i.volume_m3, 0),
            total_ml: itensDesmembrados.reduce((acc, i) => acc + i.volume_ml, 0),
            itens: itensDesmembrados
          };
        })
      });

      if (result.success) {
        Swal.fire({ icon: 'success', title: 'Atualizado!', text: 'Salvo com sucesso!', customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3' }}).then(() => { resetForm(); navigate('/'); });
      } else {
        Swal.fire({ icon: 'error', title: 'Erro', text: result.error, customClass: { popup: 'rounded-3xl' }});
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha de comunicação.', customClass: { popup: 'rounded-3xl' }});
    }
    setSalvando(false);
  };

  if (carregando) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
      <Loader2 size={40} className="animate-spin text-amber-500" />
      <p className="font-semibold text-sm">Carregando dados...</p>
    </div>
  );

  return (
    <>
      <div className="w-full mx-auto space-y-8 pb-32 page-transition">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 sm:p-10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-3 h-full bg-gradient-to-b from-amber-400 to-orange-500"></div>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-3">
            <div className="bg-amber-100 dark:bg-amber-950/30 p-2.5 rounded-xl text-amber-600 dark:text-amber-500">
              <PackageSearch size={28} strokeWidth={2.5} />
            </div>
            Editar Romaneio <span className="text-amber-500">#{id?.padStart(4, '0')}</span>
            <span className="text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full border border-amber-100 dark:border-amber-900/30 shadow-sm ml-2">
              {store.tipoRomaneio === 'padrao' ? 'Romaneio Padrão' : store.tipoRomaneio === 'pes' ? 'Ipê (Pés)' : 'Bica Corrida'}
            </span>
          </h2>
          <button onClick={() => { resetForm(); navigate('/'); }} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100/50 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-4 py-2.5 rounded-xl font-bold transition-all">
            <ArrowLeft size={16} strokeWidth={2.5} /> Voltar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-1">
              Fornecedor / Cliente <span className="text-red-400">*</span>
            </label>
            <input type="text" className={`glass-input w-full px-5 py-4 text-slate-800 dark:text-slate-100 font-bold focus:ring-amber-400/20 focus:border-amber-400 ${
              clienteError ? 'border-red-400 ring-4 ring-red-400/10 bg-red-50/30 dark:bg-red-950/20' : ''
            }`} placeholder="Nome do fornecedor/cliente" value={cliente} onChange={e => { setCliente(e.target.value); if (e.target.value.trim()) setClienteError(false); }} />
            {clienteError && (
              <p className="text-xs text-red-500 dark:text-red-450 font-bold mt-1.5 ml-1 flex items-center gap-1">
                <span>⚠</span> Campo obrigatório
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-1">Data do Romaneio</label>
            <input type="date" className="glass-input w-full px-5 py-4 text-slate-800 dark:text-slate-100 font-bold focus:ring-amber-400/20 focus:border-amber-400" value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>
      </motion.div>

      <div className="space-y-6">
        {pacotes.map((pacote, index) => (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} key={pacote.id} className="glass-card p-6 border border-slate-200/50 dark:border-slate-800/50">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Pacote Nº</span>
                <input type="number" min="1" className="w-20 glass-input px-3 py-2 text-center font-black text-slate-800 dark:text-slate-105 text-lg focus:ring-amber-400/20 focus:border-amber-400" value={pacote.numero} onChange={e => setNumeroPacote(pacote.id, Number(e.target.value) || 1)} />
              </div>
              <div className="flex-1 max-w-md w-full">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest shrink-0">
                    Espécie: <span className="text-red-400">*</span>
                  </label>
                  <input type="text" list={`especies-list-${pacote.id}`} placeholder="Selecione ou digite" className={`w-full glass-input px-4 py-2.5 font-bold text-slate-800 dark:text-slate-105 text-sm focus:ring-amber-400/20 focus:border-amber-400 ${
                    !pacote.especie.trim() ? 'border-amber-300/60 dark:border-amber-900/40' : 'border-emerald-300/60 dark:border-emerald-900/40'
                  }`} value={pacote.especie} onChange={e => setEspeciePacote(pacote.id, e.target.value)} />
                  <datalist id={`especies-list-${pacote.id}`}>
                    {especiesList.map(esp => ( <option key={esp.id} value={esp.nome} className="dark:bg-slate-900 dark:text-slate-200">{esp.cientifico ? `${esp.nome} (${esp.cientifico})` : esp.nome}</option> ))}
                  </datalist>
                </div>
              </div>
              {pacotes.length > 1 && (
                <button onClick={() => removePacote(pacote.id)} className="text-sm text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 border border-red-100 dark:border-red-900/30">
                  <Trash2 size={16} strokeWidth={2.5} /> Remover Pacote
                </button>
              )}
            </div>
            <GridCubagem pacoteId={pacote.id} pacoteIndex={index} />
          </motion.div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2 pt-2">
        {addPacoteError && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-amber-700 dark:text-amber-500 text-xs font-bold px-5 py-2.5 rounded-2xl">
            <span>⚠</span> {addPacoteError}
          </div>
        )}
        <button onClick={handleAddPacote} className="glass-card border border-amber-200 dark:border-amber-900/30 hover:border-amber-300 dark:hover:border-amber-800 text-slate-800 dark:text-slate-200 px-8 py-4 rounded-2xl font-black transition-all flex items-center gap-3 shadow-sm hover:shadow-md text-sm">
          <div className="bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-450 p-1.5 rounded-lg"><Plus size={20} strokeWidth={3} /></div>
          Adicionar Novo Pacote
        </button>
      </div>

      {totalGeralM3 > 0 && (
        <div className="glass-panel overflow-hidden transition-all duration-300 mt-8 border-slate-200 dark:border-slate-800">
          <button onClick={() => setMostrarResumo(!mostrarResumo)} className="w-full flex items-center justify-between p-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors text-left outline-none">
            <div className="flex items-center gap-4">
              <div className="bg-slate-800 dark:bg-slate-950 text-white p-2.5 rounded-xl shadow-md"><BarChart3 size={20} strokeWidth={2.5} /></div>
              <div>
                <h3 className="font-black text-slate-800 dark:text-slate-100 text-base">Resumo Consolidado</h3>
                <p className="text-xs text-slate-500 dark:text-slate-455 font-semibold mt-0.5">Balanço por espécie e bitola acumulado</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-full font-black tracking-widest border border-slate-200 dark:border-slate-800 uppercase">{resumos.porEspecie.length} Espécies</span>
              {mostrarResumo ? <ChevronUp className="text-slate-400" size={20} strokeWidth={2.5} /> : <ChevronDown className="text-slate-400" size={20} strokeWidth={2.5} />}
            </div>
          </button>
          <AnimatePresence>
            {mostrarResumo && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className={`border-t border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm p-8 grid grid-cols-1 ${(store.tipoRomaneio === 'padrao' || store.tipoRomaneio === 'pes') ? 'xl:grid-cols-2' : ''} gap-8`}>
                {/* Tabelas de Resumo Simplificadas para manter o código menor, usando as classes premium já definidas */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Consolidado por Espécie</h4>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-black tracking-widest border-b border-slate-200 dark:border-slate-800 text-[9px]">
                          <tr><th className="px-5 py-3.5">Espécie</th><th className="px-5 py-3.5 text-center">Total ML</th><th className="px-5 py-3.5 text-center">Total M³</th><th className="px-5 py-3.5 text-center w-24">% Vol</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                          {resumos.porEspecie.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">{item.especie}</td><td className="px-5 py-3 text-center">{item.totalMl.toFixed(2)}</td><td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450">{item.totalM3.toFixed(3)}</td><td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">{item.percentual.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                    <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Consolidado por Categoria de Comprimento</h4>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-black tracking-widest border-b border-slate-200 dark:border-slate-800 text-[9px]">
                          <tr>
                            <th className="px-5 py-3.5">Categoria</th>
                            <th className="px-5 py-3.5 text-center">Volume M³</th>
                            <th className="px-5 py-3.5 text-center w-24">% Vol</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                          {store.tipoRomaneio === 'pes' ? (
                            <>
                              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">{"6 PÉS E ABAIXO"}</td>
                                <td className="px-5 py-3 text-center font-black text-red-600 dark:text-red-450 bg-red-50/20 dark:bg-red-950/10">{resumos.totalAbaixo6M3.toFixed(3).replace('.', ',')}</td>
                                <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">{(resumos.totalVolumeGeral > 0 ? (resumos.totalAbaixo6M3 / resumos.totalVolumeGeral) * 100 : 0).toFixed(1)}%</td>
                              </tr>
                              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">{"7 PÉS"}</td>
                                <td className="px-5 py-3 text-center font-black text-amber-600 dark:text-amber-450 bg-amber-50/20 dark:bg-amber-950/10">{resumos.total7M3.toFixed(3).replace('.', ',')}</td>
                                <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">{(resumos.totalVolumeGeral > 0 ? (resumos.total7M3 / resumos.totalVolumeGeral) * 100 : 0).toFixed(1)}%</td>
                              </tr>
                              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">{"8 PÉS E ACIMA"}</td>
                                <td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450 bg-emerald-50/20 dark:bg-emerald-950/10">{resumos.totalAcima8M3.toFixed(3).replace('.', ',')}</td>
                                <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">{(resumos.totalVolumeGeral > 0 ? (resumos.totalAcima8M3 / resumos.totalVolumeGeral) * 100 : 0).toFixed(1)}%</td>
                              </tr>
                            </>
                          ) : (
                            <>
                              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">{"MADEIRA LONGA (>= 2,00 m)"}</td>
                                <td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450 bg-emerald-50/20 dark:bg-emerald-950/10">{resumos.totalMadeiraLongaM3.toFixed(3).replace('.', ',')}</td>
                                <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">{(resumos.totalVolumeGeral > 0 ? (resumos.totalMadeiraLongaM3 / resumos.totalVolumeGeral) * 100 : 0).toFixed(1)}%</td>
                              </tr>
                              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">{"SHORT (<= 1,90 m)"}</td>
                                <td className="px-5 py-3 text-center font-black text-red-600 dark:text-red-450 bg-red-50/20 dark:bg-red-950/10">{resumos.totalShortM3.toFixed(3).replace('.', ',')}</td>
                                <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">{(resumos.totalVolumeGeral > 0 ? (resumos.totalShortM3 / resumos.totalVolumeGeral) * 100 : 0).toFixed(1)}%</td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                {(store.tipoRomaneio === 'padrao' || store.tipoRomaneio === 'pes') && (
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Consolidado por Bitola</h4>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-black tracking-widest border-b border-slate-200 dark:border-slate-800 text-[9px]">
                          <tr><th className="px-5 py-3.5">Espécie</th><th className="px-5 py-3.5 text-center">Bitola (cm)</th><th className="px-5 py-3.5 text-center">Total ML</th><th className="px-5 py-3.5 text-center">Total M³</th><th className="px-5 py-3.5 text-center w-20">% Vol</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                          {resumos.porBitola.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-5 py-3 text-slate-800 dark:text-slate-100">{item.especie}</td><td className="px-5 py-3 text-center font-black text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-950/20">{item.espessura} <span className="text-[10px] text-slate-400 font-bold mx-0.5">X</span> {item.largura}</td><td className="px-5 py-3 text-center">{item.totalMl.toFixed(2)}</td><td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450">{item.totalM3.toFixed(3)}</td><td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">{item.percentual.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Floating Footer Island (Sticky, alinhamento perfeito) */}
      <div className="w-full mx-auto sticky bottom-6 z-40 pointer-events-none">
        <div className="w-full bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 p-5 rounded-[2rem] flex items-center justify-between shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] pointer-events-auto text-white">
          <div className="text-slate-400 text-xs font-semibold hidden md:block">
            Editando <strong className="text-amber-400 font-bold">#{id?.padStart(4, '0')}</strong> — Use <kbd className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300">TAB</kbd> para navegar.
          </div>
          <div className="flex gap-8 items-center ml-auto md:ml-0">
            <div className="text-right">
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Total ML</span>
              <span className="text-2xl font-black text-slate-100">{totalGeralML.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Total M³</span>
              <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">{totalGeralM3.toFixed(3)}</span>
            </div>
            <button 
              onClick={salvarEdicao} disabled={salvando}
              className={`px-6 py-3.5 rounded-2xl font-black transition-all ml-4 flex items-center gap-2 cursor-pointer ${
                salvando
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50' 
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] hover:-translate-y-1'
              }`}
            >
              <Save size={18} strokeWidth={2.5} />
              {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
