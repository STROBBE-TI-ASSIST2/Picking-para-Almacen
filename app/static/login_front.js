document.addEventListener("DOMContentLoaded", () => {
  const form   = document.querySelector("#loginForm");
  const inputUser = document.querySelector("#username");
  const inputPass = document.querySelector("#password");
  const errorEl   = document.querySelector("#error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";

    const username = inputUser.value.trim();
    const password = inputPass.value.trim();

    if (!username || !password) {
      errorEl.textContent = "Ingresa usuario y contraseña.";
      return;
    }

    try {
      const r = await fetch("api/auth/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ username, password })
      });

      const j = await r.json();
      if (!r.ok) {
        errorEl.textContent = j.msg || "Error al iniciar sesión";
        return;
      }

      // Guardamos el token
      localStorage.setItem("token", j.access_token);
      localStorage.setItem("usuario", JSON.stringify(j.user));

      // Redirigimos a la lista de despachos
      window.location.href = "/despachos";
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Error de conexión con el servidor.";
    }
  });
});
