import { useRomaneioStore } from '../store/useRomaneioStore';
import { Trash2, Plus, AlertCircle, Copy } from 'lucide-react';
import Swal from 'sweetalert2';
import { useEffect, useRef, useState } from 'react';

// Refs para foco automático na nova linha (por id de item)
const newRowFocusRef: { [key: string]: HTMLInputElement | null } = {};

interface InputLarguraProps {
  item: any;
  tipoRomaneio: string;
  onChangeGlobal: (itemId: string, field: string, val: string) => void;
  onBlurGlobal: (itemId: string, field: string, val: string | number) => void;
  onKeyDown: (e: React.KeyboardEvent, item: any) => void;
  inputRef: (el: HTMLInputElement | null) => void;
}

const InputLargura = ({
  item,
  tipoRomaneio,
  onChangeGlobal,
  onBlurGlobal,
  onKeyDown,
  inputRef,
}: InputLarguraProps) => {
  const displayVal = (val: string | number) => {
    if (val === '') return '';
    return String(val).replace('.', ',');
  };

  const [localValue, setLocalValue] = useState(displayVal(item.largura));

  useEffect(() => {
    const formatted = displayVal(item.largura);
    if (formatted !== localValue) {
      setLocalValue(formatted);
    }
  }, [item.largura]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    let sanitized = val;
    
    if (tipoRomaneio === 'aberta') {
      sanitized = val.replace(/[^0-9.,\s-]/g, '').replace(',', '.');
      const oldValStr = displayVal(item.largura);
      
      if (sanitized.length > oldValStr.length) {
        if (/(\d)\s$/.test(sanitized)) {
          sanitized = sanitized.replace(/(\d)\s$/, '$1 - ');
        }
      }
    } else {
      sanitized = val.replace(/[^0-9.,]/g, '').replace(',', '.');
    }
    
    setLocalValue(sanitized.replace('.', ','));
    onChangeGlobal(item.id, 'largura', sanitized);
  };

  const handleBlur = () => {
    const cleanVal = localValue.replace(',', '.');
    onBlurGlobal(item.id, 'largura', cleanVal);
  };

  return (
    <input
      type="text"
      ref={inputRef}
      className="w-full p-2.5 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-emerald-300 dark:hover:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-bold text-slate-800 dark:text-slate-100 shadow-sm"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={e => onKeyDown(e, item)}
      placeholder="Ex: 11"
    />
  );
};

export default function GridCubagem({ pacoteId }: { pacoteId: string; pacoteIndex?: number }) {
  const { pacotes, addItem, removeItem, updateItem, duplicateItem, tipoRomaneio } = useRomaneioStore();
  const pacote = pacotes.find(p => p.id === pacoteId);
  const prevItemCountRef = useRef(0);

  if (!pacote) return null;

  useEffect(() => {
    const currentCount = pacote.itens.length;
    if (currentCount > prevItemCountRef.current && currentCount > 1) {
      const lastItem = pacote.itens[currentCount - 1];
      const ref = newRowFocusRef[lastItem.id];
      if (ref) setTimeout(() => ref.focus(), 50);
    }
    prevItemCountRef.current = currentCount;
  }, [pacote.itens.length]);

  const ultimaLinhaCompleta = () => {
    if (pacote.itens.length === 0) return true;
    const last = pacote.itens[pacote.itens.length - 1];
    return !!(last.espessura && last.largura && last.comprimento && last.quantidade);
  };

  const handleChange = (itemId: string, field: string, value: string) => {
    let sanitized = value;
    if (field === 'largura') {
      if (tipoRomaneio === 'aberta') {
        sanitized = value.replace(/[^0-9.,\s-]/g, '').replace(',', '.');
        
        const item = pacote?.itens.find(i => i.id === itemId);
        const oldValStr = item ? String(item.largura ?? '') : '';
        
        if (sanitized.length > oldValStr.length) {
          // Usuário está digitando (adicionando caracteres)
          if (/(\d)\s$/.test(sanitized)) {
            sanitized = sanitized.replace(/(\d)\s$/, '$1 - ');
          }
        }
      } else {
        sanitized = value.replace(/[^0-9.,]/g, '').replace(',', '.');
      }
    } else {
      sanitized = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    }
    updateItem(pacoteId, itemId, field as any, sanitized === '' ? '' : sanitized);

    if (field === 'largura' && tipoRomaneio === 'aberta') {
      const partes = sanitized.split(/\s*-\s*|\s+/).map(p => p.trim()).filter(p => p !== '' && !isNaN(Number(p)));
      const qtd = partes.length;
      updateItem(pacoteId, itemId, 'quantidade', qtd > 0 ? qtd : '');
    }
  };

  const handleBlur = (itemId: string, field: string, value: string | number) => {
    if (value === '') return;
    let valStr = String(value).trim();
    
    if (field === 'largura' && tipoRomaneio === 'aberta') {
      const partes = valStr.split(/\s*-\s*|\s+/).map(p => {
        let val = p.trim();
        if (!val.includes('.')) {
          const num = Number(val);
          if (!isNaN(num) && num > 99) {
            val = (num / 10).toString();
          }
        }
        return Number(val);
      }).filter(x => !isNaN(x) && x > 0);

      const cleaned = partes.join(' - ');
      updateItem(pacoteId, itemId, 'largura', cleaned);
      updateItem(pacoteId, itemId, 'quantidade', partes.length > 0 ? partes.length : '');
      return;
    }

    if (!valStr.includes('.')) {
      const num = Number(valStr);
      if (field === 'espessura' && num >= 10) {
        valStr = (num / 10).toString();
      } else if (field === 'largura' && num > 99) {
        valStr = (num / 10).toString();
      } else if (field === 'comprimento' && num >= 100 && tipoRomaneio !== 'pes') {
        valStr = (num / 100).toString();
      }
    }
    
    const finalVal = Number(valStr);
    updateItem(pacoteId, itemId, field as any, isNaN(finalVal) ? valStr : finalVal);
  };

  const handleAddItem = () => {
    if (!ultimaLinhaCompleta()) {
      Swal.fire({
        icon: 'warning', title: 'Linha incompleta', text: 'Preencha todos os campos da linha atual antes de adicionar uma nova.',
        confirmButtonColor: '#059669', customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3' }
      });
      return;
    }
    addItem(pacoteId);
  };

  const handleRemoveItem = (itemId: string) => {
    if (pacote.itens.length <= 1) {
      Swal.fire({
        icon: 'info', title: 'Atenção', text: 'O pacote deve ter pelo menos uma linha de cubagem.',
        confirmButtonColor: '#059669', customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3' }
      });
      return;
    }
    removeItem(pacoteId, itemId);
  };

  const handleKeyDown = (e: React.KeyboardEvent, item: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (document.activeElement as HTMLInputElement)?.blur();
      if (!item.espessura || !item.largura || !item.comprimento || !item.quantidade) {
        Swal.fire({
          icon: 'warning', title: 'Linha incompleta', text: 'Preencha todos os campos da linha atual antes de adicionar uma nova.',
          confirmButtonColor: '#059669', customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3' }
        });
      } else {
        addItem(pacoteId);
      }
    } else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      duplicateItem(pacoteId, item.id);
    }
  };

  const calcularM3 = (espessura: any, largura: any, comprimento: any, qtd: any) => {
    const e = Number(espessura), c = Number(comprimento);
    if (!e || !c) return 0;
    const cMetros = tipoRomaneio === 'pes' ? c * 0.3048 : c;
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
    const cMetros = tipoRomaneio === 'pes' ? c * 0.3048 : c;
    return cMetros * q;
  };

  const totalPacoteM3 = pacote.itens.reduce((acc, item) => acc + calcularM3(item.espessura, item.largura, item.comprimento, item.quantidade), 0);
  const totalPacoteML = pacote.itens.reduce((acc, item) => acc + calcularML(item.comprimento, item.quantidade), 0);
  const totalPacotePecas = pacote.itens.reduce((acc, item) => acc + (Number(item.quantidade) || 0), 0);

  const displayValue = (val: string | number, field: string) => {
    if (val === '') return '';
    let numStr = String(val);
    if (field === 'comprimento' && !isNaN(Number(val)) && typeof val === 'number') {
      if (tipoRomaneio === 'pes') {
        numStr = Number(val).toString();
      } else {
        numStr = Number(val).toFixed(2);
      }
    }
    return numStr.replace('.', ',');
  };

  const podeBloqueio = !ultimaLinhaCompleta() && pacote.itens.length > 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-200 dark:border-slate-800 overflow-hidden mt-6">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black tracking-widest border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3.5 text-center">Item</th>
              <th className="px-4 py-3.5 text-center">Espessura (cm)</th>
              <th className="px-4 py-3.5 text-center">{tipoRomaneio === 'pes' ? 'Comprimento (pés)' : 'Comprimento (m)'}</th>
              <th className="px-4 py-3.5 text-center">Largura (cm)</th>
              <th className="px-4 py-3.5 text-center">Qtd</th>
              <th className="px-4 py-3.5 text-center">Total ML</th>
              <th className="px-4 py-3.5 text-center">Total M³</th>
              <th className="px-4 py-3.5 text-center w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {pacote.itens.map((item, index) => {
              const m3 = calcularM3(item.espessura, item.largura, item.comprimento, item.quantidade);
              const ml = calcularML(item.comprimento, item.quantidade);
              const isUltima = index === pacote.itens.length - 1;
              const linhaIncompleta = isUltima && pacote.itens.length > 1 && !ultimaLinhaCompleta();

              return (
                <tr key={item.id} className={`transition-colors group ${linhaIncompleta ? 'bg-amber-50/50 dark:bg-amber-950/20' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'}`}>
                  <td className="px-4 py-2 text-center text-slate-400 dark:text-slate-500 font-bold text-xs">{index + 1}</td>

                  <td className="p-1.5">
                    <input
                      type="text"
                      className="w-full p-2.5 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-emerald-300 dark:hover:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-bold text-slate-800 dark:text-slate-100 shadow-sm"
                      value={displayValue(item.espessura, 'espessura')}
                      onChange={e => handleChange(item.id, 'espessura', e.target.value)}
                      onBlur={() => handleBlur(item.id, 'espessura', item.espessura)}
                      onKeyDown={e => handleKeyDown(e, item)}
                      placeholder="Ex: 5"
                    />
                  </td>

                  <td className="p-1.5">
                    <input
                      type="text"
                      ref={el => { newRowFocusRef[item.id] = el; }}
                      className="w-full p-2.5 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-emerald-300 dark:hover:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-bold text-slate-800 dark:text-slate-100 shadow-sm"
                      value={displayValue(item.comprimento, 'comprimento')}
                      onChange={e => handleChange(item.id, 'comprimento', e.target.value)}
                      onBlur={() => handleBlur(item.id, 'comprimento', item.comprimento)}
                      onKeyDown={e => handleKeyDown(e, item)}
                      placeholder={tipoRomaneio === 'pes' ? "Ex: 10" : "Ex: 4,50"}
                    />
                  </td>

                  <td className="p-1.5">
                    <InputLargura
                      item={item}
                      tipoRomaneio={tipoRomaneio}
                      onChangeGlobal={handleChange}
                      onBlurGlobal={handleBlur}
                      onKeyDown={handleKeyDown}
                      inputRef={() => {}}
                    />
                  </td>

                  <td className="p-1.5">
                    <input
                      type="text"
                      disabled={tipoRomaneio === 'aberta'}
                      className={`w-full p-2.5 text-center border rounded-xl outline-none transition-all font-bold shadow-sm ${
                        tipoRomaneio === 'aberta'
                          ? 'bg-slate-100/80 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 border-slate-200/60 dark:border-slate-800/60 cursor-not-allowed'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-slate-800 dark:text-slate-100'
                      }`}
                      value={item.quantidade}
                      onChange={e => handleChange(item.id, 'quantidade', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, item)}
                      placeholder={tipoRomaneio === 'aberta' ? "Auto" : "Qtd"}
                    />
                  </td>

                  <td className="px-4 py-2 text-center text-slate-500 dark:text-slate-400 font-semibold">{ml > 0 ? ml.toFixed(2) : '-'}</td>
                  <td className="px-4 py-2 text-center font-black text-emerald-600 dark:text-emerald-450">{m3 > 0 ? m3.toFixed(3) : '-'}</td>

                  <td className="px-4 py-2 text-center w-20">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => duplicateItem(pacoteId, item.id)}
                        tabIndex={-1}
                        className="text-slate-400 hover:text-emerald-500 dark:text-slate-500 dark:hover:text-emerald-400 bg-slate-50 dark:bg-slate-950 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-all p-2 rounded-lg cursor-pointer shadow-sm dark:border dark:border-slate-800"
                        title="Duplicar linha (Ctrl+D)"
                      >
                        <Copy size={14} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        tabIndex={-1}
                        className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 bg-slate-50 dark:bg-slate-950 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all p-2 rounded-lg cursor-pointer shadow-sm dark:border dark:border-slate-800"
                        title="Remover linha"
                      >
                        <Trash2 size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
            <tr>
              <td colSpan={4} className="px-5 py-4 font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest text-right text-xs">
                Totais do Pacote {pacote.numero}:
              </td>
              <td className="px-5 py-4 text-center font-black text-slate-800 dark:text-slate-200">{totalPacotePecas} Peças</td>
              <td className="px-5 py-4 text-center font-black text-slate-800 dark:text-slate-200">{totalPacoteML.toFixed(2)} ML</td>
              <td className="px-5 py-4 text-center font-black text-emerald-600 dark:text-emerald-450">{totalPacoteM3.toFixed(3)} M³</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-4">
        {podeBloqueio && (
          <span className="flex items-center gap-1.5 text-xs text-amber-600 font-bold uppercase tracking-widest">
            <AlertCircle size={14} strokeWidth={2.5} /> Preencha a linha atual
          </span>
        )}
        <button
          onClick={handleAddItem}
          disabled={podeBloqueio}
          className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest px-6 py-3 rounded-xl transition-all shadow-sm ${
            podeBloqueio
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
              : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:text-emerald-700 dark:hover:text-emerald-350 hover:shadow-md cursor-pointer'
          }`}
        >
          <Plus size={16} strokeWidth={3} /> Nova Linha
        </button>
      </div>
    </div>
  );
}
