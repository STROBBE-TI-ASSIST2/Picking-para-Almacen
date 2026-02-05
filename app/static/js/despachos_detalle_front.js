document.addEventListener("DOMContentLoaded", () => {
  const main = document.querySelector("main.container");
  if (!main) return;

  const codppc = main.dataset.codppc;
  const cododc = main.dataset.cododc;

  const tablaBody = document.querySelector("#tablaDetalle tbody");
  const titulo = document.querySelector("#detalleTitulo");
  const scanInput = document.querySelector("#scanInput");
  const btnTerminado = document.querySelector("#btnTerminado");

  if (titulo) titulo.textContent = `Despacho ${codppc} / ${cododc}`;

  // =========================
  // Helpers
  // =========================
  function onUnauthorized(r) {
    if (r.status === 401) {
      // sesión/cookie no válida
      window.location.href = "/login";
      return true;
    }
    return false;
  }

  function escapeHtml(v) {
    return (v ?? "").toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // =========================
  // Render tabla
  // =========================
  function pintarTabla(detalle) {
  tablaBody.innerHTML = "";

  if (!detalle || !detalle.length) {
    tablaBody.innerHTML = `<tr><td colspan="10">No hay detalle.</td></tr>`;
    return;
  }

  detalle.forEach((row, idx) => {
    const tr = document.createElement("tr");

    const item      = row.ITEM ?? (idx + 1);
    const codigo    = row.Cod_Producto_Pedido ?? "";
    const desc      = row.Descripcion_pedido ?? "";
    const um        = row.UM ?? "";
    const caja      = row.Caja ?? "";
    const ue        = row.UE ?? "";
    const cantPed   = row.Cantidad_a_Despachar ?? "";
    const cantScan  = row.Cantidad_Scaneada ?? 0;
    const ubicacion = row.L ?? "";

    tr.innerHTML = `
      <td>${escapeHtml(item)}</td>
      <td>${escapeHtml(codigo)}</td>
      <td>${escapeHtml(desc)}</td>
      <td>${escapeHtml(um)}</td>
      <td>${escapeHtml(caja)}</td>
      <td>${escapeHtml(ue)}</td>
      <td>${escapeHtml(cantPed)}</td>
      <td>${escapeHtml(cantScan)}</td>
      <td>${escapeHtml(ubicacion)}</td>
      <td>
        <button class="btn-quitar"
                type="button"
                data-codprod="${escapeHtml(codigo)}"
                title="Reset escaneado">
          ⟲
        </button>
      </td>
    `;

    tablaBody.appendChild(tr);
  });
}
  // =========================
  // Cargar detalle
  // =========================
  async function cargarDetalle() {
    const params = new URLSearchParams({ codppc, cododc });

    const r = await fetch(`/api/despachos/detalle/leer?${params.toString()}`, {
      method: "GET",
      credentials: "include" // ✅ JWT cookie
    });

    if (onUnauthorized(r)) return;

    const j = await r.json();
    if (!r.ok) {
      alert(j.msg || "Error al leer detalle");
      return;
    }

    pintarTabla(j.detalle || []);
  }

  // =========================
  // Scan (cuando presionas Enter)
  // =========================
  async function enviarScan(codigoLeido) {
    const r = await fetch("/api/despachos/detalle/scan", {
      method: "POST",
      credentials: "include", // ✅ JWT cookie
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codppc,
        cododc,
        codprod: codigoLeido,
        cantidad: 1
      })
    });

    if (onUnauthorized(r)) return;

    const j = await r.json();
    if (!r.ok) {
      alert(j.msg || "Error en escaneo");
      return;
    }

    // backend devuelve detalle actualizado
    pintarTabla(j.detalle || []);
  }

  if (scanInput) {
    scanInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      const codigo = scanInput.value.trim();
      if (!codigo) return;

      scanInput.value = "";
      enviarScan(codigo);
    });
  }

  // =========================
  // Terminado
  // =========================
  if (btnTerminado) {
    btnTerminado.addEventListener("click", async () => {
      if (!confirm(`¿Marcar como terminado el despacho ${codppc}?`)) return;

      const r = await fetch("/api/despachos/detalle/terminar", {
        method: "POST",
        credentials: "include", // ✅ JWT cookie
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codppc, cododc })
      });

      if (onUnauthorized(r)) return;

      const j = await r.json();
      if (!r.ok) {
        alert(j.msg || "Error al terminar");
        return;
      }

      alert("Terminado ✅");
      window.location.href = "/despachos";
    });
  }

  // Primera carga
  cargarDetalle();
});
