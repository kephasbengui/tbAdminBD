const form = document.querySelector("#loginForm");
const button = document.querySelector("#loginButton");
const message = document.querySelector("#loginMessage");

function destinationFor(user) {
  return user.perfil === "Administrador" ? "dasboard.html" : "venda.html";
}

async function redirectIfAuthenticated() {
  try {
    const { usuario } = await FarmaApi.session();
    window.location.replace(destinationFor(usuario));
  } catch (error) {
    if (error.status !== 401) {
      message.textContent = error.message || "Não foi possível verificar a sessão.";
      message.hidden = false;
    }
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  message.hidden = true;
  button.disabled = true;
  try {
    const result = await FarmaApi.login({
      email: form.elements.email.value.trim(),
      senha: form.elements.senha.value
    });
    window.location.replace(destinationFor(result.usuario));
  } catch (error) {
    message.textContent = error.message || "Não foi possível iniciar sessão.";
    message.hidden = false;
  } finally {
    button.disabled = false;
  }
});

redirectIfAuthenticated();
