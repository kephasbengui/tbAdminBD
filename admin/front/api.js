(() => {
  const apiBase = String(window.FARMACIA_API_BASE || `${window.location.origin}/api`).replace(/\/$/, "");

  async function request(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || "GET",
      credentials: "include",
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    if (response.status === 204) return null;
    const contentType = response.headers.get("content-type") || "";
    const result = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
      const error = new Error(result?.error || `Pedido falhou (${response.status}).`);
      error.status = response.status;
      if (response.status === 401 && !options.allowUnauthorized && !location.pathname.endsWith("/login.html")) {
        location.replace("/login.html");
      }
      throw error;
    }
    return result;
  }

  function setProfile(user) {
    const profile = document.querySelector(".admin-profile");
    if (!profile || !user) return;
    const name = profile.querySelector("strong");
    const avatar = profile.querySelector(".avatar");
    if (name) name.textContent = user.nome;
    if (avatar) avatar.textContent = user.nome.trim()
      .split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
  }

  window.FarmaApi = Object.freeze({
    base: apiBase,
    request,
    setProfile,
    get: path => request(path),
    post: (path, body) => request(path, { method: "POST", body }),
    put: (path, body) => request(path, { method: "PUT", body }),
    delete: path => request(path, { method: "DELETE" }),
    bootstrap: () => request("/bootstrap"),
    session: () => request("/auth/session"),
    login: values => request("/auth/login", { method: "POST", body: values, allowUnauthorized: true }),
    logout: () => request("/auth/logout", { method: "POST", body: {} })
  });

  document.addEventListener("click", async event => {
    const link = event.target.closest(".logout-link");
    if (!link) return;
    event.preventDefault();
    link.setAttribute("aria-busy", "true");
    try {
      await window.FarmaApi.logout();
      location.replace("/login.html");
    } catch (error) {
      if (error.status !== 401) {
        link.removeAttribute("aria-busy");
        window.alert(error.message || "Não foi possível terminar a sessão.");
      }
    }
  });
})();
