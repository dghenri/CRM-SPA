/* ---------------------------------------------------------------------------
 * Relatório de Receita em PDF (gerado no navegador, sem passar pelo servidor).
 *
 * Usa as mesmas rotas da página (/staff/revenue/*), então os números do PDF são
 * exatamente os da tela para o mesmo período. Dependências:
 *   npm i jspdf jspdf-autotable
 *
 * Este arquivo é carregado com import() só quando a pessoa clica em "Gerar PDF"
 * (ver ExportModal em Revenue.jsx), para o jspdf não pesar a página.
 * ------------------------------------------------------------------------- */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/* ------------------------------ layout ----------------------------------- */
const PAGE_W = 210; // A4 retrato, em mm
const PAGE_H = 297;
const M = 14; // margem lateral
const CONTENT_W = PAGE_W - M * 2;

const ACCENT = [10, 99, 214];
const INK = [24, 24, 27];
const MUTED = [113, 113, 122];
const LINE = [228, 228, 231];
const SOFT = [244, 244, 245];
const GOOD = [22, 128, 61];
const BAD = [185, 28, 28];

const MAX_TRANSACTIONS = 500; // 10 páginas de 50: mantém o PDF leve mesmo em "Tudo"
const TX_PAGE_SIZE = 50;

/* ------------------------------ formatação ------------------------------- */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const fmtNum = (n) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtPercent = (n) => `${Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const fmtDate = (d) => d.toLocaleDateString("pt-BR");
// montado à mão (dd/mm/aaaa hh:mm): o toLocaleString muda de vírgula/espaço entre navegadores
const fmtDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const plural = (n, one, many) => `${fmtNum(n)} ${Number(n) === 1 ? one : many}`;
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// A fonte padrão do PDF (Helvetica) cobre o português (acentos e ç), mas não
// espaços "estreitos" nem alguns traços: troca por equivalentes simples.
const clean = (value) =>
  String(value ?? "")
    .replace(/[   ]/g, " ")
    .replace(/−/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[^\u0000-ÿ]/g, "?");

function pad2(n) {
  return String(n).padStart(2, "0");
}
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const PERIOD_DAYS = { "1W": 7, "1M": 30, "3M": 90, "1Y": 365 };
function periodRange(period) {
  const days = PERIOD_DAYS[period];
  if (!days) return null; // ALL
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1)); // inclui hoje, igual ao back-end
  return `${fmtDate(start)} a ${fmtDate(end)}`;
}

const GRANULARITY = { hour: "hora", day: "dia", week: "semana", month: "mês", year: "ano" };

function changeText(change) {
  if (change == null) return "-";
  if (change === 0) return "sem variação";
  return `${change > 0 ? "+" : "-"}${Math.abs(change).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
// goodWhen: subir é bom ("up") ou ruim ("down"); define verde/vermelho
function changeColor(change, goodWhen) {
  if (change == null || change === 0) return MUTED;
  return change > 0 === (goodWhen === "up") ? GOOD : BAD;
}

/* ------------------------------ dados ------------------------------------ */
async function loadReportData(api, period) {
  const q = `period=${period}`;
  const [summary, chart, methods, services, firstTx] = await Promise.all([
    api.get(`/staff/revenue/summary?${q}`),
    api.get(`/staff/revenue/chart?range=${period}`),
    api.get(`/staff/revenue/payment-methods?${q}&sort=amount`),
    api.get(`/staff/revenue/services?${q}&sort=revenue&limit=100`),
    api.get(`/staff/revenue/transactions?${q}&page=1&limit=${TX_PAGE_SIZE}`),
  ]);

  // demais páginas de transações (até o limite), em paralelo
  const lastPage = Math.min(firstTx.pages, Math.ceil(MAX_TRANSACTIONS / TX_PAGE_SIZE));
  const rest = await Promise.all(
    Array.from({ length: Math.max(lastPage - 1, 0) }, (_, i) =>
      api.get(`/staff/revenue/transactions?${q}&page=${i + 2}&limit=${TX_PAGE_SIZE}`)
    )
  );
  const transactions = [firstTx, ...rest].flatMap((r) => r.items);

  return { summary, chart, methods, services, transactions, transactionsTotal: firstTx.total };
}

/* ------------------------------ peças de desenho ------------------------- */
function sectionTitle(doc, y, title, subtitle) {
  if (y > PAGE_H - 55) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...INK);
  doc.text(clean(title), M, y);
  if (subtitle) {
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
    doc.text(clean(subtitle), M, y + 5);
    return y + 9;
  }
  return y + 6;
}

function emptyNote(doc, y, text) {
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  doc.text(clean(text), M, y + 4);
  return y + 14;
}

function footnote(doc, y, text) {
  doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(...MUTED);
  doc.text(clean(text), M, y);
  return y + 8;
}

// opções comuns de todas as tabelas
function tableBase() {
  return {
    theme: "plain",
    margin: { top: 18, left: M, right: M, bottom: 18 },
    rowPageBreak: "avoid", // nunca corta uma linha no meio entre duas páginas
    styles: { font: "helvetica", fontSize: 8.5, textColor: INK, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 }, overflow: "linebreak" },
    headStyles: { fillColor: SOFT, textColor: MUTED, fontStyle: "bold", fontSize: 8 },
    footStyles: { fillColor: SOFT, textColor: INK, fontStyle: "bold" },
    // linha fina embaixo de cada linha do corpo
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      const { doc } = data;
      doc.setDrawColor(...LINE).setLineWidth(0.1);
      doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
    },
  };
}

// teto "redondo" (1, 2, 5 x 10^n) e quantos intervalos dão marcas redondas no eixo
// (ex: 5.000 em 5 intervalos = R$ 1 mil cada; 2.000 em 4 = R$ 500 cada)
function niceScale(max) {
  if (max <= 0) return { top: 1, intervals: 4 };
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  const lead = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return { top: lead * exp, intervals: lead === 2 ? 4 : 5 };
}

// gráfico de barras da receita líquida, desenhado com formas do próprio PDF
function drawBarChart(doc, series, { x, y, w, h }) {
  const axisW = 17;
  const labelH = 6;
  const plotX = x + axisW;
  const plotW = w - axisW;
  const plotTop = y + 2;
  const plotBottom = y + h - labelH;
  const plotH = plotBottom - plotTop;

  const values = series.map((s) => s.revenue);
  const { top: max, intervals } = niceScale(Math.max(0, ...values));
  const hasData = values.some((v) => v > 0);

  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED);
  doc.setDrawColor(...LINE).setLineWidth(0.1);

  // sem receita: só a base e o aviso (uma grade de valores zerados não ajuda)
  if (!hasData) {
    doc.line(plotX, plotBottom, plotX + plotW, plotBottom);
    doc.setFontSize(9);
    doc.text("Sem receita no período", plotX + plotW / 2, plotTop + plotH / 2, { align: "center" });
    return;
  }

  // linhas de grade e eixo Y
  for (let i = 0; i <= intervals; i++) {
    const yy = plotBottom - (i / intervals) * plotH;
    doc.line(plotX, yy, plotX + plotW, yy);
    const v = (max * i) / intervals;
    doc.text(clean(v === 0 ? "0" : brlCompact.format(v)), plotX - 2, yy + 1, { align: "right" });
  }

  const n = series.length;
  const slot = plotW / n;
  const barW = Math.min(slot * 0.62, 12);
  const labelStep = Math.max(1, Math.ceil(n / 12)); // poucos rótulos, ancorados na última barra

  series.forEach((s, i) => {
    const bh = (s.revenue / max) * plotH;
    const bx = plotX + i * slot + (slot - barW) / 2;
    if (bh > 0) {
      const isLast = i === n - 1;
      doc.setFillColor(...(isLast ? ACCENT : [153, 196, 245]));
      if (bh < 1.5) doc.rect(bx, plotBottom - bh, barW, bh, "F");
      else doc.roundedRect(bx, plotBottom - bh, barW, bh, 0.6, 0.6, "F");
    }
    if ((n - 1 - i) % labelStep === 0) {
      doc.setFontSize(7).setTextColor(...MUTED);
      doc.text(clean(s.label), plotX + i * slot + slot / 2, plotBottom + 4, { align: "center" });
    }
  });
}

/* ------------------------------ montagem do PDF -------------------------- */
function buildPdf({ period, periods, methodLabel, data }) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const now = new Date();
  const periodInfo = periods.find((p) => p.id === period);
  const periodTitle = capitalize(periodInfo?.title ?? period);
  const range = periodRange(period);

  doc.setProperties({
    title: `Relatório de Receita - ${periodTitle}`,
    subject: "Receita - Viva Bem Spa",
    creator: "Viva Bem Spa",
  });

  /* ---- cabeçalho ---- */
  doc.setFillColor(...ACCENT).rect(0, 0, PAGE_W, 3, "F");
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...ACCENT);
  doc.text("VIVA BEM SPA", M, 13);

  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
  doc.text(
    clean(`Gerado em ${fmtDate(now)} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`),
    PAGE_W - M,
    13,
    { align: "right" }
  );

  doc.setFont("helvetica", "bold").setFontSize(21).setTextColor(...INK);
  doc.text("Relatório de Receita", M, 24);

  doc.setFont("helvetica", "normal").setFontSize(10.5).setTextColor(...INK);
  doc.text(clean(range ? `${periodTitle}  (${range})` : "Todo o período"), M, 31);

  doc.setFontSize(8).setTextColor(...MUTED);
  doc.text("Receita realizada = atendimentos concluídos. O valor líquido já desconta os cupons usados.", M, 36.5);
  doc.setDrawColor(...LINE).setLineWidth(0.3).line(M, 40, PAGE_W - M, 40);

  let y = 48;

  /* ---- resumo ---- */
  const { cards, forecast } = data.summary;
  const kpi = (label, key, format, goodWhen) => {
    const card = cards[key];
    return [
      { content: label },
      { content: clean(format(card.value)), styles: { fontStyle: "bold", halign: "right" } },
      { content: changeText(card.change), styles: { textColor: changeColor(card.change, goodWhen), halign: "right" } },
    ];
  };
  y = sectionTitle(doc, y, "Resumo", "Variação em relação ao período anterior de mesmo tamanho");
  autoTable(doc, {
    ...tableBase(),
    startY: y,
    head: [["Indicador", { content: "Valor", styles: { halign: "right" } }, { content: "Variação", styles: { halign: "right" } }]],
    body: [
      kpi("Receita líquida", "net", (v) => brl.format(v), "up"),
      kpi("Receita bruta", "gross", (v) => brl.format(v), "up"),
      kpi("Descontos de cupons", "discount", (v) => brl.format(v), "down"),
      kpi("Sessões concluídas", "sessions", (v) => fmtNum(v), "up"),
      kpi("Ticket médio", "averageTicket", (v) => brl.format(v), "up"),
      [
        { content: "Receita prevista" },
        { content: clean(brl.format(forecast.value)), styles: { fontStyle: "bold", halign: "right" } },
        { content: clean(`${plural(forecast.sessions, "sessão agendada", "sessões agendadas")} daqui pra frente`), styles: { textColor: MUTED, halign: "right" } },
      ],
    ],
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 45 } },
  });
  y = doc.lastAutoTable.finalY + 10;

  /* ---- gráfico ---- */
  const series = data.chart.series;
  y = sectionTitle(doc, y, "Desempenho no período", `Receita líquida por ${GRANULARITY[data.chart.granularity] ?? "período"}`);
  if (y + 62 > PAGE_H - 18) {
    doc.addPage();
    y = sectionTitle(doc, 20, "Desempenho no período", `Receita líquida por ${GRANULARITY[data.chart.granularity] ?? "período"}`);
  }
  drawBarChart(doc, series, { x: M, y, w: CONTENT_W, h: 54 });
  y += 54 + 10;

  /* ---- formas de pagamento ---- */
  const methods = data.methods.items;
  y = sectionTitle(doc, y, "Formas de pagamento", "Ordenadas pelo maior valor líquido");
  if (methods.length === 0) {
    y = emptyNote(doc, y, "Nenhum atendimento concluído neste período.");
  } else {
    const sum = (key) => methods.reduce((s, m) => s + m[key], 0);
    autoTable(doc, {
      ...tableBase(),
      startY: y,
      showFoot: "lastPage",
      head: [[
        "Forma",
        { content: "Sessões", styles: { halign: "right" } },
        { content: "Bruto", styles: { halign: "right" } },
        { content: "Descontos", styles: { halign: "right" } },
        { content: "Líquido", styles: { halign: "right" } },
        { content: "% da receita", styles: { halign: "right" } },
        { content: "Ticket médio", styles: { halign: "right" } },
      ]],
      body: methods.map((m) => [
        clean(methodLabel(m.method)),
        { content: fmtNum(m.sessions), styles: { halign: "right" } },
        { content: clean(brl.format(m.gross)), styles: { halign: "right" } },
        { content: clean(brl.format(m.discount)), styles: { halign: "right" } },
        { content: clean(brl.format(m.net)), styles: { halign: "right", fontStyle: "bold" } },
        { content: fmtPercent(m.shareAmount), styles: { halign: "right" } },
        { content: clean(brl.format(m.averageTicket)), styles: { halign: "right" } },
      ]),
      foot: [[
        "Total",
        { content: fmtNum(sum("sessions")), styles: { halign: "right" } },
        { content: clean(brl.format(sum("gross"))), styles: { halign: "right" } },
        { content: clean(brl.format(sum("discount"))), styles: { halign: "right" } },
        { content: clean(brl.format(sum("net"))), styles: { halign: "right" } },
        { content: methods.length ? "100%" : "-", styles: { halign: "right" } },
        { content: clean(brl.format(sum("sessions") ? sum("net") / sum("sessions") : 0)), styles: { halign: "right" } },
      ]],
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  /* ---- procedimentos ---- */
  const services = data.services.items;
  y = sectionTitle(doc, y, "Procedimentos", "Ordenados pela maior receita líquida");
  if (services.length === 0) {
    y = emptyNote(doc, y, "Nenhum atendimento concluído neste período.");
  } else {
    autoTable(doc, {
      ...tableBase(),
      startY: y,
      head: [[
        "Procedimento",
        { content: "Sessões", styles: { halign: "right" } },
        { content: "Bruto", styles: { halign: "right" } },
        { content: "Líquido", styles: { halign: "right" } },
        { content: "% da receita", styles: { halign: "right" } },
      ]],
      body: services.map((s) => [
        clean(s.title),
        { content: fmtNum(s.sessions), styles: { halign: "right" } },
        { content: clean(brl.format(s.gross)), styles: { halign: "right" } },
        { content: clean(brl.format(s.net)), styles: { halign: "right", fontStyle: "bold" } },
        { content: fmtPercent(s.share), styles: { halign: "right" } },
      ]),
      columnStyles: { 0: { cellWidth: 70 } },
    });
    y = doc.lastAutoTable.finalY + 6;
    if (data.services.totalServices > services.length) {
      y = footnote(doc, y, `Exibindo ${services.length} de ${fmtNum(data.services.totalServices)} procedimentos.`);
    } else {
      y += 4;
    }
  }

  /* ---- transações ---- */
  const txs = data.transactions;
  y = sectionTitle(doc, y, "Transações", "Atendimentos concluídos, do mais recente ao mais antigo");
  if (txs.length === 0) {
    y = emptyNote(doc, y, "Nenhuma transação neste período.");
  } else {
    autoTable(doc, {
      ...tableBase(),
      startY: y,
      styles: { ...tableBase().styles, fontSize: 8 },
      head: [[
        "Data",
        "Cliente",
        "Procedimento",
        "Pagamento",
        { content: "Bruto", styles: { halign: "right" } },
        { content: "Cupom", styles: { halign: "right" } },
        { content: "Líquido", styles: { halign: "right" } },
      ]],
      body: txs.map((t) => [
        clean(fmtDateTime(t.date)),
        clean(t.customerName),
        clean(t.serviceTitle),
        clean(methodLabel(t.paymentMethod ?? "None")),
        { content: clean(brl.format(t.gross)), styles: { halign: "right" } },
        { content: t.discount > 0 ? clean(`-${brl.format(t.discount)}`) : "-", styles: { halign: "right", textColor: t.discount > 0 ? MUTED : LINE } },
        { content: clean(brl.format(t.net)), styles: { halign: "right", fontStyle: "bold" } },
      ]),
      columnStyles: {
        0: { cellWidth: 29 },
        1: { cellWidth: 32 },
        2: { cellWidth: 36 },
        3: { cellWidth: 27 },
        4: { cellWidth: 20 },
        5: { cellWidth: 18 },
        6: { cellWidth: 20 },
      },
    });
    y = doc.lastAutoTable.finalY + 6;
    if (data.transactionsTotal > txs.length) {
      footnote(doc, y, `Exibindo as ${fmtNum(txs.length)} transações mais recentes de ${fmtNum(data.transactionsTotal)} no período.`);
    }
  }

  /* ---- rodapé em todas as páginas ---- */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text("Viva Bem Spa - Relatório de Receita", M, PAGE_H - 7.5);
    doc.text(`Página ${i} de ${pages}`, PAGE_W - M, PAGE_H - 7.5, { align: "right" });
  }

  return doc;
}

/**
 * Busca os dados do período escolhido, monta o PDF e baixa o arquivo.
 * @param {object} opts
 * @param {{ get: (path: string) => Promise<any> }} opts.api  cliente da API (api/api.js)
 * @param {string} opts.period   "1W" | "1M" | "3M" | "1Y" | "ALL"
 * @param {Array<{id: string, title: string}>} opts.periods  períodos da página (para o título)
 * @param {(id: string) => string} opts.methodLabel  nome da forma de pagamento ("Pix", "CreditCard"...)
 * @param {boolean} [opts.save=true]  false devolve o jsPDF sem baixar (útil em testes)
 */
export async function generateRevenueReport({ api, period, periods, methodLabel, save = true }) {
  const data = await loadReportData(api, period);
  const doc = buildPdf({ period, periods, methodLabel, data });
  if (save) doc.save(`relatorio-receita-${period.toLowerCase()}-${isoDay(new Date())}.pdf`);
  return doc;
}
