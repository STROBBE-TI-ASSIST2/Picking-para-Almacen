document.addEventListener("DOMContentLoaded", () => {
  const main = document.querySelector("main.container");
  if (!main) return;

  const codppc = main.dataset.codppc;
  const cododc = main.dataset.cododc;

  const tablaBody = document.querySelector("#tablaDetalle tbody");
  const titulo = document.querySelector("#detalleTitulo"); // (no existe; ok)
  const scanInput = document.querySelector("#scanInput");  // (no existe; ok)
  const btnRefresh = document.querySelector("#btnRefresh");
  const btnGuardar = document.querySelector("#btnGuardar");

  // Memoria temporal para NO duplicar etiqueta por producto (solo mientras no recargues)
  const etiquetasEscaneadas = new Set(); // key: `${codprod}|${etiqueta}`

  // =========================
  // Helpers
  // =========================
  const $ = (s) => document.querySelector(s);

  function onUnauthorized(r) {
    if (r.status === 401) {
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

  // ✅ NUEVO: setear texto en cabecera
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = (val ?? "-");
  }

  // ✅ NUEVO: mismo formato ES (sirve para fechaDoc, inicio/fin si luego quieres)
  function formatFechaES(fechaRaw) {
    if (!fechaRaw) return "-";
    const d = new Date(fechaRaw);
    if (isNaN(d)) return String(fechaRaw);
    return d.toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  // =========================
  // ✅ NUEVO: Cargar cabecera desde backend
  // Endpoint: GET /api/despachos/detalle/cabecera?codppc=...&cododc=...
  // =========================
  async function cargarCabecera() {
    const params = new URLSearchParams({ codppc, cododc });

    const r = await fetch(`/api/despachos/detalle/cabecera?${params.toString()}`, {
      method: "GET",
      credentials: "include"
    });

    if (onUnauthorized(r)) return;

    const j = await r.json();
    if (!r.ok) {
      console.warn(j.msg || "No se pudo cargar cabecera");
      return;
    }

    const c = j.cabecera || {};

    // ✅ IDs reales de tu HTML
    setText("nroOrden", c.nroOrden || "-");
    setText("fechaDoc", formatFechaES(c.fechaDoc));
    setText("nroOD", c.nroOD || cododc);
    setText("registradoPor", c.registradoPor || "-");
    setText("preparadoPor", c.preparadoPor || "-");
    setText("tiempoPrep", c.tiempoPrep || "-");
    setText("cliente", c.cliente || "-");

    // OBS: puedes mostrar dirección + obs (si vienen)
    const obsFinal = [c.direccion, c.obs].filter(Boolean).join(" — ");
    setText("obs", obsFinal || c.obs || "-");

    // opcional: si quieres reflejar el nroPedido (ya lo tienes en HTML)
    // setText("nroPedido", c.nroPedido || codppc);
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
    `;

          tablaBody.appendChild(tr);
        });
      }

  // =========================
  // Cargar detalle (cookies)
  // =========================
  async function cargarDetalle() {
    const params = new URLSearchParams({ codppc, cododc });

    const r = await fetch(`/api/despachos/detalle/leer?${params.toString()}`, {
      method: "GET",
      credentials: "include"
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
// MODAL: Selección de usuarios
// =========================
const registradoBox  = document.querySelector("#registradoPor");
const preparadoBox   = document.querySelector("#preparadoPor");

const modal          = document.querySelector("#modalUsuarios");
const usuariosBody   = document.querySelector("#usuariosBody");
const modalTitulo    = document.querySelector("#modalTitulo");
const btnCerrarModal = document.querySelector("#btnCerrarModal");
const usuarioBuscar  = document.querySelector("#usuarioBuscar");

let modoSeleccion = null; // "registrado" | "preparado"
let cacheUsuarios = null;

function abrirModal(modo) {
  modoSeleccion = modo;

  if (modalTitulo) {
    modalTitulo.textContent = (modo === "registrado")
      ? "Seleccionar REGISTRADO POR"
      : "Seleccionar PREPARADO POR";
  }

  if (usuarioBuscar) usuarioBuscar.value = "";

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => usuarioBuscar?.focus(), 50);

  cargarUsuarios();
}

function cerrarModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function pintarUsuarios(lista) {
  usuariosBody.innerHTML = "";

  if (!lista || !lista.length) {
    usuariosBody.innerHTML = `<tr><td colspan="2" style="padding:14px;">No hay usuarios.</td></tr>`;
    return;
  }

  lista.forEach(u => {
    const tr = document.createElement("tr");
    tr.className = "modal-row";
    tr.innerHTML = `
      <td>${escapeHtml(u.CODIGO ?? "")}</td>
      <td>${escapeHtml(u.NOMBRE ?? "")}</td>
    `;
    tr.addEventListener("click", () => seleccionarUsuario(u));
    usuariosBody.appendChild(tr);
  });
}

async function cargarUsuarios() {
  if (cacheUsuarios) {
    pintarUsuarios(cacheUsuarios);
    return;
  }

  const r = await fetch("/api/despachos/usuarios", {
    method: "GET",
    credentials: "include"
  });

  if (onUnauthorized(r)) return;

  const j = await r.json();
  if (!r.ok) {
    alert(j.msg || "Error al listar usuarios");
    return;
  }

  cacheUsuarios = j.usuarios || [];
  pintarUsuarios(cacheUsuarios);
}

function filtrarUsuarios(txt) {
  const q = (txt || "").trim().toLowerCase();
  if (!q) return cacheUsuarios || [];

  return (cacheUsuarios || []).filter(u => {
    const c = String(u.CODIGO || "").toLowerCase();
    const n = String(u.NOMBRE || "").toLowerCase();
    return c.includes(q) || n.includes(q);
  });
}
const btnInicio = document.querySelector("#btnInicio");
const btnFin    = document.querySelector("#btnFin");

function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.textContent = (value ?? "-");
}

// INICIO
btnInicio?.addEventListener("click", async () => {
  const r = await fetch("/api/despachos/detalle/inicio", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codppc, cododc })
  });

  if (onUnauthorized(r)) return;

  const j = await r.json();
  if (!r.ok) {
    alert(j.msg || "Error al iniciar");
    return;
  }

  alert(j.msg || "Inicio OK");
});

// FIN
btnFin?.addEventListener("click", async () => {
  if (!confirm("¿Finalizar preparación y guardar tiempo?")) return;

  const r = await fetch("/api/despachos/detalle/fin", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codppc, cododc })
  });

  if (onUnauthorized(r)) return;

  const j = await r.json();
  if (!r.ok) {
    alert(j.msg || "Error al finalizar");
    return;
  }

  const mins = j?.cabecera?.tprep_min;
if (j?.cabecera?.tprep_min !== undefined) {
  document.getElementById("tiempoPrep").textContent =
    `${j.cabecera.tprep_min} min`;
}
  alert(j.msg || "Fin OK");
});

async function seleccionarUsuario(u) {
  const codigo = (u.CODIGO || "").toString();
  const nombre = (u.NOMBRE || "").toString();
  if (!codigo) return;

  const payload = { codppc, cododc };
  if (modoSeleccion === "registrado") payload.registrado_id = codigo;
  if (modoSeleccion === "preparado")  payload.preparado_id  = codigo;

  const r = await fetch("/api/despachos/detalle/asignar", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (onUnauthorized(r)) return;

  const j = await r.json();
  if (!r.ok) {
    alert(j.msg || "Error al asignar usuario");
    return;
  }

  // pintar en el recuadro correspondiente
  if (modoSeleccion === "registrado") document.querySelector("#registradoPor").textContent = nombre;
  if (modoSeleccion === "preparado")  document.querySelector("#preparadoPor").textContent  = nombre;

  cerrarModal();
}

// abrir modal al tocar recuadros
registradoBox?.addEventListener("click", () => abrirModal("registrado"));
preparadoBox?.addEventListener("click", () => abrirModal("preparado"));

// cerrar modal
btnCerrarModal?.addEventListener("click", cerrarModal);
modal?.addEventListener("click", (e) => {
  if (e.target === modal) cerrarModal();
});
usuarioBuscar?.addEventListener("input", () => {
  pintarUsuarios(filtrarUsuarios(usuarioBuscar.value));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) cerrarModal();
});

  // =========================
  // Parsear QR (lógica del segundo)
  // =========================
  function parsearQR(raw) {
    // Esperado:
    // fecha|ppc|cliente|codprod|cantidad|descripcion|lote|etiqueta|...
    const partes = (raw || "").split("|");
    if (partes.length < 8) return { ok: false, error: "QR inválido (faltan campos)" };

    const fecha      = partes[0];
    const ppcQr      = partes[1];
    const cliente    = partes[2];
    const codprodRaw = partes[3];
    const cantStr    = partes[4];
    const desc       = partes[5] || "";
    const lote       = partes[6];
    const etiqueta   = partes[7];

    const codprod = (codprodRaw || "").replace(/\./g, "").trim();
    const cantidad = parseFloat((cantStr || "").replace(",", "."));

    if (!codprod) return { ok: false, error: "Código de producto vacío" };
    if (Number.isNaN(cantidad)) return { ok: false, error: "Cantidad inválida en QR" };
    if (!etiqueta) return { ok: false, error: "Etiqueta vacía en QR" };

    return {
      ok: true,
      data: { fecha, ppcQr, cliente, codprod, cantidad, desc, lote, etiqueta }
    };
  }

  // =========================
  // Enviar Scan (cookies)
  // =========================
  async function enviarScan({ codprod, cantidad, etiqueta, ppcQr }) {
    // Validar ppc QR vs pantalla
    if (ppcQr && ppcQr !== codppc) {
      const ok = confirm(`El QR es del despacho ${ppcQr}, pero estás en ${codppc}. ¿Continuar?`);
      if (!ok) return;
    }

    // Dedupe etiqueta por producto (frontend)
    const claveEtiqueta = `${codprod}|${etiqueta}`;
    if (etiquetasEscaneadas.has(claveEtiqueta)) {
      alert(`La etiqueta ${etiqueta} para el producto ${codprod} ya fue escaneada.`);
      return;
    }
    etiquetasEscaneadas.add(claveEtiqueta);

    const r = await fetch("/api/despachos/detalle/scan", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codppc,
        cododc,
        codprod,
        cantidad,
        etiqueta
      })
    });

    if (onUnauthorized(r)) return;

    const j = await r.json();
    if (!r.ok) {
      etiquetasEscaneadas.delete(claveEtiqueta);
      alert(j.msg || "Error en escaneo");
      return;
    }

    pintarTabla(j.detalle || []);
  }

  // =========================
  // Quitar/Reset por producto (botón ⟲)
  // OJO: NO uses /detalle/terminar porque ese borra TODO el despacho
  // =========================
  tablaBody.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-quitar");
    if (!btn) return;

    const codprod = (btn.dataset.codprod || "").replace(/\./g, "").trim();
    if (!codprod) return;

    if (!confirm(`¿Resetear escaneo del producto ${codprod}?`)) return;

    // ✅ RECOMENDADO: crear endpoint /api/despachos/detalle/reset
    // (si aún no lo tienes, deja esto comentado para no romper)
    const r = await fetch("/api/despachos/detalle/reset", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codppc, cododc, codprod })
    });

    if (onUnauthorized(r)) return;

    const j = await r.json();
    if (!r.ok) {
      alert(j.msg || "Error al resetear");
      return;
    }

    // limpiar etiquetas escaneadas para ese producto (frontend)
    for (const k of Array.from(etiquetasEscaneadas)) {
      if (k.startsWith(codprod + "|")) etiquetasEscaneadas.delete(k);
    }

    pintarTabla(j.detalle || []);
  });

  // =========================
  // Refresh + Cambiar usuario
  // =========================
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      cargarCabecera(); // ✅ nuevo
      cargarDetalle();
    });
  }

// =========================
// GUARDAR = terminar despacho + volver
// =========================
    if (btnGuardar) {
      btnGuardar.addEventListener("click", async () => {

        const ok = confirm(
          `¿Deseas GUARDAR y finalizar el despacho ${codppc}?\n\n` +
          `Esto cerrará el detalle y volverás a la lista.`
        );
        if (!ok) return;

        const r = await fetch("/api/despachos/detalle/terminar", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codppc, cododc })
        });

        if (onUnauthorized(r)) return;

        const j = await r.json();
        if (!r.ok) {
          alert(j.msg || "Error al guardar despacho");
          return;
        }

        // volver a la pantalla anterior
        window.location.href = "/despachos";
      });
    }

  // =========================
  // Captura de escaneo
  // =========================
  if (scanInput) {
    scanInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      const raw = scanInput.value.trim();
      scanInput.value = "";
      if (!raw) return;

      const res = parsearQR(raw);
      if (!res.ok) return alert(res.error);
      enviarScan(res.data);
    });
  }

  // Modo global (tu HTML actual)
  let buffer = "";
  let lastTs = 0;

  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea") return;

    const now = Date.now();
    if (now - lastTs > 80) buffer = "";
    lastTs = now;

    if (e.key === "Enter") {
      const raw = buffer.trim();
      buffer = "";
      if (!raw) return;

      const res = parsearQR(raw);
      if (!res.ok) return alert(res.error);
      enviarScan(res.data);
      return;
    }

    if (e.key.length !== 1) return;
    buffer += e.key;
  });

  // =========================
  // Primera carga
  // =========================
  cargarCabecera(); // ✅ NUEVO: llena cabecera
  cargarDetalle();  // ✅ existente
});
