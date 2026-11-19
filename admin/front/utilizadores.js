const tableBody = document.querySelector("#usersTableBody");
const userCount = document.querySelector("#userCount");
const visibleCount = document.querySelector("#visibleCount");
const searchInput = document.querySelector("#userSearch");
const emptyState = document.querySelector("#emptyState");
const emptyTitle = document.querySelector("#emptyTitle");
const emptyMessage = document.querySelector("#emptyMessage");
const dialog = document.querySelector("#userDialog");
const form = document.querySelector("#userForm");
const formError = document.querySelector("#formError");
const toast = document.querySelector("#toast");
let users = [];
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

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
}

function renderUsers() {
  const query = searchInput.value.trim().toLocaleLowerCase("pt");
  const filtered = users.filter(user => `${user.nome} ${user.email} ${user.perfil}`.toLocaleLowerCase("pt").includes(query));

  tableBody.innerHTML = filtered.map(user => {
    const active = user.status === "ATIVO";
    return `<tr>
      <td><div class="user-identity"><span class="user-avatar" aria-hidden="true">${escapeHTML(initials(user.nome))}</span><strong>${escapeHTML(user.nome)}</strong></div></td>
      <td>${escapeHTML(user.email)}</td>
      <td><span class="role-tag">${escapeHTML(user.perfil)}</span></td>
      <td>${escapeHTML(formatDate(user.dataDeCriacao))}</td>
      <td><span class="state-tag ${active ? "active" : "inactive"}">${active ? "Ativo" : "Inativo"}</span></td>
      <td><div class="row-actions">
        <button class="row-action" type="button" data-edit-user="${escapeHTML(user.idUsuarios)}" aria-label="Editar ${escapeHTML(user.nome)}">Editar</button>
        <button class="row-action delete" type="button" data-delete-user="${escapeHTML(user.idUsuarios)}" aria-label="Eliminar ${escapeHTML(user.nome)}">Eliminar</button>
      </div></td>
    </tr>`;
  }).join("");

  userCount.textContent = `${users.length} ${users.length === 1 ? "utilizador registado" : "utilizadores registados"}`;
  visibleCount.textContent = `${filtered.length} de ${users.length}`;
  emptyState.hidden = filtered.length > 0;
  emptyTitle.textContent = users.length ? "Nenhum resultado encontrado" : "Ainda não existem utilizadores";
  emptyMessage.textContent = users.length
    ? "Experimente pesquisar por outro nome, email ou perfil."
    : "Adicione um utilizador para começar a gerir a equipa.";
}

function openDialog(user = null) {
  editingId = user?.idUsuarios ?? null;
  form.reset();
  formError.hidden = true;
  document.querySelector("#dialogTitle").textContent = user ? "Editar utilizador" : "Novo utilizador";
  document.querySelector("#saveUserButton").textContent = user ? "Guardar alterações" : "Guardar utilizador";
  document.querySelector("#passwordNote").textContent = user
    ? "Deixe vazio para manter a palavra-passe atual."
    : "Obrigatória; mínimo de 12 caracteres.";
  form.elements.senha.required = !user;

  if (user) {
    form.elements.nome.value = user.nome;
    form.elements.email.value = user.email;
    form.elements.perfil.value = user.perfil;
    form.elements.status.value = user.status;
  }

  dialog.showModal();
  form.elements.nome.focus();
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

async function loadUsers() {
  try {
    const session = await FarmaApi.session();
    FarmaApi.setProfile(session.usuario);
    if (session.usuario.perfil !== "Administrador") {
      showToast("Esta página é exclusiva para administradores.", true);
      window.setTimeout(() => window.location.replace("venda.html"), 1200);
      return;
    }
    users = await FarmaApi.get("/usuarios");
    renderUsers();
  } catch (error) {
    if (error.status !== 401) showToast(error.message || "Não foi possível carregar os utilizadores.", true);
  }
}

document.querySelector("#addUserButton").addEventListener("click", () => openDialog());
document.querySelector("#closeDialogButton").addEventListener("click", closeDialog);
document.querySelector("#cancelDialogButton").addEventListener("click", closeDialog);
searchInput.addEventListener("input", renderUsers);

tableBody.addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit-user]");
  const deleteButton = event.target.closest("[data-delete-user]");

  if (editButton) {
    const user = users.find(item => String(item.idUsuarios) === editButton.dataset.editUser);
    if (user) openDialog(user);
  }

  if (deleteButton) {
    const user = users.find(item => String(item.idUsuarios) === deleteButton.dataset.deleteUser);
    if (!user || !window.confirm(`Tem a certeza de que pretende eliminar ${user.nome}?`)) return;
    try {
      await FarmaApi.delete(`/usuarios/${user.idUsuarios}`);
      users = users.filter(item => Number(item.idUsuarios) !== Number(user.idUsuarios));
      renderUsers();
      showToast("Utilizador eliminado.");
    } catch (error) {
      showToast(error.message || "Não foi possível eliminar o utilizador.", true);
    }
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  formError.hidden = true;
  const values = {
    nome: form.elements.nome.value.trim(),
    email: form.elements.email.value.trim(),
    perfil: form.elements.perfil.value,
    status: form.elements.status.value
  };
  const senha = form.elements.senha.value;
  if (!values.nome || !values.email || (!editingId && senha.length < 12) || (senha && senha.length < 12)) {
    formError.textContent = !values.nome || !values.email
      ? "Preencha o nome e o email."
      : "A palavra-passe deve ter pelo menos 12 caracteres.";
    formError.hidden = false;
    return;
  }
  if (senha) values.senha = senha;

  try {
    const saved = editingId
      ? await FarmaApi.put(`/usuarios/${editingId}`, values)
      : await FarmaApi.post("/usuarios", values);
    const wasEditing = Boolean(editingId);
    users = wasEditing
      ? users.map(user => Number(user.idUsuarios) === Number(saved.idUsuarios) ? saved : user)
      : [...users, saved];
    renderUsers();
    closeDialog();
    showToast(wasEditing ? "Utilizador atualizado." : "Utilizador criado.");
  } catch (error) {
    formError.textContent = error.message || "Não foi possível guardar o utilizador.";
    formError.hidden = false;
  }
});

loadUsers();
