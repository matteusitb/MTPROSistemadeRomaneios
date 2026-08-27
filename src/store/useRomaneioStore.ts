import { create } from 'zustand';

const getLocalDateString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export interface RomaneioItem {
  id: string;
  espessura: number | '';
  largura: number | string | '';
  comprimento: number | '';
  quantidade: number | '';
}

export interface RomaneioPacote {
  id: string;
  numero: number;
  especie: string;
  itens: RomaneioItem[];
}

interface RomaneioState {
  tipoRomaneio: 'padrao' | 'aberta' | 'pes';
  cliente: string;
  data: string;
  pacotes: RomaneioPacote[];

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  setTipoRomaneio: (tipo: 'padrao' | 'aberta' | 'pes') => void;
  setCliente: (cliente: string) => void;
  setData: (data: string) => void;

  addPacote: () => void;
  removePacote: (pacoteId: string) => void;
  setEspeciePacote: (pacoteId: string, especie: string) => void;
  setNumeroPacote: (pacoteId: string, numero: number) => void;

  addItem: (pacoteId: string) => void;
  removeItem: (pacoteId: string, itemId: string) => void;
  updateItem: (pacoteId: string, itemId: string, field: keyof RomaneioItem, value: string | number) => void;
  duplicateItem: (pacoteId: string, itemId: string) => void;

  loadRomaneio: (dados: { cliente: string; data: string; pacotes: { numero_pacote?: number; especie?: string; itens?: { espessura?: number | string; largura?: number | string; comprimento?: number | string; quantidade?: number | string; }[] }[]; tipoRomaneio?: 'padrao' | 'aberta' | 'pes' }) => void;
  resetForm: () => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const useRomaneioStore = create<RomaneioState>((set) => ({
  tipoRomaneio: 'padrao',
  cliente: '',
  data: getLocalDateString(),
  pacotes: [{
    id: generateId(),
    numero: 1,
    especie: '',
    itens: [
      { id: generateId(), espessura: '', largura: '', comprimento: '', quantidade: '' }
    ]
  }],
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setTipoRomaneio: (tipo) => set({ tipoRomaneio: tipo }),
  setCliente: (cliente) => set({ cliente }),
  setData: (data) => set({ data }),

  addPacote: () => set((state) => {
    const lastPacote = state.pacotes[state.pacotes.length - 1];
    
    // Verificar se o último pacote está minimamente preenchido
    if (lastPacote) {
      const temEspecie = lastPacote.especie && lastPacote.especie.trim().length > 0;
      const temLinhaCompleta = lastPacote.itens.some(i =>
        i.espessura !== '' && i.largura !== '' && i.comprimento !== '' && i.quantidade !== '' &&
        Number(i.espessura) > 0 && Number(i.comprimento) > 0 && Number(i.quantidade) > 0
      );
      if (!temEspecie || !temLinhaCompleta) {
        // Retorna state sem alteração — a tela deve tratar esse caso
        return state;
      }
    }
    
    const maxNumero = state.pacotes.reduce((max, p) => p.numero > max ? p.numero : max, 0);
    return {
      pacotes: [
        ...state.pacotes,
        {
          id: generateId(),
          numero: maxNumero + 1,
          especie: lastPacote ? lastPacote.especie : '',
          itens: [{ id: generateId(), espessura: '', largura: '', comprimento: '', quantidade: '' }]
        }
      ]
    };
  }),

  removePacote: (pacoteId) => set((state) => ({
    pacotes: state.pacotes.filter(p => p.id !== pacoteId)
  })),

  setEspeciePacote: (pacoteId, especie) => set((state) => ({
    pacotes: state.pacotes.map(p => p.id === pacoteId ? { ...p, especie } : p)
  })),

  setNumeroPacote: (pacoteId, numero) => set((state) => ({
    pacotes: state.pacotes.map(p => p.id === pacoteId ? { ...p, numero } : p)
  })),

  addItem: (pacoteId) => set((state) => ({
    pacotes: state.pacotes.map(p => {
      if (p.id === pacoteId) {
        const lastItem = p.itens[p.itens.length - 1];
        return {
          ...p,
          itens: [
            ...p.itens,
            { 
              id: generateId(), 
              espessura: lastItem ? lastItem.espessura : '', 
              largura: '', 
              comprimento: '', 
              quantidade: '' 
            }
          ]
        };
      }
      return p;
    })
  })),

  removeItem: (pacoteId, itemId) => set((state) => ({
    pacotes: state.pacotes.map(p => {
      if (p.id === pacoteId) {
        return { ...p, itens: p.itens.filter(i => i.id !== itemId) };
      }
      return p;
    })
  })),

  duplicateItem: (pacoteId, itemId) => set((state) => ({
    pacotes: state.pacotes.map(p => {
      if (p.id === pacoteId) {
        const itemToDuplicate = p.itens.find(i => i.id === itemId);
        if (!itemToDuplicate) return p;
        const idx = p.itens.findIndex(i => i.id === itemId);
        const newItem = {
          ...itemToDuplicate,
          id: generateId(),
        };
        const newItens = [...p.itens];
        newItens.splice(idx + 1, 0, newItem);
        return { ...p, itens: newItens };
      }
      return p;
    })
  })),

  updateItem: (pacoteId, itemId, field, value) => set((state) => ({
    pacotes: state.pacotes.map(p => {
      if (p.id === pacoteId) {
        return {
          ...p,
          itens: p.itens.map(i => {
            if (i.id === itemId) {
              return { ...i, [field]: value };
            }
            return i;
          })
        };
      }
      return p;
    })
  })),

  resetForm: () => set({
    tipoRomaneio: 'padrao',
    cliente: '',
    data: getLocalDateString(),
    pacotes: [{
      id: generateId(),
      numero: 1,
      especie: '',
      itens: [{ id: generateId(), espessura: '', largura: '', comprimento: '', quantidade: '' }]
    }]
  }),

  loadRomaneio: (dados) => set({
    tipoRomaneio: dados.tipoRomaneio || 'padrao',
    cliente: dados.cliente,
    data: dados.data,
    pacotes: dados.pacotes.map((p, pIdx: number) => {
      const itensBD = p.itens || [];
      const itensAgrupados: RomaneioItem[] = [];
      const bicaCorridaMap: { [key: string]: { espessura: number; comprimento: number; larguras: number[] } } = {};

      itensBD.forEach((i) => {
        const esp = Number(i.espessura) || 0;
        const comp = Number(i.comprimento) || 0;
        const qtd = Number(i.quantidade) || 0;
        const larg = Number(i.largura) || 0;

        if (dados.tipoRomaneio === 'aberta' && qtd === 1 && esp > 0 && comp > 0 && larg > 0) {
          const key = `${esp}_${comp}`;
          if (!bicaCorridaMap[key]) {
            bicaCorridaMap[key] = { espessura: esp, comprimento: comp, larguras: [] };
          }
          bicaCorridaMap[key].larguras.push(larg);
        } else {
          itensAgrupados.push({
            id: generateId(),
            espessura: i.espessura as any ?? '',
            largura: i.largura as any ?? '',
            comprimento: i.comprimento as any ?? '',
            quantidade: i.quantidade as any ?? '',
          });
        }
      });

      Object.values(bicaCorridaMap).forEach((grupo) => {
        if (grupo.larguras.length > 1) {
          itensAgrupados.push({
            id: generateId(),
            espessura: grupo.espessura,
            largura: grupo.larguras.join(' - '),
            comprimento: grupo.comprimento,
            quantidade: grupo.larguras.length,
          });
        } else if (grupo.larguras.length === 1) {
          itensAgrupados.push({
            id: generateId(),
            espessura: grupo.espessura,
            largura: grupo.larguras[0],
            comprimento: grupo.comprimento,
            quantidade: 1,
          });
        }
      });

      // Ordenar itens por espessura/comprimento decrescente para manter a bitola organizada
      itensAgrupados.sort((a, b) => {
        const espA = Number(a.espessura) || 0;
        const espB = Number(b.espessura) || 0;
        if (espA !== espB) return espB - espA;
        
        const compA = Number(a.comprimento) || 0;
        const compB = Number(b.comprimento) || 0;
        return compB - compA;
      });

      return {
        id: generateId(),
        numero: p.numero_pacote ?? (pIdx + 1),
        especie: p.especie || '',
        itens: itensAgrupados.length > 0 ? itensAgrupados : [{ id: generateId(), espessura: '', largura: '', comprimento: '', quantidade: '' }]
      };
    })
  }),
}));
