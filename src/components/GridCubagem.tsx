import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRomaneioStore, type RomaneioItem } from '../store/useRomaneioStore';
import { Trash2, Plus, AlertCircle, Copy, ClipboardPaste, SlidersHorizontal } from 'lucide-react';
import Swal from 'sweetalert2';
import { calcularVolumeM3, calcularMetrosLineares, validarToleranciaMedida } from '../utils/cubagemEngine';

// Refs para foco automático na nova linha (por id de item)
const newRowFocusRef: { [key: string]: HTMLInputElement | null } = {};

const displayVal = (val: string | number | undefined | null) => {
  if (val === '' || val === undefined || val === null) return '';
  return String(val).replace('.', ',');
};

// -------------------------------------------------------------
// Componentes de Input Otimizados com Estado Local (0ms lag)
// -------------------------------------------------------------

interface InputEspessuraProps {
  item: RomaneioItem;
  onChangeGlobal: (itemId: string, field: keyof RomaneioItem, val: string) => void;
  onBlurGlobal: (itemId: string, field: keyof RomaneioItem, val: string | number) => void;
  onKeyDown: (e: React.KeyboardEvent, item: RomaneioItem) => void;
}

const InputEspessura = React.memo(({ item, onChangeGlobal, onBlurGlobal, onKeyDown }: InputEspessuraProps) => {
  const [localValue, setLocalValue] = useState(() => displayVal(item.espessura));
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalValue(displayVal(item.espessura));
    }
  }, [item.espessura]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const sanitized = val.replace(/[^0-9.,]/g, '').replace(',', '.');
    setLocalValue(val.replace('.', ','));
    onChangeGlobal(item.id, 'espessura', sanitized);
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    let cleanVal = localValue.trim().replace(',', '.');
    if (cleanVal !== '' && !cleanVal.includes('.')) {
      const num = Number(cleanVal);
      if (!isNaN(num) && num >= 10) {
        cleanVal = (num / 10).toString();
        setLocalValue(cleanVal.replace('.', ','));
      }
    }
    const finalNum = Number(cleanVal);
    onBlurGlobal(item.id, 'espessura', isNaN(finalNum) || cleanVal === '' ? cleanVal : finalNum);
  };

  return (
    <input
      type="text"
      data-field="espessura"
      className="w-full p-2.5 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-emerald-300 dark:hover:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-bold text-slate-800 dark:text-slate-100 shadow-sm text-sm"
      value={localValue}
      onFocus={() => { isFocusedRef.current = true; }}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={e => onKeyDown(e, item)}
      placeholder="Ex: 5"
    />
  );
});

InputEspessura.displayName = 'InputEspessura';

interface InputLarguraProps {
  item: RomaneioItem;
  tipoRomaneio: string;
  onChangeLargura: (itemId: string, val: string) => void;
  onBlurLargura: (itemId: string, val: string) => void;
  onKeyDown: (e: React.KeyboardEvent, item: RomaneioItem) => void;
}

const InputLargura = React.memo(
  React.forwardRef<HTMLInputElement, InputLarguraProps>(
    ({ item, tipoRomaneio, onChangeLargura, onBlurLargura, onKeyDown }, ref) => {
      const [localValue, setLocalValue] = useState(() => displayVal(item.largura));
      const isFocusedRef = useRef(false);

      useEffect(() => {
        if (!isFocusedRef.current) {
          setLocalValue(displayVal(item.largura));
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

        setLocalValue(sanitized.replace(/\./g, ','));
        onChangeLargura(item.id, sanitized);
      };

      const handleBlur = () => {
        isFocusedRef.current = false;
        onBlurLargura(item.id, localValue);
      };

      return (
        <input
          ref={ref}
          type="text"
          data-field="largura"
          className="w-full p-2.5 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-emerald-300 dark:hover:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-bold text-slate-800 dark:text-slate-100 shadow-sm text-sm"
          value={localValue}
          onFocus={() => { isFocusedRef.current = true; }}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={e => onKeyDown(e, item)}
          placeholder={tipoRomaneio === 'aberta' ? 'Ex: 12 - 15 - 18' : 'Ex: 11'}
        />
      );
    }
  )
);

InputLargura.displayName = 'InputLargura';

interface InputComprimentoProps {
  item: RomaneioItem;
  tipoRomaneio: string;
  onChangeGlobal: (itemId: string, field: keyof RomaneioItem, val: string) => void;
  onBlurGlobal: (itemId: string, field: keyof RomaneioItem, val: string | number) => void;
  onKeyDown: (e: React.KeyboardEvent, item: RomaneioItem) => void;
}

const InputComprimento = React.memo(
  React.forwardRef<HTMLInputElement, InputComprimentoProps>(
    ({ item, tipoRomaneio, onChangeGlobal, onBlurGlobal, onKeyDown }, ref) => {
      const formatComprimento = (val: string | number | undefined | null) => {
        if (val === '' || val === undefined || val === null) return '';
        if (tipoRomaneio === 'pes') return String(val).replace('.', ',');
        const num = Number(String(val).replace(',', '.'));
        if (isNaN(num)) return String(val).replace('.', ',');
        return num.toFixed(2).replace('.', ',');
      };

      const [isFocused, setIsFocused] = useState(false);
      const [localValue, setLocalValue] = useState(() => formatComprimento(item.comprimento));

      useEffect(() => {
        if (!isFocused) {
          setLocalValue(formatComprimento(item.comprimento));
        }
      }, [item.comprimento, tipoRomaneio, isFocused]);

      const handleFocus = () => {
        setIsFocused(true);
      };

      const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const sanitized = val.replace(/[^0-9.,]/g, '').replace(',', '.');
        setLocalValue(val.replace('.', ','));
        onChangeGlobal(item.id, 'comprimento', sanitized);
      };

      const handleBlur = () => {
        setIsFocused(false);
        let cleanVal = localValue.trim().replace(',', '.');

        if (cleanVal !== '' && !cleanVal.includes('.')) {
          const num = Number(cleanVal);
          if (tipoRomaneio !== 'pes' && !isNaN(num) && num >= 100) {
            cleanVal = (num / 100).toString();
          }
        }

        const finalNum = Number(cleanVal);
        onBlurGlobal(item.id, 'comprimento', isNaN(finalNum) || cleanVal === '' ? cleanVal : finalNum);
      };

      return (
        <input
          ref={ref}
          type="text"
          data-field="comprimento"
          className="w-full p-2.5 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-emerald-300 dark:hover:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all font-bold text-slate-800 dark:text-slate-100 shadow-sm text-sm"
          value={isFocused ? localValue : formatComprimento(item.comprimento)}
          onFocus={handleFocus}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={e => onKeyDown(e, item)}
          placeholder={tipoRomaneio === 'pes' ? 'Ex: 10' : 'Ex: 4,50'}
        />
      );
    }
  )
);

InputComprimento.displayName = 'InputComprimento';

interface InputQuantidadeProps {
  item: RomaneioItem;
  tipoRomaneio: string;
  onChangeGlobal: (itemId: string, field: keyof RomaneioItem, val: string) => void;
  onBlurGlobal: (itemId: string, field: keyof RomaneioItem, val: string | number) => void;
  onKeyDown: (e: React.KeyboardEvent, item: RomaneioItem) => void;
}

const InputQuantidade = React.memo(({ item, tipoRomaneio, onChangeGlobal, onBlurGlobal, onKeyDown }: InputQuantidadeProps) => {
  const isAberta = tipoRomaneio === 'aberta';
  const [localValue, setLocalValue] = useState(() => (item.quantidade !== '' ? String(item.quantidade) : ''));
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalValue(item.quantidade !== '' ? String(item.quantidade) : '');
    }
  }, [item.quantidade]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isAberta) return;
    const val = e.target.value.replace(/[^0-9]/g, '');
    setLocalValue(val);
    onChangeGlobal(item.id, 'quantidade', val);
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    if (isAberta) return;
    const cleanVal = localValue.trim();
    const finalNum = Number(cleanVal);
    onBlurGlobal(item.id, 'quantidade', isNaN(finalNum) || cleanVal === '' ? cleanVal : finalNum);
  };

  return (
    <input
      type="text"
      data-field="quantidade"
      disabled={isAberta}
      className={`w-full p-2.5 text-center border rounded-xl outline-none transition-all font-bold shadow-sm text-sm ${
        isAberta
          ? 'bg-slate-100/80 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 border-slate-200/60 dark:border-slate-800/60 cursor-not-allowed'
          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-slate-800 dark:text-slate-100'
      }`}
      value={isAberta ? item.quantidade : localValue}
      onFocus={() => { isFocusedRef.current = true; }}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={e => onKeyDown(e, item)}
      placeholder={isAberta ? 'Auto' : 'Qtd'}
    />
  );
});

InputQuantidade.displayName = 'InputQuantidade';

// -------------------------------------------------------------
// Componente de Linha da Tabela (Memoizado com Custom Comparator)
// -------------------------------------------------------------

interface LinhaGridRowProps {
  item: RomaneioItem;
  index: number;
  tipoRomaneio: string;
  isUltima: boolean;
  linhaIncompleta: boolean;
  pacoteId: string;
  onChangeField: (itemId: string, field: keyof RomaneioItem, value: string) => void;
  onChangeLargura: (itemId: string, value: string) => void;
  onBlurField: (itemId: string, field: keyof RomaneioItem, value: string | number) => void;
  onBlurLargura: (itemId: string, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent, item: RomaneioItem) => void;
  onDuplicate: (pacoteId: string, itemId: string) => void;
  onRemove: (itemId: string) => void;
}

const LinhaGridRowComponent = ({
  item,
  index,
  tipoRomaneio,
  linhaIncompleta,
  pacoteId,
  onChangeField,
  onChangeLargura,
  onBlurField,
  onBlurLargura,
  onKeyDown,
  onDuplicate,
  onRemove
}: LinhaGridRowProps) => {
  const m3 = calcularVolumeM3(item.espessura, item.largura, item.comprimento, item.quantidade, tipoRomaneio);
  const ml = calcularMetrosLineares(item.comprimento, item.quantidade, tipoRomaneio);
  const tolerancia = validarToleranciaMedida(item.espessura, item.largura, item.comprimento, tipoRomaneio);

  return (
    <tr
      className={`transition-colors group ${
        linhaIncompleta
          ? 'bg-amber-50/50 dark:bg-amber-950/20'
          : tolerancia.invalido
          ? 'bg-amber-50/30 dark:bg-amber-950/15'
          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
      }`}
    >
      <td className="px-4 py-2 text-center text-slate-400 dark:text-slate-500 font-bold text-xs">
        {index + 1}
      </td>

      <td className="p-1.5">
        <InputEspessura
          item={item}
          onChangeGlobal={onChangeField}
          onBlurGlobal={onBlurField}
          onKeyDown={onKeyDown}
        />
      </td>

      <td className="p-1.5">
        <InputLargura
          ref={el => {
            newRowFocusRef[item.id] = el;
          }}
          item={item}
          tipoRomaneio={tipoRomaneio}
          onChangeLargura={onChangeLargura}
          onBlurLargura={onBlurLargura}
          onKeyDown={onKeyDown}
        />
      </td>

      <td className="p-1.5">
        <InputComprimento
          item={item}
          tipoRomaneio={tipoRomaneio}
          onChangeGlobal={onChangeField}
          onBlurGlobal={onBlurField}
          onKeyDown={onKeyDown}
        />
      </td>

      <td className="p-1.5">
        <InputQuantidade
          item={item}
          tipoRomaneio={tipoRomaneio}
          onChangeGlobal={onChangeField}
          onBlurGlobal={onBlurField}
          onKeyDown={onKeyDown}
        />
      </td>

      <td className="px-4 py-2 text-center text-slate-500 dark:text-slate-400 font-semibold text-sm">
        {ml > 0 ? ml.toFixed(2) : '-'}
      </td>
      <td className="px-4 py-2 text-center font-black text-emerald-600 dark:text-emerald-450 text-sm">
        {m3 > 0 ? m3.toFixed(3) : '-'}
      </td>

      <td className="px-4 py-2 text-center w-20">
        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
          <button
            type="button"
            onClick={() => onDuplicate(pacoteId, item.id)}
            tabIndex={-1}
            className="text-slate-400 hover:text-emerald-500 dark:text-slate-500 dark:hover:text-emerald-400 bg-slate-50 dark:bg-slate-950 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-all p-2 rounded-lg cursor-pointer shadow-sm dark:border dark:border-slate-800"
            title="Duplicar linha (Ctrl+D)"
          >
            <Copy size={14} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
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
};

const LinhaGridRow = React.memo(LinhaGridRowComponent, (prev, next) => {
  return (
    prev.item === next.item &&
    prev.index === next.index &&
    prev.isUltima === next.isUltima &&
    prev.linhaIncompleta === next.linhaIncompleta &&
    prev.tipoRomaneio === next.tipoRomaneio &&
    prev.pacoteId === next.pacoteId
  );
});

LinhaGridRow.displayName = 'LinhaGridRow';

// -------------------------------------------------------------
// Componente Principal GridCubagem
// -------------------------------------------------------------

export default function GridCubagem({ pacoteId }: { pacoteId: string; pacoteIndex?: number }) {
  const pacote = useRomaneioStore(useCallback(state => state.pacotes.find(p => p.id === pacoteId), [pacoteId]));
  const tipoRomaneio = useRomaneioStore(state => state.tipoRomaneio);
  const addItem = useRomaneioStore(state => state.addItem);
  const removeItem = useRomaneioStore(state => state.removeItem);
  const updateItem = useRomaneioStore(state => state.updateItem);
  const updateItemFields = useRomaneioStore(state => state.updateItemFields);
  const duplicateItem = useRomaneioStore(state => state.duplicateItem);
  const aplicarBitolaPacote = useRomaneioStore(state => state.aplicarBitolaPacote);
  const colarItensExcel = useRomaneioStore(state => state.colarItensExcel);

  const pacoteRef = useRef(pacote);
  pacoteRef.current = pacote;

  const tipoRomaneioRef = useRef(tipoRomaneio);
  tipoRomaneioRef.current = tipoRomaneio;

  const prevItemCountRef = useRef(0);

  useEffect(() => {
    if (!pacote) return;
    const currentCount = pacote.itens.length;
    if (currentCount > prevItemCountRef.current && currentCount > 1) {
      const lastItem = pacote.itens[currentCount - 1];
      const ref = newRowFocusRef[lastItem.id];
      if (ref) {
        requestAnimationFrame(() => ref.focus());
      }
    }
    prevItemCountRef.current = currentCount;
  }, [pacote?.itens.length]);

  const handlePasteExcel = useCallback((clipboardData: string) => {
    if (!clipboardData || !clipboardData.trim()) return;
    const inseridos = colarItensExcel(pacoteId, clipboardData);
    if (inseridos > 0) {
      Swal.fire({
        icon: 'success',
        title: 'Dados importados!',
        text: `Dados importados com sucesso para o Pacote Nº ${pacoteRef.current?.numero} (${inseridos} linhas).`,
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'bottom-end'
      });
    }
  }, [colarItensExcel, pacoteId]);

  const ultimaLinhaCompleta = useCallback(() => {
    const currentPacote = pacoteRef.current;
    if (!currentPacote || currentPacote.itens.length === 0) return true;
    const last = currentPacote.itens[currentPacote.itens.length - 1];
    return !!(last.espessura !== '' && last.largura !== '' && last.comprimento !== '' && last.quantidade !== '');
  }, []);

  const handleChangeField = useCallback((itemId: string, field: keyof RomaneioItem, value: string) => {
    updateItem(pacoteId, itemId, field, value === '' ? '' : value);
  }, [pacoteId, updateItem]);

  const handleChangeLargura = useCallback((itemId: string, value: string) => {
    const tipo = tipoRomaneioRef.current;
    if (tipo === 'aberta') {
      const partes = value.split(/\s*-\s*|\s+/).map(p => p.trim()).filter(p => p !== '' && !isNaN(Number(p)));
      const qtd = partes.length;
      updateItemFields(pacoteId, itemId, {
        largura: value === '' ? '' : value,
        quantidade: qtd > 0 ? qtd : ''
      });
    } else {
      updateItem(pacoteId, itemId, 'largura', value === '' ? '' : value);
    }
  }, [pacoteId, updateItem, updateItemFields]);

  const handleBlurField = useCallback((itemId: string, field: keyof RomaneioItem, value: string | number) => {
    if (value === '') {
      updateItem(pacoteId, itemId, field, '');
      return;
    }
    const finalVal = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
    updateItem(pacoteId, itemId, field, isNaN(finalVal) ? value : finalVal);
  }, [pacoteId, updateItem]);

  const handleBlurLargura = useCallback((itemId: string, value: string) => {
    if (!value || value.trim() === '') {
      updateItem(pacoteId, itemId, 'largura', '');
      return;
    }
    const tipo = tipoRomaneioRef.current;
    let valStr = String(value).trim();

    if (tipo === 'aberta') {
      const partes = valStr.split(/\s*-\s*|\s+/).map(p => {
        let val = p.trim().replace(',', '.');
        if (!val.includes('.')) {
          const num = Number(val);
          if (!isNaN(num) && num > 99) {
            val = (num / 10).toString();
          }
        }
        return Number(val);
      }).filter(x => !isNaN(x) && x > 0);

      const cleaned = partes.join(' - ');
      updateItemFields(pacoteId, itemId, {
        largura: cleaned,
        quantidade: partes.length > 0 ? partes.length : ''
      });
      return;
    }

    let cleanVal = valStr.replace(',', '.');
    if (!cleanVal.includes('.')) {
      const num = Number(cleanVal);
      if (!isNaN(num) && num > 99) {
        cleanVal = (num / 10).toString();
      }
    }
    const finalNum = Number(cleanVal);
    updateItem(pacoteId, itemId, 'largura', isNaN(finalNum) ? cleanVal : finalNum);
  }, [pacoteId, updateItem, updateItemFields]);

  const handleAddItem = useCallback(() => {
    if (!ultimaLinhaCompleta()) {
      Swal.fire({
        icon: 'warning',
        title: 'Linha incompleta',
        text: 'Preencha todos os campos da linha atual antes de adicionar uma nova.',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3' }
      });
      return;
    }
    addItem(pacoteId);
  }, [addItem, pacoteId, ultimaLinhaCompleta]);

  const handleRemoveItem = useCallback((itemId: string) => {
    const currentPacote = pacoteRef.current;
    if (!currentPacote || currentPacote.itens.length <= 1) {
      Swal.fire({
        icon: 'info',
        title: 'Atenção',
        text: 'O pacote deve ter pelo menos uma linha de cubagem.',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3' }
      });
      return;
    }
    removeItem(pacoteId, itemId);
  }, [pacoteId, removeItem]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, item: RomaneioItem) => {
    const target = e.currentTarget as HTMLInputElement;
    const field = target.getAttribute('data-field') as keyof RomaneioItem | null;
    const currentRow = target.closest('tr');
    const tbody = currentRow?.parentElement;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (!field || !currentRow || !tbody) return;

      if (field === 'espessura') {
        const nextInput = currentRow.querySelector<HTMLInputElement>('input[data-field="largura"]');
        nextInput?.focus();
        nextInput?.select();
      } else if (field === 'largura') {
        const nextInput = currentRow.querySelector<HTMLInputElement>('input[data-field="comprimento"]');
        nextInput?.focus();
        nextInput?.select();
      } else if (field === 'comprimento') {
        if (tipoRomaneioRef.current === 'aberta') {
          // Na cubagem aberta, comprimento é o último campo da linha
          const nextRow = currentRow.nextElementSibling as HTMLTableRowElement | null;
          if (nextRow) {
            const nextInput = nextRow.querySelector<HTMLInputElement>('input[data-field="largura"]') || nextRow.querySelector<HTMLInputElement>('input[data-field="espessura"]');
            nextInput?.focus();
            nextInput?.select();
          } else {
            // Última linha do pacote
            if (item.largura && item.comprimento) {
              addItem(pacoteId);
            }
          }
        } else {
          const nextInput = currentRow.querySelector<HTMLInputElement>('input[data-field="quantidade"]');
          nextInput?.focus();
          nextInput?.select();
        }
      } else if (field === 'quantidade') {
        const nextRow = currentRow.nextElementSibling as HTMLTableRowElement | null;
        if (nextRow) {
          const nextInput = nextRow.querySelector<HTMLInputElement>('input[data-field="largura"]') || nextRow.querySelector<HTMLInputElement>('input[data-field="espessura"]');
          nextInput?.focus();
          nextInput?.select();
        } else {
          // Última linha do pacote
          if (item.espessura && item.largura && item.comprimento && item.quantidade) {
            addItem(pacoteId);
          }
        }
      }
    } else if (e.key === 'ArrowDown') {
      if (currentRow && field) {
        const nextRow = currentRow.nextElementSibling as HTMLTableRowElement | null;
        if (nextRow) {
          e.preventDefault();
          const nextInput = nextRow.querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
          nextInput?.focus();
          nextInput?.select();
        }
      }
    } else if (e.key === 'ArrowUp') {
      if (currentRow && field) {
        const prevRow = currentRow.previousElementSibling as HTMLTableRowElement | null;
        if (prevRow) {
          e.preventDefault();
          const prevInput = prevRow.querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
          prevInput?.focus();
          prevInput?.select();
        }
      }
    } else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      duplicateItem(pacoteId, item.id);
    }
  }, [addItem, duplicateItem, pacoteId]);

  const handleAbrirFixarBitola = useCallback(async () => {
    const currentPacote = pacoteRef.current;
    if (!currentPacote) return;
    const tipo = tipoRomaneioRef.current;
    const { value: formValues } = await Swal.fire({
      title: 'Fixar Bitola do Pacote',
      html: `
        <p class="text-xs text-slate-500 mb-4 font-semibold">
          Defina a espessura e o comprimento padrão para <strong>todas as peças</strong> do Pacote Nº ${currentPacote.numero}:
        </p>
        <div class="space-y-4 text-left font-sans">
          <div>
            <label class="block text-xs font-black text-slate-600 mb-1">Espessura (cm):</label>
            <input id="swal-fix-esp" type="number" step="0.1" placeholder="Ex: 5" class="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold" />
          </div>
          <div>
            <label class="block text-xs font-black text-slate-600 mb-1">
              ${tipo === 'pes' ? 'Comprimento (pés):' : 'Comprimento (metros):'}
            </label>
            <input id="swal-fix-comp" type="number" step="0.01" placeholder="${tipo === 'pes' ? 'Ex: 10' : 'Ex: 4.50'}" class="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold" />
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Aplicar no Pacote',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
      cancelButtonColor: '#94a3b8',
      customClass: {
        popup: 'rounded-3xl p-6 font-sans',
        confirmButton: 'rounded-xl font-bold px-5 py-2.5',
        cancelButton: 'rounded-xl font-bold px-5 py-2.5'
      },
      preConfirm: () => {
        const esp = (document.getElementById('swal-fix-esp') as HTMLInputElement).value;
        const comp = (document.getElementById('swal-fix-comp') as HTMLInputElement).value;
        if (!esp && !comp) {
          Swal.showValidationMessage('Informe pelo menos a espessura ou o comprimento.');
          return false;
        }
        return { esp, comp };
      }
    });

    if (formValues) {
      aplicarBitolaPacote(
        pacoteId,
        formValues.esp ? Number(formValues.esp) : '',
        formValues.comp ? Number(formValues.comp) : ''
      );
      Swal.fire({
        icon: 'success',
        title: 'Bitola Aplicada!',
        text: 'Todas as peças deste pacote receberam as medidas fixadas.',
        timer: 1800,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    }
  }, [aplicarBitolaPacote, pacoteId]);

  const handleColarModal = useCallback(async () => {
    const { value: textoColado } = await Swal.fire({
      title: 'Colar Itens do Excel',
      html: `
        <p class="text-xs text-slate-500 mb-3 font-medium text-left">
          Copie as células no Excel (linhas/colunas de Espessura, Largura, Comprimento, Qtd) e cole abaixo:
        </p>
        <textarea id="swal-paste-area" rows="6" placeholder="Cole aqui (Ctrl+V)..." class="w-full p-3 rounded-xl border border-slate-200 text-xs font-mono"></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Processar e Inserir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
      cancelButtonColor: '#94a3b8',
      customClass: {
        popup: 'rounded-3xl p-6 font-sans max-w-lg',
        confirmButton: 'rounded-xl font-bold px-5 py-2.5',
        cancelButton: 'rounded-xl font-bold px-5 py-2.5'
      },
      preConfirm: () => {
        const txt = (document.getElementById('swal-paste-area') as HTMLTextAreaElement).value;
        if (!txt || !txt.trim()) {
          Swal.showValidationMessage('Cole o texto antes de processar.');
          return false;
        }
        return txt;
      }
    });

    if (textoColado) {
      handlePasteExcel(textoColado);
    }
  }, [handlePasteExcel]);

  const totaisCalculados = useMemo(() => {
    if (!pacote) return { totalPacoteM3: 0, totalPacoteML: 0, totalPacotePecas: 0 };
    let totalPacoteM3 = 0;
    let totalPacoteML = 0;
    let totalPacotePecas = 0;

    const itens = pacote.itens;
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      if (item.espessura && item.largura && item.comprimento && item.quantidade) {
        totalPacoteM3 += calcularVolumeM3(item.espessura, item.largura, item.comprimento, item.quantidade, tipoRomaneio);
        totalPacoteML += calcularMetrosLineares(item.comprimento, item.quantidade, tipoRomaneio);
        totalPacotePecas += Number(item.quantidade) || 0;
      }
    }

    return { totalPacoteM3, totalPacoteML, totalPacotePecas };
  }, [pacote?.itens, tipoRomaneio]);

  if (!pacote) return null;

  const podeBloqueio = pacote.itens.length > 0 && !ultimaLinhaCompleta();

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-200 dark:border-slate-800 overflow-hidden mt-6"
      onPaste={e => {
        const pasteData = e.clipboardData.getData('text');
        if (pasteData && (pasteData.includes('\t') || pasteData.includes('\n'))) {
          e.preventDefault();
          handlePasteExcel(pasteData);
        }
      }}
    >
      {/* Barra de Ações Rápidas do Pacote */}
      <div className="bg-slate-50/70 dark:bg-slate-950/40 px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <span>Pacote Nº {pacote.numero}</span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-emerald-600 dark:text-emerald-450">{pacote.itens.length} linha(s)</span>
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAbrirFixarBitola}
            className="flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs"
            title="Fixar a mesma espessura e comprimento para todo o pacote"
          >
            <SlidersHorizontal size={13} className="text-emerald-500" /> Fixar Bitola
          </button>
          <button
            type="button"
            onClick={handleColarModal}
            className="flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs"
            title="Colar dados copiados do Excel (Ctrl+V)"
          >
            <ClipboardPaste size={13} className="text-blue-500" /> Colar do Excel
          </button>
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black tracking-widest border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3.5 text-center w-12">Item</th>
              <th className="px-4 py-3.5 text-center">Espessura (cm)</th>
              <th className="px-4 py-3.5 text-center">Largura (cm)</th>
              <th className="px-4 py-3.5 text-center">
                {tipoRomaneio === 'pes' ? 'Comprimento (pés)' : 'Comprimento (m)'}
              </th>
              <th className="px-4 py-3.5 text-center w-24">Qtd</th>
              <th className="px-4 py-3.5 text-center">Total ML</th>
              <th className="px-4 py-3.5 text-center">Total M³</th>
              <th className="px-4 py-3.5 text-center w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {pacote.itens.map((item, index) => {
              const isUltima = index === pacote.itens.length - 1;
              const linhaIncompleta = isUltima && pacote.itens.length > 1 && !ultimaLinhaCompleta();

              return (
                <LinhaGridRow
                  key={item.id}
                  item={item}
                  index={index}
                  tipoRomaneio={tipoRomaneio}
                  isUltima={isUltima}
                  linhaIncompleta={linhaIncompleta}
                  pacoteId={pacoteId}
                  onChangeField={handleChangeField}
                  onChangeLargura={handleChangeLargura}
                  onBlurField={handleBlurField}
                  onBlurLargura={handleBlurLargura}
                  onKeyDown={handleKeyDown}
                  onDuplicate={duplicateItem}
                  onRemove={handleRemoveItem}
                />
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
            <tr>
              <td colSpan={4} className="px-5 py-4 font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest text-right text-xs">
                Totais do Pacote {pacote.numero}:
              </td>
              <td className="px-5 py-4 text-center font-black text-slate-800 dark:text-slate-200">
                {totaisCalculados.totalPacotePecas} Peças
              </td>
              <td className="px-5 py-4 text-center font-black text-slate-800 dark:text-slate-200">
                {totaisCalculados.totalPacoteML.toFixed(2)} ML
              </td>
              <td className="px-5 py-4 text-center font-black text-emerald-600 dark:text-emerald-450">
                {totaisCalculados.totalPacoteM3.toFixed(3)} M³
              </td>
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
          type="button"
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
