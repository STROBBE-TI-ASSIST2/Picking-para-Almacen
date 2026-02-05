document.addEventListener("DOMContentLoaded", () => {
  const form      = document.querySelector("#loginForm");
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
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },

        // ✅ CLAVE: permite recibir (Set-Cookie) y enviar cookies
        credentials: "include",

        body: JSON.stringify({ username, password })
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        errorEl.textContent = j.msg || "Error al iniciar sesión";
        return;
      }

      // ✅ Con cookies: NO guardes access_token en localStorage
      // localStorage.removeItem("token"); // opcional: limpia restos
      localStorage.removeItem("token");

      // ✅ Si quieres mostrar nombre/área en UI, guarda solo el user
      if (j.user) {
        localStorage.setItem("usuario", JSON.stringify(j.user));
      } else {
        localStorage.removeItem("usuario");
      }

      // ✅ Redirección a menú (ya estará protegido por @jwt_required())
      window.location.href = "/menu";

    } catch (err) {
      console.error(err);
      errorEl.textContent = "Error de conexión con el servidor.";
    }
  });
});
