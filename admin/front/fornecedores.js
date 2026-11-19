const tableBody = document.querySelector("#suppliersTableBody");
const supplierCount = document.querySelector("#supplierCount");
const visibleCount = document.querySelector("#visibleCount");
const searchInput = document.querySelector("#supplierSearch");
const emptyState = document.querySelector("#emptyState");
const emptyTitle = document.querySelector("#emptyTitle");
const emptyMessage = document.querySelector("#emptyMessage");
const dialog = document.querySelector("#supplierDialog");
const form = document.querySelector("#supplierForm");
const formError = document.querySelector("#formError");
const toast = document.querySelector("#toast");
let suppliers = [];
let editingId = null;
let toastTimeout;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
}

function renderSuppliers() {
  const query = searchInput.value.trim().toLocaleLowerCase("pt");
  const filtered = suppliers.filter(supplier =>
    `${supplier.nomeDaEmpresa} ${supplier.nif} ${supplier.telefone} ${supplier.email} ${supplier.status}`
      .toLocaleLowerCase("pt")
      .includes(query)
  );

  tableBody.innerHTML = filtered.map(supplier => {
    const active = supplier.status === "ATIVO";
    return `<tr>
      <td><div class="supplier-identity"><span class="supplier-avatar" aria-hidden="true">${escapeHTML(initials(supplier.nomeDaEmpresa))}</span><strong>${escapeHTML(supplier.nomeDaEmpresa)}</strong></div></td>
      <td>${escapeHTML(supplier.nif)}</td>
      <td>${escapeHTML(supplier.telefone || "—")}</td>
      <td>${escapeHTML(supplier.email || "—")}</td>
      <td><span class="state-tag ${active ? "active" : "inactive"}">${active ? "Ativo" : "Inativo"}</span></td>
      <td><div class="row-actions">
        <button class="row-action" type="button" data-edit-supplier="${escapeHTML(supplier.idFornecedor)}" aria-label="Editar ${escapeHTML(supplier.nomeDaEmpresa)}">Editar</button>
        <button class="row-action delete" type="button" data-delete-supplier="${escapeHTML(supplier.idFornecedor)}" aria-label="Eliminar ${escapeHTML(supplier.nomeDaEmpresa)}">Eliminar</button>
      </div></td>
    </tr>`;
  }).join("");

  supplierCount.textContent = `${suppliers.length} ${suppliers.length === 1 ? "fornecedor registado" : "fornecedores registados"}`;
  visibleCount.textContent = `${filtered.length} de ${suppliers.length}`;
  emptyState.hidden = filtered.length > 0;
  emptyTitle.textContent = suppliers.length ? "Nenhum resultado encontrado" : "Ainda não existem fornecedores";
  emptyMessage.textContent = suppliers.length
    ? "Experimente pesquisar por outra empresa, NIF ou email."
    : "Adicione um fornecedor para gerir os parceiros da farmácia.";
}

function openDialog(supplier = null) {
  editingId = supplier?.idFornecedor ?? null;
  form.reset();
  formError.hidden = true;
  document.querySelector("#dialogTitle").textContent = supplier ? "Editar fornecedor" : "Novo fornecedor";
  document.querySelector("#saveSupplierButton").textContent = supplier ? "Guardar alterações" : "Guardar fornecedor";

  if (supplier) {
    form.elements.nomeDaEmpresa.value = supplier.nomeDaEmpresa;
    form.elements.nif.value = supplier.nif;
    form.elements.telefone.value = supplier.telefone || "";
    form.elements.email.value = supplier.email || "";
    form.elements.status.value = supplier.status;
  }
  dialog.showModal();
  form.elements.nomeDaEmpresa.focus();
}

function closeDialog() {
  dialog.close();
  editingId = null;
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3500);
}

async function loadSuppliers() {
  try {
    const session = await FarmaApi.session();
    FarmaApi.setProfile(session.usuario);
    if (session.usuario.perfil !== "Administrador") {
      showToast("Esta página é exclusiva para administradores.", true);
      window.setTimeout(() => window.location.replace("venda.html"), 1200);
      return;
    }
    suppliers = await FarmaApi.get("/fornecedores");
    renderSuppliers();
  } catch (error) {
    if (error.status !== 401) showToast(error.message || "Não foi possível carregar os fornecedores.", true);
  }
}

document.querySelector("#addSupplierButton").addEventListener("click", () => openDialog());
document.querySelector("#closeDialogButton").addEventListener("click", closeDialog);
document.querySelector("#cancelDialogButton").addEventListener("click", closeDialog);
searchInput.addEventListener("input", renderSuppliers);

tableBody.addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit-supplier]");
  const deleteButton = event.target.closest("[data-delete-supplier]");

  if (editButton) {
    const supplier = suppliers.find(item => String(item.idFornecedor) === editButton.dataset.editSupplier);
    if (supplier) openDialog(supplier);
  }

  if (deleteButton) {
    const supplier = suppliers.find(item => String(item.idFornecedor) === deleteButton.dataset.deleteSupplier);
    if (!supplier || !window.confirm(`Tem a certeza de que pretende eliminar ${supplier.nomeDaEmpresa}?`)) return;
    try {
      await FarmaApi.delete(`/fornecedores/${supplier.idFornecedor}`);
      suppliers = suppliers.filter(item => Number(item.idFornecedor) !== Number(supplier.idFornecedor));
      renderSuppliers();
      showToast("Fornecedor eliminado.");
    } catch (error) {
      showToast(error.message || "Não foi possível eliminar o fornecedor.", true);
    }
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  formError.hidden = true;
  const values = {
    nomeDaEmpresa: form.elements.nomeDaEmpresa.value.trim(),
    nif: form.elements.nif.value.trim(),
    telefone: form.elements.telefone.value.trim(),
    email: form.elements.email.value.trim(),
    status: form.elements.status.value
  };
  if (!values.nomeDaEmpresa || !values.nif) {
    formError.textContent = "Preencha o nome da empresa e o NIF.";
    formError.hidden = false;
    return;
  }
  try {
    const saved = editingId
      ? await FarmaApi.put(`/fornecedores/${editingId}`, values)
      : await FarmaApi.post("/fornecedores", values);
    const wasEditing = Boolean(editingId);
    suppliers = wasEditing
      ? suppliers.map(supplier => Number(supplier.idFornecedor) === Number(saved.idFornecedor) ? saved : supplier)
      : [...suppliers, saved];
    renderSuppliers();
    closeDialog();
    showToast(wasEditing ? "Fornecedor atualizado." : "Fornecedor criado.");
  } catch (error) {
    formError.textContent = error.message || "Não foi possível guardar o fornecedor.";
    formError.hidden = false;
  }
});

loadSuppliers();
