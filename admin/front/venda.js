const LOW_STOCK_LIMIT = 30;
const el = selector => document.querySelector(selector);
const searchInput = el("#productSearch");
const categoryFilter = el("#productCategory");
const productList = el("#productList");
const cartItems = el("#cartItems");
const toast = el("#toast");
let data = { categorias: [], medicamentos: [], fornecedores: [], usuarios: [], lotes: [], vendas: [] };
let sessionUser = null;
let cart = [];
let toastTimeout;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function money(value) {
  return new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function daysUntil(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const expiry = Date.UTC(year, month - 1, day);
  const now = new Date();
  return Math.ceil((expiry - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function categoryName(id) {
  return data.categorias.find(item => Number(item.idCategoria) === Number(id))?.nomeDaCategoria || "Sem categoria";
}

function availableQuantity(medicineId) {
  return data.lotes
    .filter(lot => Number(lot.idMedicamento) === Number(medicineId) && Number(lot.qtdAtual) > 0 && daysUntil(lot.dataDeValidade) > 0)
    .reduce((total, lot) => total + Number(lot.qtdAtual), 0);
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3800);
}

function renderCategories() {
  const selected = categoryFilter.value || "all";
  categoryFilter.innerHTML = `<option value="all">Todas as categorias</option>${[...data.categorias]
    .sort((a, b) => a.nomeDaCategoria.localeCompare(b.nomeDaCategoria, "pt"))
    .map(item => `<option value="${escapeHTML(item.idCategoria)}">${escapeHTML(item.nomeDaCategoria)}</option>`)
    .join("")}`;
  if ([...categoryFilter.options].some(option => option.value === selected)) categoryFilter.value = selected;
}

function renderProducts() {
  const query = searchInput.value.trim().toLocaleLowerCase("pt");
  const categoryId = categoryFilter.value || "all";
  const products = data.medicamentos.filter(medicine =>
    `${medicine.nome} ${categoryName(medicine.idCategoria)}`.toLocaleLowerCase("pt").includes(query) &&
    (categoryId === "all" || Number(medicine.idCategoria) === Number(categoryId))
  ).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

  el("#productsCount").textContent = `${products.length} ${products.length === 1 ? "produto" : "produtos"}`;
  if (!products.length) {
    productList.innerHTML = '<div class="catalog-empty">Não foram encontrados medicamentos para esta pesquisa.</div>';
    return;
  }
  productList.innerHTML = products.map(medicine => {
    const stock = availableQuantity(medicine.idMedicamento);
    const inCart = cart.find(item => Number(item.idMedicamento) === Number(medicine.idMedicamento))?.quantity || 0;
    const remaining = Math.max(0, stock - inCart);
    const status = stock === 0 ? "empty" : stock <= LOW_STOCK_LIMIT ? "low" : "";
    return `<article class="product-card">
      <div class="product-info"><span class="product-icon" aria-hidden="true">◈</span>
        <div class="product-copy"><strong>${escapeHTML(medicine.nome)}</strong><small>${escapeHTML(categoryName(medicine.idCategoria))}</small>
          <div class="product-price">${escapeHTML(money(medicine.precoDeVenda))}</div>
          <div class="product-stock"><i class="stock-dot ${status}" aria-hidden="true"></i>${remaining} ${remaining === 1 ? "unidade" : "unidades"} disponível${remaining === 1 ? "" : "is"}${inCart ? ` · ${inCart} no carrinho` : ""}</div>
        </div>
      </div>
      <button class="add-to-cart" type="button" data-add-product="${escapeHTML(medicine.idMedicamento)}" aria-label="Adicionar ${escapeHTML(medicine.nome)} à venda" ${remaining <= 0 ? "disabled" : ""}>＋</button>
    </article>`;
  }).join("");
}

function renderCart() {
  const totalUnits = cart.reduce((total, item) => total + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.quantity * item.precoUnitario, 0);
  el("#cartItemCount").textContent = totalUnits
    ? `${totalUnits} ${totalUnits === 1 ? "unidade" : "unidades"} · ${cart.length} ${cart.length === 1 ? "produto" : "produtos"}`
    : "Nenhum produto";
  el("#saleTotal").textContent = money(total);
  el("#checkoutButton").disabled = cart.length === 0;
  el("#clearCartButton").disabled = cart.length === 0;

  if (!cart.length) {
    cartItems.innerHTML = '<div class="cart-empty"><span class="empty-cart-icon" aria-hidden="true">＋</span><strong>A venda está vazia</strong><p>Selecione um medicamento para começar.</p></div>';
    return;
  }
  cartItems.innerHTML = cart.map(item => `<div class="cart-item">
    <div class="cart-item-copy"><strong>${escapeHTML(item.nome)}</strong><small>${escapeHTML(money(item.precoUnitario))} por unidade · ${availableQuantity(item.idMedicamento)} em stock</small><div class="cart-item-total">${escapeHTML(money(item.precoUnitario * item.quantity))}</div></div>
    <div class="quantity-control">
      <button type="button" data-quantity="${escapeHTML(item.idMedicamento)}" data-delta="-1" aria-label="Diminuir quantidade de ${escapeHTML(item.nome)}">−</button>
      <strong>${item.quantity}</strong>
      <button type="button" data-quantity="${escapeHTML(item.idMedicamento)}" data-delta="1" aria-label="Aumentar quantidade de ${escapeHTML(item.nome)}" ${item.quantity >= availableQuantity(item.idMedicamento) ? "disabled" : ""}>+</button>
    </div>
  </div>`).join("");
}

function renderRecentSales() {
  const sales = data.vendas
    .filter(sale => Number(sale.idUsuarios) === Number(sessionUser.idUsuarios))
    .sort((a, b) => new Date(b.dataEHora) - new Date(a.dataEHora))
    .slice(0, 4);
  if (!sales.length) {
    el("#recentSales").innerHTML = '<div class="recent-empty">Ainda não foram registadas vendas por este farmacêutico.</div>';
    return;
  }
  el("#recentSales").innerHTML = sales.map(sale => {
    const count = (sale.itens || []).reduce((total, item) => total + Number(item.qtdVendida || 0), 0);
    return `<article class="recent-sale">
      <div class="recent-sale-main"><strong>Venda #V-${String(sale.idVenda).padStart(4, "0")}</strong><small>${escapeHTML(formatTime(sale.dataEHora))} · ${escapeHTML(sale.formaDePagamento)}</small></div>
      <span class="recent-sale-items">${count} ${count === 1 ? "unidade" : "unidades"}</span>
      <strong class="recent-sale-total">${escapeHTML(money(sale.valorTotal))}</strong>
    </article>`;
  }).join("");
}

function render() {
  renderCategories();
  renderProducts();
  renderCart();
  renderRecentSales();
}

function addToCart(id) {
  const medicine = data.medicamentos.find(item => Number(item.idMedicamento) === Number(id));
  if (!medicine) return;
  const available = availableQuantity(id);
  const existing = cart.find(item => Number(item.idMedicamento) === Number(id));
  if (available === 0) return showToast("Este medicamento não tem stock válido disponível.", true);
  if (existing) {
    if (existing.quantity >= available) return showToast("A quantidade no carrinho já corresponde ao stock disponível.", true);
    existing.quantity += 1;
  } else {
    cart.push({ idMedicamento: Number(medicine.idMedicamento), nome: medicine.nome, precoUnitario: Number(medicine.precoDeVenda), quantity: 1 });
  }
  renderProducts();
  renderCart();
}

function updateQuantity(id, delta) {
  const item = cart.find(entry => Number(entry.idMedicamento) === Number(id));
  if (!item) return;
  const quantity = item.quantity + delta;
  if (quantity <= 0) cart = cart.filter(entry => Number(entry.idMedicamento) !== Number(id));
  else if (quantity > availableQuantity(id)) return showToast("Quantidade superior ao stock válido disponível.", true);
  else item.quantity = quantity;
  renderProducts();
  renderCart();
}

async function completeSale() {
  if (!cart.length) return;
  const checkout = el("#checkoutButton");
  checkout.disabled = true;
  try {
    const sale = await FarmaApi.post("/vendas", {
      formaDePagamento: el("#paymentMethod").value,
      itens: cart.map(item => ({ idMedicamento: item.idMedicamento, qtdVendida: item.quantity }))
    });
    cart = [];
    try {
      data = await FarmaApi.bootstrap();
      render();
    } catch (reloadError) {
      console.error("Venda registada, mas não foi possível atualizar a vista local.", reloadError);
      renderCart();
    }
    showToast(`Venda #V-${String(sale.idVenda).padStart(4, "0")} registada. Total: ${money(sale.valorTotal)}.`);
  } catch (error) {
    showToast(error.message || "Não foi possível registar a venda.", true);
    checkout.disabled = false;
  }
}

productList.addEventListener("click", event => {
  const button = event.target.closest("[data-add-product]");
  if (button && !button.disabled) addToCart(button.dataset.addProduct);
});
cartItems.addEventListener("click", event => {
  const button = event.target.closest("[data-quantity]");
  if (button) updateQuantity(button.dataset.quantity, Number(button.dataset.delta));
});
searchInput.addEventListener("input", renderProducts);
categoryFilter.addEventListener("change", renderProducts);
el("#checkoutButton").addEventListener("click", completeSale);
el("#clearCartButton").addEventListener("click", () => {
  cart = [];
  renderProducts();
  renderCart();
});

async function init() {
  try {
    const [session, bootstrap] = await Promise.all([FarmaApi.session(), FarmaApi.bootstrap()]);
    sessionUser = session.usuario;
    if (sessionUser.perfil !== "Farmacêutico" && sessionUser.perfil !== "Administrador") {
      showToast("O perfil não tem permissão para registar vendas.", true);
      return;
    }
    data = bootstrap;
    FarmaApi.setProfile(sessionUser);
    el("#currentDate").textContent = new Intl.DateTimeFormat("pt-PT", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).format(new Date());
    render();
  } catch (error) {
    if (error.status !== 401) showToast(error.message || "Não foi possível carregar o ponto de venda.", true);
  }
}

init();
