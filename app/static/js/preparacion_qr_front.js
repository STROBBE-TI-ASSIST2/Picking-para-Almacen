const cards = document.querySelector("#cards");
let page = 1;
const pageSize = 20;

const $ = (s) => document.querySelector(s);
const info  = $("#info");
const prev  = $("#prev");
const next  = $("#next");

// =========================
// Estado por defecto: TODOS
// =========================
function setDefaultEstadoTodos() {
  const selectEstado = $("#estado");
  if (selectEstado) selectEstado.value = "";

  const chips = document.querySelectorAll(".chip");
  if (chips.length) {
    chips.forEach(c => c.classList.remove("active"));
    const chipTodos = document.querySelector('.chip[data-estado=""]');
    if (chipTodos) chipTodos.classList.add("active");
  }
}

// =========================
// Chips: filtrar al tocar
// =========================
document.querySelectorAll(".chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const estado = btn.dataset.estado || "";
    const selectEstado = $("#estado");
    if (selectEstado) selectEstado.value = estado;

    cargar(true);
  });
});

// =========================
// Eventos de filtros / paginación
// =========================
$("#filtros")?.addEventListener("submit", (e) => {
  e.preventDefault();
  page = 1;
  cargar();
});

prev?.addEventListener("click", () => {
  if (page > 1) {
    page--;
    cargar();
  }
});

next?.addEventListener("click", () => {
  page++;
  cargar();
});

// =========================
// Helpers para pintar tarjetas
// =========================
function estadoToClass(estadoRaw) {
  const s = (estadoRaw ?? "").toString().toUpperCase();

  if (s.includes("PEND")) return "pendiente";
  if (s.includes("ATEND")) return "atendido";
  if (s.includes("INICI")) return "iniciada";

  return "pendiente";
}

function formatFechaES(fechaRaw) {
  if (!fechaRaw) return "";

  const d = new Date(fechaRaw);
  if (isNaN(d)) return fechaRaw;

  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
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
// Función que carga la grilla
// =========================
async function cargar(resetToFirstPage = false) {
  if (resetToFirstPage) page = 1;

  const fd  = $("#fecha_desde")?.value || "";
  const fh  = $("#fecha_hasta")?.value || "";
  const est = $("#estado")?.value || "";  // "" = TODOS

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize)
  });

  if (fd)  params.append("fecha_desde", fd);
  if (fh)  params.append("fecha_hasta", fh);
  if (est) params.append("estado", est);

  const r = await fetch(`/api/despachos/?${params.toString()}`, {
    credentials: "include"
  });

  const j = await r.json();

  if (!r.ok) {
    cards.innerHTML = `<div style="padding:16px;font-weight:800;">${escapeHtml(j.msg || "No autorizado")}</div>`;
    if (r.status === 401) location.href = "/login";
    return;
  }

  cards.innerHTML = "";

  const items = j.items || [];
  if (items.length === 0) {
    cards.innerHTML = `<div style="padding:16px;font-weight:800;">No hay despachos para los filtros seleccionados.</div>`;
  } else {
    items.forEach(row => {
      const codppc = row.ppc_numppc ?? "";
      const cliente = row.aux_nomaux ?? "";
      const direccion = row.dir_Despacho ?? "";
      const obs = row.ppc_obsped ?? "";
      const estadoTxt = row.c_sit_orddes ?? "";

      const estadoClass = estadoToClass(estadoTxt);

      const card = document.createElement("div");
      card.className = "card card-click";
      card.dataset.mpc = codppc;
      card.dataset.odc = (row.odc_numodc ?? "");

      card.innerHTML = `
        <div class="card-top">${escapeHtml(codppc)}</div>

        <div class="card-body">
          <div class="cliente">${escapeHtml(cliente)}</div>

          <div class="obs">
            ${escapeHtml(direccion)}<br>
            ${escapeHtml(obs)}
          </div>

          <div class="meta-row">
            <div class="meta-left">
              <span class="badge almacen">Almacén</span>
              <div class="sub-status verde">-</div>
            </div>

            <div class="meta-dates">
              <div class="date-box">
                <span>Fecha Inicio</span>
                <strong>${escapeHtml(formatFechaES(row.pdd_horini))}</strong>
              </div>
              <div class="date-box">
                <span>Fecha Fin</span>
                <strong>${escapeHtml(formatFechaES(row.pdd_horfin))}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="estado ${estadoClass}">${escapeHtml(estadoTxt || "PENDIENTE")}</div>
      `;

      cards.appendChild(card);
    });
  }

  const total = j.total ?? 0;
  const last  = Math.max(1, Math.ceil(total / pageSize));

  if (info) info.textContent = `Página ${j.page} de ${last} — Total: ${total}`;
  if (prev) prev.disabled = (page <= 1);
  if (next) next.disabled = (page >= last);
}

window.cargarDespachos = cargar;

// =========================
// Click en tarjeta -> ir a detalle
// =========================
cards.addEventListener("click", async (e) => {
  const card = e.target.closest(".card-click");
  if (!card) return;

  const codppc = card.dataset.mpc;
  const cododc = card.dataset.odc;

  if (!codppc || !cododc) {
    alert("Faltan datos para abrir el detalle (MPC/ODC).");
    return;
  }

  const r = await fetch("/api/despachos/detalle/generar", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codppc, cododc })
  });

  const j = await r.json();
  if (!r.ok) {
    alert(j.msg || "Error al generar/leer detalle");
    if (r.status === 401) location.href = "/login";
    return;
  }

  window.location.href = `/api/despachos/ver/${encodeURIComponent(codppc)}/${encodeURIComponent(cododc)}`;
});

// =========================
// Primera carga
// =========================
document.addEventListener("DOMContentLoaded", () => {
  setDefaultEstadoTodos();
  cargar(true);
});
