const el = selector => document.querySelector(selector);
const tableBody = el("#salesTableBody");
const searchInput = el("#salesSearch");
const periodFilter = el("#periodFilter");
const emptyState = el("#emptyState");
const dialog = el("#saleDialog");
const toast = el("#toast");
let data = { medicamentos: [], vendas: [] };
let sessionUser = null;
let toastTimeout;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function money(value) {
  return new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function dateBounds(value) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (value === "today") return { start, end: new Date(start.getTime() + 86400000) };
  if (value === "week") return { start: new Date(start.getTime() - 6 * 86400000), end: new Date(start.getTime() + 86400000) };
  if (value === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
  return null;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "Data inválida", time: "—" };
  return {
    date: new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(date)
  };
}

function medicineName(id) {
  return data.medicamentos.find(item => Number(item.idMedicamento) === Number(id))?.nome || `Medicamento #${id}`;
}

function allSales() {
  if (!sessionUser) return [];
  return data.vendas
    .filter(sale => Number(sale.idUsuarios) === Number(sessionUser.idUsuarios))
    .sort((a, b) => new Date(b.dataEHora) - new Date(a.dataEHora));
}

function filteredSales() {
  const query = searchInput.value.trim().toLocaleLowerCase("pt");
  const bounds = dateBounds(periodFilter.value);
  return allSales().filter(sale => {
    const date = new Date(sale.dataEHora);
    if (bounds && (Number.isNaN(date.getTime()) || date < bounds.start || date >= bounds.end)) return false;
    if (!query) return true;
    const productNames = (sale.itens || []).map(item => item.nomeMedicamento || medicineName(item.idMedicamento)).join(" ");
    const terms = `V-${String(sale.idVenda).padStart(4, "0")} ${sale.idVenda} ${sale.formaDePagamento} ${productNames}`.toLocaleLowerCase("pt");
    return terms.includes(query);
  });
}

function updateMetrics(sales) {
  const units = sales.reduce((total, sale) => total + (sale.itens || []).reduce((count, item) => count + Number(item.qtdVendida || 0), 0), 0);
  const total = sales.reduce((sum, sale) => sum + Number(sale.valorTotal || 0), 0);
  el("#metricSales").textContent = String(sales.length);
  el("#metricUnits").textContent = new Intl.NumberFormat("pt-PT").format(units);
  el("#metricTotal").textContent = money(total);
}

function renderSales() {
  const sales = filteredSales();
  const all = allSales();
  tableBody.innerHTML = sales.map(sale => {
    const time = formatDateTime(sale.dataEHora);
    const items = (sale.itens || []).reduce((count, item) => count + Number(item.qtdVendida || 0), 0);
    return `<tr>
      <td><span class="sale-reference">#V-${String(sale.idVenda).padStart(4, "0")}</span></td>
      <td><span class="sale-date-cell"><strong>${escapeHTML(time.date)}</strong><small>${escapeHTML(time.time)}</small></span></td>
      <td>${items} ${items === 1 ? "unidade" : "unidades"} · ${(sale.itens || []).length} ${(sale.itens || []).length === 1 ? "produto" : "produtos"}</td>
      <td><span class="sale-payment">${escapeHTML(sale.formaDePagamento || "—")}</span></td>
      <td class="sale-total-cell">${escapeHTML(money(sale.valorTotal))}</td>
      <td><button class="detail-button" type="button" data-sale-detail="${escapeHTML(sale.idVenda)}">Detalhes</button></td>
    </tr>`;
  }).join("");

  el("#salesCount").textContent = `${all.length} ${all.length === 1 ? "venda registada" : "vendas registadas"}`;
  el("#visibleCount").textContent = `${sales.length} de ${all.length}`;
  emptyState.hidden = sales.length > 0;
  el("#emptyTitle").textContent = all.length ? "Nenhuma venda encontrada" : "Ainda não existem vendas";
  el("#emptyMessage").textContent = all.length
    ? "Altere a pesquisa ou o período para consultar outros registos."
    : "As vendas que concluir aparecerão aqui.";
  updateMetrics(sales);
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3500);
}

function openSaleDetails(id) {
  const sale = allSales().find(item => String(item.idVenda) === String(id));
  if (!sale) return showToast("Não foi possível encontrar os detalhes desta venda.", true);
  const reference = `Venda #V-${String(sale.idVenda).padStart(4, "0")}`;
  const time = formatDateTime(sale.dataEHora);
  el("#saleDialogTitle").textContent = reference;
  el("#saleDialogMeta").textContent = `${time.date} às ${time.time} · ${sale.formaDePagamento || "Pagamento não indicado"}`;
  el("#saleDialogTotal").textContent = money(sale.valorTotal);
  el("#saleDetailContent").innerHTML = sale.itens?.length
    ? `<div class="table-scroll"><table class="detail-table">
        <thead><tr><th>Produto</th><th>Quantidade</th><th>Preço/un.</th><th>Total</th></tr></thead>
        <tbody>${sale.itens.map(item => {
          const quantity = Number(item.qtdVendida) || 0;
          const price = Number(item.precoUnitario) || 0;
          return `<tr><td>${escapeHTML(item.nomeMedicamento || medicineName(item.idMedicamento))}</td><td>${quantity}</td><td>${escapeHTML(money(price))}</td><td>${escapeHTML(money(quantity * price))}</td></tr>`;
        }).join("")}</tbody>
      </table></div>`
    : '<div class="empty-state">Esta venda não tem detalhe de produtos.</div>';
  dialog.showModal();
}

function csvEscape(value) {
  const text = String(value ?? "");
  const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function exportCsv() {
  const sales = filteredSales();
  if (!sales.length) return showToast("Não existem vendas para exportar com os filtros atuais.", true);
  const rows = [["Referência", "Data e hora", "Farmacêutico", "Produtos", "Quantidade", "Forma de pagamento", "Total"]];
  for (const sale of sales) {
    rows.push([
      `V-${String(sale.idVenda).padStart(4, "0")}`,
      sale.dataEHora,
      sessionUser.nome,
      (sale.itens || []).map(item => item.nomeMedicamento || medicineName(item.idMedicamento)).join("; "),
      (sale.itens || []).reduce((total, item) => total + Number(item.qtdVendida || 0), 0),
      sale.formaDePagamento,
      sale.valorTotal
    ]);
  }
  const blobUrl = URL.createObjectURL(new Blob([`\uFEFF${rows.map(row => row.map(csvEscape).join(";")).join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `historico-vendas-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  showToast(`${sales.length} ${sales.length === 1 ? "venda exportada" : "vendas exportadas"}.`);
}

async function init() {
  try {
    const [session, bootstrap] = await Promise.all([FarmaApi.session(), FarmaApi.bootstrap()]);
    sessionUser = session.usuario;
    data = bootstrap;
    FarmaApi.setProfile(sessionUser);
    el("#pharmacistName").textContent = sessionUser.nome;
    el("#pharmacistAvatar").textContent = sessionUser.nome.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
    renderSales();
  } catch (error) {
    if (error.status !== 401) showToast(error.message || "Não foi possível carregar o histórico de vendas.", true);
  }
}

searchInput.addEventListener("input", renderSales);
periodFilter.addEventListener("change", renderSales);
tableBody.addEventListener("click", event => {
  const button = event.target.closest("[data-sale-detail]");
  if (button) openSaleDetails(button.dataset.saleDetail);
});
el("#exportButton").addEventListener("click", exportCsv);
el("#closeDialogButton").addEventListener("click", () => dialog.close());
el("#closeDetailButton").addEventListener("click", () => dialog.close());
init();
