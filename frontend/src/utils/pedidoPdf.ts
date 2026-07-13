import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Documento do pedido (nível "ordem de compra"): blocos de fornecedor,
 * comprador e entrega, tabela de itens com código, totais com valor por
 * extenso e instruções de faturamento. Usado pelos apps cliente, parceiro
 * e representante (mesmo layout nos três).
 */

export interface PedidoDocumentoItem {
  codigo?: string | null;
  descricao: string;
  unidade: string;
  quantidadeUnidades?: number | null;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export interface PedidoDocumentoParte {
  nome?: string | null;
  razaoSocial?: string | null;
  inscricaoEstadual?: string | null;
  cnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
  /** Endereço cadastral (o que o cliente preencheu no cadastro), já formatado. */
  endereco?: string | null;
}

export interface PedidoDocumentoEntrega {
  descricao?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  complemento?: string | null;
}

export interface PedidoDocumento {
  numero: string;
  dataCriacao: string;
  statusLabel: string;
  vendaMais?: boolean;
  representanteNome?: string | null;
  fornecedor: PedidoDocumentoParte;
  comprador: PedidoDocumentoParte;
  entrega?: PedidoDocumentoEntrega | null;
  condicaoPagamento?: string | null;
  senhaCompra?: string | null;
  observacao?: string | null;
  itens: PedidoDocumentoItem[];
  valorTotal: number;
}

const brl = (v: number | null | undefined) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
};

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function trioPorExtenso(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (d === 1) partes.push(DEZ_A_DEZENOVE[u]);
  else {
    if (d) partes.push(DEZENAS[d]);
    if (u) partes.push(UNIDADES[u]);
  }
  return partes.join(' e ');
}

export function valorPorExtenso(valor: number): string {
  const abs = Math.abs(valor);
  const inteiro = Math.floor(abs);
  const centavos = Math.round((abs - inteiro) * 100);

  let texto: string;
  if (inteiro === 0) {
    texto = 'zero real';
  } else {
    const milhoes = Math.floor(inteiro / 1_000_000);
    const milhares = Math.floor((inteiro % 1_000_000) / 1000);
    const resto = inteiro % 1000;
    const grupos: string[] = [];
    if (milhoes) grupos.push(milhoes === 1 ? 'um milhão' : `${trioPorExtenso(milhoes)} milhões`);
    if (milhares) grupos.push(milhares === 1 ? 'mil' : `${trioPorExtenso(milhares)} mil`);
    if (resto) grupos.push(trioPorExtenso(resto));
    if (grupos.length === 1) {
      texto = grupos[0];
    } else {
      const ultimo = grupos.pop() as string;
      const usarE = resto > 0 && (resto < 100 || resto % 100 === 0);
      texto = grupos.join(' ') + (usarE ? ' e ' : ' ') + ultimo;
    }
    // "um milhão DE reais" quando o valor termina exatamente nos milhões
    const preposicao = milhoes > 0 && milhares === 0 && resto === 0 ? ' de' : '';
    texto += inteiro === 1 ? ' real' : `${preposicao} reais`;
  }

  if (centavos > 0) {
    texto += ` e ${trioPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`;
  }
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const CINZA_TITULO: [number, number, number] = [237, 242, 247];
const CINZA_TEXTO: [number, number, number] = [74, 85, 104];
const PRETO: [number, number, number] = [26, 32, 44];
const VERMELHO_KIPI: [number, number, number] = [197, 48, 48];
const VERDE: [number, number, number] = [39, 103, 73];

export function gerarPedidoPdfBlob(dados: PedidoDocumento): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mX = 14;
  const contentW = pageW - mX * 2;
  let y = 16;

  // ---------- Cabeçalho ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...VERMELHO_KIPI);
  doc.text('KIPI', mX, y);
  doc.setFontSize(8);
  doc.setTextColor(...CINZA_TEXTO);
  doc.setFont('helvetica', 'normal');
  doc.text('kipi.com.br', mX, y + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...PRETO);
  doc.text('PEDIDO DE COMPRA', pageW - mX, y - 3, { align: 'right' });
  doc.setFontSize(11);
  doc.text(`Nº ${dados.numero}`, pageW - mX, y + 2.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_TEXTO);
  const dt = new Date(dados.dataCriacao);
  doc.text(`Emissão: ${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, pageW - mX, y + 7, { align: 'right' });

  y += 11;
  doc.setDrawColor(...PRETO);
  doc.setLineWidth(0.5);
  doc.line(mX, y, pageW - mX, y);
  y += 5;

  // ---------- Status / origem ----------
  doc.setFontSize(9);
  doc.setTextColor(...PRETO);
  doc.setFont('helvetica', 'bold');
  let statusLinha = `Status: ${dados.statusLabel}`;
  if (dados.vendaMais) statusLinha += '    •    Origem: VENDA MAIS';
  if (dados.representanteNome) statusLinha += `    •    Representante: ${dados.representanteNome}`;
  if (dados.vendaMais || dados.representanteNome) doc.setTextColor(...VERDE);
  doc.text(statusLinha, mX, y);
  y += 6;

  // ---------- Blocos fornecedor / comprador ----------
  const half = contentW / 2 - 2;

  const parteLinhas = (p: PedidoDocumentoParte): string[] => {
    const linhas: string[] = [];
    linhas.push(p.nome || p.razaoSocial || '--');
    if (p.razaoSocial && p.razaoSocial !== p.nome) linhas.push(`Razão social: ${p.razaoSocial}`);
    if (p.cnpj) linhas.push(`CNPJ: ${p.cnpj}`);
    if (p.inscricaoEstadual) linhas.push(`Inscrição estadual: ${p.inscricaoEstadual}`);
    if (p.endereco) linhas.push(`Endereço: ${p.endereco}`);
    if (p.telefone) linhas.push(`Telefone: ${p.telefone}`);
    if (p.email) linhas.push(`E-mail: ${p.email}`);
    return linhas;
  };

  const desenharBloco = (titulo: string, linhas: string[], x: number, yTop: number, w: number): number => {
    doc.setFillColor(...CINZA_TITULO);
    doc.rect(x, yTop, w, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...PRETO);
    doc.text(titulo, x + 2, yTop + 4.2);
    let yy = yTop + 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const linha of linhas) {
      const quebradas = doc.splitTextToSize(linha, w - 4);
      doc.text(quebradas, x + 2, yy);
      yy += quebradas.length * 4.4;
    }
    return yy;
  };

  const yFor = desenharBloco('FORNECEDOR', parteLinhas(dados.fornecedor), mX, y, half);
  const yCom = desenharBloco('COMPRADOR (CLIENTE)', parteLinhas(dados.comprador), mX + half + 4, y, half);
  y = Math.max(yFor, yCom) + 2;

  // ---------- Bloco entrega ----------
  if (dados.entrega) {
    const e = dados.entrega;
    const linhasEntrega: string[] = [];
    const linha1 = [e.logradouro, e.numero].filter(Boolean).join(', ');
    const linha2 = [e.bairro, [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' - ');
    if (e.descricao) linhasEntrega.push(e.descricao);
    if (linha1) linhasEntrega.push(linha1);
    if (linha2) linhasEntrega.push(`${linha2}${e.cep ? ` - CEP ${e.cep}` : ''}`);
    else if (e.cep) linhasEntrega.push(`CEP ${e.cep}`);
    if (e.complemento) linhasEntrega.push(`Complemento: ${e.complemento}`);
    if (linhasEntrega.length === 0) linhasEntrega.push('--');
    y = desenharBloco('ENDEREÇO DE ENTREGA', linhasEntrega, mX, y, contentW) + 2;
  }

  // ---------- Condições ----------
  const condicoes: string[] = [];
  condicoes.push(`Condição de pagamento: ${dados.condicaoPagamento || 'A VISTA'}`);
  if (dados.senhaCompra) condicoes.push(`Senha da compra: ${dados.senhaCompra}`);
  if (dados.observacao) condicoes.push(`Observação: ${dados.observacao}`);
  y = desenharBloco('CONDIÇÕES', condicoes, mX, y, contentW) + 2;

  // ---------- Itens ----------
  const body = dados.itens.map((item, index) => [
    String(index + 1),
    item.codigo || '--',
    item.descricao,
    item.unidade,
    item.quantidadeUnidades && item.quantidadeUnidades > 1 ? String(item.quantidadeUnidades) : '1',
    String(item.quantidade),
    brl(item.valorUnitario),
    brl(item.valorTotal),
  ]);

  autoTable(doc, {
    startY: y + 1,
    margin: { left: mX, right: mX, bottom: 22 },
    head: [['#', 'Código', 'Descrição', 'Emb.', 'Un/Emb.', 'Qtd.', 'Vl. Unit.', 'Vl. Total']],
    body,
    styles: { fontSize: 8, cellPadding: 1.6, textColor: PRETO as any },
    headStyles: { fillColor: PRETO as any, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 250, 252] as any },
    columnStyles: {
      0: { cellWidth: 7 },
      1: { cellWidth: 20 },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 12, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 24, halign: 'right' },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Quebra de página para o rodapé de totais, se necessário
  if (y > pageH - 55) {
    doc.addPage();
    y = 20;
  }

  // ---------- Totais ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PRETO);
  doc.text(`VALOR TOTAL: ${brl(dados.valorTotal)}`, pageW - mX, y, { align: 'right' });
  y += 5.5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_TEXTO);
  const extenso = doc.splitTextToSize(`Total por extenso: ${valorPorExtenso(dados.valorTotal)}`, contentW);
  doc.text(extenso, pageW - mX, y, { align: 'right' });
  y += extenso.length * 4.4 + 4;

  // ---------- Instruções ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PRETO);
  doc.text('OBSERVAÇÕES IMPORTANTES', mX, y);
  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...CINZA_TEXTO);
  const instrucoes = [
    `• O número deste pedido (${dados.numero}) deve constar na nota fiscal de faturamento.`,
    '• Não serão aceitas notas fiscais com valores superiores a este pedido.',
    '• Confira os produtos e as quantidades no ato da entrega.',
  ];
  for (const instrucao of instrucoes) {
    const quebradas = doc.splitTextToSize(instrucao, contentW);
    doc.text(quebradas, mX, y);
    y += quebradas.length * 3.8;
  }

  // ---------- Rodapé em todas as páginas ----------
  const totalPaginas = doc.getNumberOfPages();
  const geradoEm = new Date();
  for (let p = 1; p <= totalPaginas; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 224);
    doc.setLineWidth(0.3);
    doc.line(mX, pageH - 14, pageW - mX, pageH - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA_TEXTO);
    doc.text(
      `Documento gerado pela plataforma KIPI em ${geradoEm.toLocaleDateString('pt-BR')} ${geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      mX,
      pageH - 9,
    );
    doc.text(`Página ${p} de ${totalPaginas}`, pageW - mX, pageH - 9, { align: 'right' });
  }

  const buffer = doc.output('arraybuffer');
  return new Blob([buffer], { type: 'application/pdf' });
}
