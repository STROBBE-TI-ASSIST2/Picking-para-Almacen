let page = 1;
const pageSize = 20;

const $ = (s) => document.querySelector(s);
const tbody = $("#tabla tbody");
const info  = $("#info");
const prev  = $("#prev");
const next  = $("#next");

// =========================
// Eventos de filtros / paginación
// =========================
$("#filtros").addEventListener("submit", (e) => {
  e.preventDefault();
  page = 1;
  cargar();
});

prev.onclick = () => {
  if (page > 1) {
    page--;
    cargar();
  }
};

next.onclick = () => {
  page++;
  cargar();
};

// =========================
// Eventos de botones de acción por fila
// (Ver detalle / Terminado)
// =========================
tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const codppc = btn.dataset.mpc;
  const cododc = btn.dataset.odc;
  const token  = localStorage.getItem("token");

  if (!token) {
    location.href = "/login";
    return;
  }

    if (btn.classList.contains("btn-detalle")) {
      const r = await fetch("/api/despachos/detalle/generar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ codppc, cododc })
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.msg || "Error al generar/leer detalle");
        return;
      }

      // luego de generar/usar snapshot, rediriges a la nueva página
      window.location.href = `/api/despachos/ver/${encodeURIComponent(codppc)}/${encodeURIComponent(cododc)}`;
    }

  // Botón TERMINADO
  if (btn.classList.contains("btn-terminado")) {
    if (!confirm(`¿Marcar como terminado y borrar el detalle de ${codppc}?`)) return;

    const r = await fetch("/api/despachos/detalle/terminar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ codppc, cododc })
    });

    const j = await r.json();
    if (!r.ok) {
      alert(j.msg || "Error al terminar detalle");
      return;
    }

    alert("Detalle eliminado para MPC " + codppc);
    // Opcional: cambiar estilo de la fila, deshabilitar botones, etc.
  }
});

// =========================
// Función que carga la grilla
// =========================
async function cargar() {
  const token = localStorage.getItem("token");
  if (!token) {
    location.href = "/login";
    return;
  }

  const fd  = $("#fecha_desde").value || "";
  const fh  = $("#fecha_hasta").value || "";
  const est = $("#estado").value || "";

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize)
  });
  if (fd)  params.append("fecha_desde", fd);
  if (fh)  params.append("fecha_hasta", fh);
  if (est) params.append("estado", est);

  const r = await fetch(`/api/despachos/?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const j = await r.json();

  if (!r.ok) {
    tbody.innerHTML = `<tr><td colspan="11">${j.msg || "No autorizado"}</td></tr>`;
    if (r.status === 401) {
      localStorage.removeItem("token");
      location.href = "/login";
    }
    return;
  }

  tbody.innerHTML = "";
  (j.items || []).forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.c_ppc_fecdoc ?? ""}</td>
      <td>${row.ppc_numppc ?? ""}</td>
      <td>${row.c_sit_orddes ?? ""}</td>
      <td>${row.aux_nomaux ?? ""}</td>
      <td>${row.dir_Despacho ?? ""}</td>
      <td>${row.pdd_horini ?? ""}</td>
      <td>${row.pdd_horfin ?? ""}</td>
      <td>${row.ppc_ordcom ?? ""}</td>
      <td>${row.odc_numodc ?? ""}</td>
      <td>${row.ppc_obsped ?? ""}</td>
      <td>
        <button
          class="btn-detalle"
          data-mpc="${row.ppc_numppc ?? ""}"
          data-odc="${row.odc_numodc ?? ""}"
        >
          Ver detalle
        </button>
        <button
          class="btn-terminado"
          data-mpc="${row.ppc_numppc ?? ""}"
          data-odc="${row.odc_numodc ?? ""}"
        >
          Terminado
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const total = j.total ?? 0;
  const last  = Math.max(1, Math.ceil(total / pageSize));
  info.textContent = `Página ${j.page} de ${last} — Total: ${total}`;
  prev.disabled = (page <= 1);
  next.disabled = (page >= last);
}

// =========================
// Primera carga
// =========================
document.addEventListener("DOMContentLoaded", cargar);
