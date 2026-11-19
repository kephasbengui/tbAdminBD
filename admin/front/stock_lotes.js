const LOW_STOCK_LIMIT = 30;
const EXPIRY_WARNING_DAYS = 90;
const el = selector => document.querySelector(selector);
const tableBody = el("#productsTableBody");
const searchInput = el("#inventorySearch");
const categoryFilter = el("#categoryFilter");
const stockFilter = el("#stockFilter");
const toast = el("#toast");
const expandedProducts = new Set();
let data = { categorias: [], medicamentos: [], fornecedores: [], usuarios: [], lotes: [], vendas: [] };
let editingMedicineId = null;
let editingLotId = null;
let editingCategoryId = null;
let toastTimeout;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function money(value) {
  return new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function dateOnly(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(Date.UTC(year, month - 1, day)) : null;
}

function daysUntil(value) {
  const date = dateOnly(value);
  if (!date) return null;
  const now = new Date();
  return Math.ceil((date.getTime() - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

function formatDate(value) {
  const date = dateOnly(value);
  return date ? new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date) : "—";
}

function categoryName(id) {
  return data.categorias.find(item => Number(item.idCategoria) === Number(id))?.nomeDaCategoria || "Sem categoria";
}

function supplierName(id) {
  return data.fornecedores.find(item => Number(item.idFornecedor) === Number(id))?.nomeDaEmpresa || "Fornecedor removido";
}

function lotsFor(medicineId) {
  return data.lotes.filter(lot => Number(lot.idMedicamento) === Number(medicineId));
}

function validStock(lots) {
  return lots.filter(lot => daysUntil(lot.dataDeValidade) > 0)
    .reduce((sum, lot) => sum + Math.max(0, Number(lot.qtdAtual) || 0), 0);
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3800);
}

function renderCategoryOptions() {
  const selected = categoryFilter.value || "all";
  const categories = [...data.categorias].sort((a, b) => a.nomeDaCategoria.localeCompare(b.nomeDaCategoria, "pt"));
  categoryFilter.innerHTML = `<option value="all">Todas as categorias</option>${categories.map(item =>
    `<option value="${escapeHTML(item.idCategoria)}">${escapeHTML(item.nomeDaCategoria)}</option>`
  ).join("")}`;
  if ([...categoryFilter.options].some(option => option.value === selected)) categoryFilter.value = selected;

  el("#medicineCategory").innerHTML = categories.map(item =>
    `<option value="${escapeHTML(item.idCategoria)}">${escapeHTML(item.nomeDaCategoria)}</option>`
  ).join("");
  el("#lotMedicine").innerHTML = data.medicamentos.map(item =>
    `<option value="${escapeHTML(item.idMedicamento)}">${escapeHTML(item.nome)}</option>`
  ).join("");
  el("#lotSupplier").innerHTML = [...data.fornecedores]
    .sort((a, b) => a.nomeDaEmpresa.localeCompare(b.nomeDaEmpresa, "pt"))
    .map(item => `<option value="${escapeHTML(item.idFornecedor)}">${escapeHTML(item.nomeDaEmpresa)}${item.status === "INATIVO" ? " (inativo)" : ""}</option>`)
    .join("");
}

function lotStatus(lot) {
  const quantity = Number(lot.qtdAtual) || 0;
  const remaining = daysUntil(lot.dataDeValidade);
  if (!quantity) return { text: "Esgotado", className: "empty" };
  if (remaining === null || remaining <= 0) return { text: "Vencido", className: "expired" };
  if (remaining <= EXPIRY_WARNING_DAYS) return { text: `Vence em ${remaining} d`, className: "soon" };
  return { text: "Disponível", className: "available" };
}

function renderLotDetails(medicine, lots) {
  if (!lots.length) return '<div class="no-lots">Ainda não há lotes para este medicamento. Registe um lote para atualizar o stock.</div>';
  const ordered = [...lots].sort((a, b) =>
    String(a.dataDeValidade).localeCompare(String(b.dataDeValidade)) || Number(a.idLoteEmEstoque) - Number(b.idLoteEmEstoque)
  );
  return `<div class="lot-details">
    <div class="lot-details-heading"><strong>Lotes de ${escapeHTML(medicine.nome)}</strong><small>${lots.length} ${lots.length === 1 ? "lote registado" : "lotes registados"}</small></div>
    <div class="table-scroll"><table class="lot-table">
      <thead><tr><th>Lote</th><th>Fornecedor</th><th>Entregue</th><th>Validade</th><th>Quantidade</th><th>Custo total</th><th>Estado</th><th>Ações</th></tr></thead>
      <tbody>${ordered.map(lot => {
        const status = lotStatus(lot);
        return `<tr>
          <td><strong>${escapeHTML(lot.numeroDoLote)}</strong></td><td>${escapeHTML(supplierName(lot.idFornecedor))}</td>
          <td>${escapeHTML(formatDate(lot.dataDeEntrega))}</td><td>${escapeHTML(formatDate(lot.dataDeValidade))}</td>
          <td>${escapeHTML(lot.qtdAtual)} / ${escapeHTML(lot.qtdInicial)}</td><td>${escapeHTML(money(lot.custoTotal))}</td>
          <td><span class="lot-status ${status.className}">${escapeHTML(status.text)}</span></td>
          <td><div class="row-actions"><button class="row-action" type="button" data-edit-lot="${escapeHTML(lot.idLoteEmEstoque)}">Editar</button><button class="row-action delete" type="button" data-delete-lot="${escapeHTML(lot.idLoteEmEstoque)}">Eliminar</button></div></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>
  </div>`;
}

function updateMetrics() {
  const totalUnits = data.medicamentos.reduce((sum, item) => sum + validStock(lotsFor(item.idMedicamento)), 0);
  const lowStock = data.medicamentos.filter(item => {
    const stock = validStock(lotsFor(item.idMedicamento));
    return stock > 0 && stock <= LOW_STOCK_LIMIT;
  }).length;
  const expiring = data.lotes.filter(lot => {
    const days = daysUntil(lot.dataDeValidade);
    return Number(lot.qtdAtual) > 0 && days !== null && days <= EXPIRY_WARNING_DAYS;
  }).length;
  el("#metricProducts").textContent = String(data.medicamentos.length);
  el("#metricUnits").textContent = new Intl.NumberFormat("pt-PT").format(totalUnits);
  el("#metricLowStock").textContent = String(lowStock);
  el("#metricExpiring").textContent = String(expiring);
}

function renderProducts() {
  const query = searchInput.value.trim().toLocaleLowerCase("pt");
  const categoryId = categoryFilter.value;
  const filter = stockFilter.value;
  const medicines = data.medicamentos.filter(medicine => {
    const lots = lotsFor(medicine.idMedicamento);
    const text = `${medicine.nome} ${categoryName(medicine.idCategoria)} ${lots.map(lot => `${lot.numeroDoLote} ${supplierName(lot.idFornecedor)}`).join(" ")}`.toLocaleLowerCase("pt");
    const quantity = validStock(lots);
    if (!text.includes(query)) return false;
    if (categoryId !== "all" && Number(medicine.idCategoria) !== Number(categoryId)) return false;
    if (filter === "low" && !(quantity > 0 && quantity <= LOW_STOCK_LIMIT)) return false;
    if (filter === "empty" && quantity !== 0) return false;
    if (filter === "expiry" && !lots.some(lot => {
      const days = daysUntil(lot.dataDeValidade);
      return Number(lot.qtdAtual) > 0 && days !== null && days <= EXPIRY_WARNING_DAYS;
    })) return false;
    return true;
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

  tableBody.innerHTML = medicines.map(medicine => {
    const lots = lotsFor(medicine.idMedicamento);
    const quantity = validStock(lots);
    const status = quantity === 0 ? ["Sem stock", "empty"] : quantity <= LOW_STOCK_LIMIT ? ["Stock baixo", "low"] : ["Disponível", "ok"];
    const expanded = expandedProducts.has(String(medicine.idMedicamento));
    const expiring = lots.some(lot => {
      const days = daysUntil(lot.dataDeValidade);
      return Number(lot.qtdAtual) > 0 && days !== null && days > 0 && days <= EXPIRY_WARNING_DAYS;
    });
    const expiries = lots.filter(lot => Number(lot.qtdAtual) > 0 && daysUntil(lot.dataDeValidade) > 0)
      .map(lot => String(lot.dataDeValidade).slice(0, 10)).sort();
    return `<tr class="product-row">
      <td><div class="user-identity"><span class="user-avatar" aria-hidden="true">◈</span><span class="medicine-name"><strong>${escapeHTML(medicine.nome)}</strong><small>${lots.length} ${lots.length === 1 ? "lote" : "lotes"} registados</small></span></div></td>
      <td>${escapeHTML(categoryName(medicine.idCategoria))}</td><td>${escapeHTML(money(medicine.precoDeVenda))}</td>
      <td><span class="stock-quantity">${new Intl.NumberFormat("pt-PT").format(quantity)}<small><span class="stock-tag ${status[1]}">${status[0]}</span>${expiring ? ' <span class="stock-tag expiring">Validade próxima</span>' : ""}</small></span></td>
      <td>${lots.length}</td><td>${escapeHTML(formatDate(expiries[0]))}</td>
      <td><div class="row-actions">
        <button class="row-action expand" type="button" data-toggle-product="${escapeHTML(medicine.idMedicamento)}" aria-expanded="${expanded}">${expanded ? "Ocultar lotes" : "Ver lotes"}</button>
        <button class="row-action" type="button" data-add-product-lot="${escapeHTML(medicine.idMedicamento)}">＋ Lote</button>
        <button class="row-action" type="button" data-edit-medicine="${escapeHTML(medicine.idMedicamento)}">Editar</button>
        <button class="row-action delete" type="button" data-delete-medicine="${escapeHTML(medicine.idMedicamento)}">Eliminar</button>
      </div></td>
    </tr>${expanded ? `<tr class="lot-details-row"><td colspan="7">${renderLotDetails(medicine, lots)}</td></tr>` : ""}`;
  }).join("");

  el("#productCount").textContent = `${data.medicamentos.length} ${data.medicamentos.length === 1 ? "medicamento no catálogo" : "medicamentos no catálogo"}`;
  el("#visibleCount").textContent = `${medicines.length} de ${data.medicamentos.length}`;
  el("#emptyState").hidden = medicines.length > 0;
  el("#emptyTitle").textContent = data.medicamentos.length ? "Nenhum resultado encontrado" : "Ainda não existem medicamentos";
  el("#emptyMessage").textContent = data.medicamentos.length
    ? "Experimente alterar a pesquisa ou os filtros selecionados."
    : "Adicione um medicamento ao catálogo para começar a controlar o stock.";
  updateMetrics();
  renderCategoryOptions();
}

async function reloadData() {
  data = await FarmaApi.bootstrap();
  renderProducts();
}

function openMedicineDialog(medicine = null) {
  editingMedicineId = medicine?.idMedicamento ?? null;
  el("#medicineForm").reset();
  el("#medicineError").hidden = true;
  el("#medicineDialogTitle").textContent = medicine ? "Editar medicamento" : "Novo medicamento";
  if (medicine) {
    el("#medicineForm").elements.nome.value = medicine.nome;
    el("#medicineForm").elements.idCategoria.value = String(medicine.idCategoria);
    el("#medicineForm").elements.precoDeVenda.value = medicine.precoDeVenda;
  }
  el("#medicineDialog").showModal();
  el("#medicineForm").elements.nome.focus();
}

function openLotDialog(lot = null, medicineId = null) {
  if (!data.medicamentos.length) return showToast("Adicione primeiro um medicamento ao catálogo.", true);
  if (!data.fornecedores.length) return showToast("Cadastre primeiro um fornecedor para associar ao lote.", true);
  editingLotId = lot?.idLoteEmEstoque ?? null;
  el("#lotForm").reset();
  el("#lotError").hidden = true;
  el("#lotDialogTitle").textContent = lot ? "Editar lote" : "Registar lote";
  if (lot) {
    for (const key of ["idMedicamento", "numeroDoLote", "idFornecedor", "qtdInicial", "qtdAtual", "custoTotal", "dataDeEntrega", "dataDeValidade"]) {
      el("#lotForm").elements[key].value = String(lot[key]);
    }
  } else {
    if (medicineId !== null) el("#lotForm").elements.idMedicamento.value = String(medicineId);
    el("#lotForm").elements.dataDeEntrega.value = new Date().toISOString().slice(0, 10);
    el("#lotForm").elements.qtdAtual.value = "";
  }
  el("#lotDialog").showModal();
  el("#lotForm").elements.numeroDoLote.focus();
}

function closeDialog(dialogId) {
  el(`#${dialogId}`).close();
  if (dialogId === "medicineDialog") editingMedicineId = null;
  if (dialogId === "lotDialog") editingLotId = null;
}

function renderCategories() {
  el("#categoryList").innerHTML = [...data.categorias].sort((a, b) => a.nomeDaCategoria.localeCompare(b.nomeDaCategoria, "pt")).map(category => {
    const count = data.medicamentos.filter(medicine => Number(medicine.idCategoria) === Number(category.idCategoria)).length;
    return `<div class="category-item">
      <div class="category-info"><strong>${escapeHTML(category.nomeDaCategoria)}</strong><small>${count} ${count === 1 ? "medicamento associado" : "medicamentos associados"}${category.descricao ? ` · ${escapeHTML(category.descricao)}` : ""}</small></div>
      <div class="category-actions"><button class="row-action" type="button" data-edit-category="${escapeHTML(category.idCategoria)}">Editar</button><button class="row-action delete" type="button" data-delete-category="${escapeHTML(category.idCategoria)}">Eliminar</button></div>
    </div>`;
  }).join("");
  if (!data.categorias.length) el("#categoryList").innerHTML = '<div class="no-lots">Ainda não existem categorias.</div>';
}

function editCategory(id) {
  const category = data.categorias.find(item => Number(item.idCategoria) === Number(id));
  if (!category) return;
  editingCategoryId = category.idCategoria;
  el("#categoryForm").elements.nomeDaCategoria.value = category.nomeDaCategoria;
  el("#categoryForm").elements.descricao.value = category.descricao || "";
  el("#categoryError").hidden = true;
  el("#saveCategoryButton").textContent = "Guardar alterações";
  el("#categoryForm").elements.nomeDaCategoria.focus();
}

function resetCategoryForm() {
  editingCategoryId = null;
  el("#categoryForm").reset();
  el("#categoryError").hidden = true;
  el("#saveCategoryButton").innerHTML = '<span aria-hidden="true">＋</span> Guardar categoria';
}

el("#medicineForm").addEventListener("submit", async event => {
  event.preventDefault();
  const error = el("#medicineError");
  error.hidden = true;
  const values = {
    nome: el("#medicineForm").elements.nome.value.trim(),
    idCategoria: Number(el("#medicineForm").elements.idCategoria.value),
    precoDeVenda: Number(el("#medicineForm").elements.precoDeVenda.value)
  };
  if (!values.nome || !values.idCategoria || !Number.isFinite(values.precoDeVenda) || values.precoDeVenda < 0) {
    error.textContent = "Indique um nome, uma categoria e um preço igual ou superior a zero.";
    error.hidden = false;
    return;
  }
  try {
    if (editingMedicineId) await FarmaApi.put(`/medicamentos/${editingMedicineId}`, values);
    else await FarmaApi.post("/medicamentos", values);
    const wasEditing = Boolean(editingMedicineId);
    closeDialog("medicineDialog");
    await reloadData();
    showToast(wasEditing ? "Medicamento atualizado." : "Medicamento criado.");
  } catch (requestError) {
    error.textContent = requestError.message;
    error.hidden = false;
  }
});

el("#lotForm").addEventListener("submit", async event => {
  event.preventDefault();
  const error = el("#lotError");
  error.hidden = true;
  const form = el("#lotForm");
  const values = {
    numeroDoLote: form.elements.numeroDoLote.value.trim(),
    qtdInicial: Number(form.elements.qtdInicial.value),
    qtdAtual: Number(form.elements.qtdAtual.value),
    custoTotal: Number(form.elements.custoTotal.value),
    dataDeEntrega: form.elements.dataDeEntrega.value,
    dataDeValidade: form.elements.dataDeValidade.value,
    idFornecedor: Number(form.elements.idFornecedor.value),
    idMedicamento: Number(form.elements.idMedicamento.value)
  };
  if (!values.numeroDoLote || !Number.isInteger(values.qtdInicial) || values.qtdInicial < 1 ||
      !Number.isInteger(values.qtdAtual) || values.qtdAtual < 0 || values.qtdAtual > values.qtdInicial ||
      !Number.isFinite(values.custoTotal) || values.custoTotal < 0 || values.dataDeValidade <= values.dataDeEntrega) {
    error.textContent = "Verifique as quantidades, o custo e as datas. A validade deve ser posterior à entrega.";
    error.hidden = false;
    return;
  }
  try {
    if (editingLotId) await FarmaApi.put(`/lotes/${editingLotId}`, values);
    else await FarmaApi.post("/lotes", values);
    const wasEditing = Boolean(editingLotId);
    const medicineId = String(values.idMedicamento);
    closeDialog("lotDialog");
    expandedProducts.add(medicineId);
    await reloadData();
    showToast(wasEditing ? "Lote atualizado." : "Lote registado.");
  } catch (requestError) {
    error.textContent = requestError.message;
    error.hidden = false;
  }
});

el("#categoryForm").addEventListener("submit", async event => {
  event.preventDefault();
  const error = el("#categoryError");
  const form = el("#categoryForm");
  error.hidden = true;
  const values = {
    nomeDaCategoria: form.elements.nomeDaCategoria.value.trim(),
    descricao: form.elements.descricao.value.trim() || null
  };
  if (!values.nomeDaCategoria) {
    error.textContent = "Indique o nome da categoria.";
    error.hidden = false;
    return;
  }
  try {
    if (editingCategoryId) await FarmaApi.put(`/categorias/${editingCategoryId}`, values);
    else await FarmaApi.post("/categorias", values);
    const wasEditing = Boolean(editingCategoryId);
    resetCategoryForm();
    await reloadData();
    renderCategories();
    showToast(wasEditing ? "Categoria atualizada." : "Categoria criada.");
  } catch (requestError) {
    error.textContent = requestError.message;
    error.hidden = false;
  }
});

function deleteWithConfirm(label, request, onSuccess) {
  if (!window.confirm(label)) return;
  request().then(async () => {
    await reloadData();
    if (onSuccess) onSuccess();
    showToast("Registo eliminado.");
  }).catch(error => showToast(error.message || "Não foi possível eliminar o registo.", true));
}

document.addEventListener("click", event => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) closeDialog(closeButton.dataset.closeDialog);
});

el("#addMedicineButton").addEventListener("click", () => {
  if (!data.categorias.length) {
    showToast("Crie primeiro uma categoria para associar ao medicamento.", true);
    renderCategories();
    el("#categoryDialog").showModal();
    return;
  }
  renderCategoryOptions();
  openMedicineDialog();
});
el("#addLotButton").addEventListener("click", () => {
  renderCategoryOptions();
  openLotDialog();
});
el("#manageCategoriesButton").addEventListener("click", () => {
  resetCategoryForm();
  renderCategories();
  el("#categoryDialog").showModal();
});
el("#categoryDialog").addEventListener("close", resetCategoryForm);
searchInput.addEventListener("input", renderProducts);
categoryFilter.addEventListener("change", renderProducts);
stockFilter.addEventListener("change", renderProducts);
el("#lotInitialQuantity").addEventListener("input", event => {
  if (!editingLotId && !el("#lotCurrentQuantity").value) el("#lotCurrentQuantity").value = event.target.value;
});

tableBody.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.toggleProduct) {
    const id = String(button.dataset.toggleProduct);
    expandedProducts.has(id) ? expandedProducts.delete(id) : expandedProducts.add(id);
    renderProducts();
  } else if (button.dataset.addProductLot) {
    renderCategoryOptions();
    openLotDialog(null, button.dataset.addProductLot);
  } else if (button.dataset.editMedicine) {
    const medicine = data.medicamentos.find(item => Number(item.idMedicamento) === Number(button.dataset.editMedicine));
    if (medicine) openMedicineDialog(medicine);
  } else if (button.dataset.deleteMedicine) {
    const medicine = data.medicamentos.find(item => Number(item.idMedicamento) === Number(button.dataset.deleteMedicine));
    if (medicine) deleteWithConfirm(`Eliminar ${medicine.nome} do catálogo?`, () => FarmaApi.delete(`/medicamentos/${medicine.idMedicamento}`));
  } else if (button.dataset.editLot) {
    const lot = data.lotes.find(item => Number(item.idLoteEmEstoque) === Number(button.dataset.editLot));
    if (lot) {
      renderCategoryOptions();
      openLotDialog(lot);
    }
  } else if (button.dataset.deleteLot) {
    const lot = data.lotes.find(item => Number(item.idLoteEmEstoque) === Number(button.dataset.deleteLot));
    if (lot) deleteWithConfirm(`Eliminar o lote ${lot.numeroDoLote}?`, () => FarmaApi.delete(`/lotes/${lot.idLoteEmEstoque}`));
  }
});

el("#categoryList").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-category]");
  const deleteButton = event.target.closest("[data-delete-category]");
  if (editButton) editCategory(editButton.dataset.editCategory);
  if (deleteButton) {
    const category = data.categorias.find(item => Number(item.idCategoria) === Number(deleteButton.dataset.deleteCategory));
    if (category) deleteWithConfirm(`Eliminar a categoria ${category.nomeDaCategoria}?`, () => FarmaApi.delete(`/categorias/${category.idCategoria}`), renderCategories);
  }
});

async function init() {
  try {
    const session = await FarmaApi.session();
    FarmaApi.setProfile(session.usuario);
    if (session.usuario.perfil !== "Administrador") {
      showToast("Esta página é exclusiva para administradores.", true);
      window.setTimeout(() => window.location.replace("venda.html"), 1200);
      return;
    }
    data = await FarmaApi.bootstrap();
    renderProducts();
  } catch (error) {
    if (error.status !== 401) showToast(error.message || "Não foi possível carregar o inventário.", true);
  }
}

init();
