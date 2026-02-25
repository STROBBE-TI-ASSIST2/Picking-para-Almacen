document.addEventListener("DOMContentLoaded", () => {
  // ✅ Ya NO validamos token con localStorage porque ahora usas cookies + @jwt_required()
  // Si no hay sesión, el backend ya redirige a /login.

  const btnLogout = document.querySelector("#btnLogout");

  if (btnLogout) {
    btnLogout.addEventListener("click", async (e) => {
      e.preventDefault();

      try {
        // ✅ Cierra sesión borrando la cookie JWT en el backend
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include"
        });
      } catch (err) {
        console.error(err);
      } finally {
        // Limpieza opcional de info de UI
        localStorage.removeItem("usuario");
        localStorage.removeItem("token"); // por si quedó de antes

        // ✅ Redirige al login directamente
        window.location.href = "/login";
      }
    });
  }
});
