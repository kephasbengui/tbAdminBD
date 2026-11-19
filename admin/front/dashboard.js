const formatMoney = value => new Intl.NumberFormat("pt-AO", {
  style: "currency",
  currency: "AOA",
  maximumFractionDigits: 2
}).format(Number(value) || 0);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function localDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderDashboard(data, user) {
  const todayKey = localDateKey(new Date());
  const todaysSales = data.vendas.filter(sale => localDateKey(sale.dataEHora) === todayKey);
  const revenue = todaysSales.reduce((sum, sale) => sum + Number(sale.valorTotal || 0), 0);
  const stock = data.medicamentos.map(medicine => ({
    ...medicine,
    available: Number(medicine.estoqueTotalDisponivel) || 0
  }));
  const lowStock = stock.filter(medicine => medicine.available <= 30);

  document.querySelector("#todayRevenue").textContent = formatMoney(revenue);
  document.querySelector("#todaySales").textContent = new Intl.NumberFormat("pt-PT").format(todaysSales.length);
  document.querySelector("#stockProducts").textContent = new Intl.NumberFormat("pt-PT").format(
    stock.filter(medicine => medicine.available > 0).length
  );
  document.querySelector("#lowStockProducts").textContent = new Intl.NumberFormat("pt-PT").format(lowStock.length);
  FarmaApi.setProfile(user);
  document.querySelector("#welcome-title").textContent = `Bem-vindo, ${user.nome}`;

  const recent = [...data.vendas].sort((a, b) => new Date(b.dataEHora) - new Date(a.dataEHora)).slice(0, 5);
  const recentEmpty = document.querySelector("#recentSalesEmpty");
  const recentContainer = document.querySelector("#recentSales");
  recentEmpty.hidden = recent.length > 0;
  recentContainer.innerHTML = recent.map(sale => {
    const date = new Date(sale.dataEHora);
    const dateText = Number.isNaN(date.getTime())
      ? "Data indisponível"
      : new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
    const units = (sale.itens || []).reduce((total, item) => total + Number(item.qtdVendida || 0), 0);
    return `<article class="dashboard-sale">
      <div><strong>Venda #V-${String(sale.idVenda).padStart(4, "0")}</strong><small>${escapeHTML(dateText)} · ${units} ${units === 1 ? "unidade" : "unidades"}</small></div>
      <strong>${escapeHTML(formatMoney(sale.valorTotal))}</strong>
    </article>`;
  }).join("");

  const alerts = lowStock.slice(0, 5);
  const stockEmpty = document.querySelector("#stockAlertsEmpty");
  const stockContainer = document.querySelector("#stockAlerts");
  stockEmpty.hidden = alerts.length > 0;
  stockContainer.innerHTML = alerts.map(medicine => `<article class="dashboard-stock-item">
    <span><strong>${escapeHTML(medicine.nome)}</strong><small>${medicine.available === 0 ? "Sem stock disponível" : `${medicine.available} unidades disponíveis`}</small></span>
    <span class="dashboard-stock-count">${medicine.available}</span>
  </article>`).join("");
}

async function loadDashboard() {
  const errorOutput = document.querySelector("#dashboardError");
  try {
    const [{ usuario }, data] = await Promise.all([FarmaApi.session(), FarmaApi.bootstrap()]);
    if (usuario.perfil !== "Administrador") {
      window.location.replace("venda.html");
      return;
    }
    renderDashboard(data, usuario);
  } catch (error) {
    if (error.status !== 401) {
      errorOutput.textContent = error.message || "Não foi possível carregar os dados do painel.";
      errorOutput.hidden = false;
    }
  }
}

loadDashboard();
