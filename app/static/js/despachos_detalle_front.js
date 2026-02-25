document.addEventListener("DOMContentLoaded", () => {
  const main = document.querySelector("main.container");
  if (!main) return;

  const codppc = main.dataset.codppc;
  const cododc = main.dataset.cododc;

  const tablaBody  = document.querySelector("#tablaDetalle tbody");
  const scanInput  = document.querySelector("#scanInput");
  const btnRefresh = document.querySelector("#btnRefresh");
  const btnGuardar = document.querySelector("#btnGuardar");

  let modal = null;
  const btnInicio = document.querySelector("#btnInicio"); // <img>
  const btnFin    = document.querySelector("#btnFin");    // <img>

  const scanSink = document.querySelector("#scanSink"); // opcional si existe

  // =========================
  // Estado
  // =========================
  let iniciado = false;
  function setIniciado(v){ iniciado = !!v; }

  const etiquetasEscaneadas = new Set();

  // =========================
  // Helpers: Toast + Confirm modal (ask)
  // =========================
  function showToast(msg, type = "info", duration = 4000) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = msg;

    if (type === "success") toast.style.background = "#2e7d32";
    else if (type === "error") toast.style.background = "#c62828";
    else if (type === "warning") toast.style.background = "#f9a825";
    else toast.style.background = "#1a3f6e";

    toast.classList.remove("hidden");
    requestAnimationFrame(() => toast.classList.add("show"));

    clearTimeout(toast._t1);
    clearTimeout(toast._t2);

    toast._t1 = setTimeout(() => {
      toast.classList.remove("show");
      toast._t2 = setTimeout(() => toast.classList.add("hidden"), 300);
    }, duration);
  }

  async function ask(message, title = "Confirmar", opts = {}) {
    const {
      yesText = "Aceptar",
      noText = "Cancelar",
      danger = false,
      lockScanner = true
    } = opts;

    const m   = document.getElementById("confirmModal");
    const tt  = document.getElementById("confirmTitle");
    const msg = document.getElementById("confirmMsg");
    const yes = document.getElementById("confirmYes");
    const no  = document.getElementById("confirmNo");

    if (!m || !tt || !msg || !yes || !no) return window.confirm(message);

    const prevFocus = document.activeElement;

    tt.textContent  = title;
    msg.textContent = message;
    yes.textContent = yesText;
    no.textContent  = noText;

    if (danger) yes.classList.add("danger");
    else yes.classList.remove("danger");

    m.classList.remove("hidden");
    m.setAttribute("aria-hidden", "false");
    setTimeout(() => yes.focus({ preventScroll: true }), 0);

    return new Promise((resolve) => {
      let done = false;

      const cleanup = (ans) => {
        if (done) return;
        done = true;

        m.classList.add("hidden");
        m.setAttribute("aria-hidden", "true");

        yes.onclick = null;
        no.onclick = null;
        document.removeEventListener("keydown", onKey, true);
        m.removeEventListener("click", onBackdrop, true);

        if (lockScanner) focusScanner();
        else if (prevFocus && prevFocus.focus) {
          try { prevFocus.focus({ preventScroll: true }); } catch(_) {}
        }

        resolve(ans);
      };

      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cleanup(false); return; }
        if (e.key === "Enter")  { e.preventDefault(); e.stopPropagation(); cleanup(true);  return; }
      };

      const onBackdrop = (e) => {
        if (e.target === m) cleanup(false);
      };

      yes.onclick = () => cleanup(true);
      no.onclick  = () => cleanup(false);

      document.addEventListener("keydown", onKey, true);
      m.addEventListener("click", onBackdrop, true);
    });
  }

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

  function setField(id, val) {
    const el = document.getElementById(id);
    if (!el) return;

    const v = (val ?? "-").toString();
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") el.value = v;
    else el.textContent = v;
  }

  function formatFechaES(fechaRaw) {
    if (!fechaRaw) return "-";
    const d = new Date(fechaRaw);
    if (isNaN(d)) return String(fechaRaw);
    const dia  = String(d.getDate()).padStart(2, "0");
    const mes  = String(d.getMonth() + 1).padStart(2, "0");
    const anio = d.getFullYear();
    return `${dia}/${mes}/${anio}`;
  }

  // =========================
  // Habilitar/Deshabilitar IMG buttons (Inicio/Fin)
  // =========================
  function setImgEnabled(imgEl, enabled){
    if (!imgEl) return;
    imgEl.classList.toggle("is-disabled", !enabled);
  }

  function setInicioEnabled(enabled){ setImgEnabled(btnInicio, enabled); }
  function setFinEnabled(enabled){ setImgEnabled(btnFin, enabled); }

  // =========================
  // Reglas de habilitación
  // =========================
  function tienePreparadoEnUI() {
    const el = document.getElementById("preparadoPor");
    if (!el) return false;

    const txt = (el.tagName === "INPUT" || el.tagName === "TEXTAREA")
      ? (el.value || "").trim()
      : (el.textContent || "").trim();

    return txt && txt !== "-" && txt.toLowerCase() !== "seleccionar";
  }

  // ✅ foco a tabla (para scanner)
  function focusTabla() {
    const table = document.getElementById("tablaDetalle");
    if (!table) return;
    if (!table.hasAttribute("tabindex")) table.setAttribute("tabindex", "-1");
    document.activeElement?.blur?.();
    table.focus({ preventScroll: true });
  }

  function focusScanner() {
    if (scanSink) {
      scanSink.setAttribute("readonly", "readonly");
      scanSink.focus({ preventScroll: true });
      return;
    }
    focusTabla();
  }

  document.addEventListener("pointerdown", (e) => {
    const modalAbierto = !!(modal && !modal.classList.contains("hidden"));
    const confirmAbierto = !document.getElementById("confirmModal")?.classList.contains("hidden") ? true : false;
    if (modalAbierto || confirmAbierto) return;

    const tag = e.target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;

    focusScanner();
  });

  // =========================
  // Estado inicial (simétrico)
  // =========================
  setInicioEnabled(false);
  setFinEnabled(false);

  // =========================
  // Cargar cabecera
  // =========================
  async function cargarCabecera() {
    const params = new URLSearchParams({ codppc, cododc });

    const r = await fetch(`/api/despachos/detalle/cabecera?${params.toString()}`, {
      method: "GET",
      credentials: "include"
    });

    if (onUnauthorized(r)) return;

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.warn(j.msg || "No se pudo cargar cabecera");
      return;
    }

    const c = j.cabecera || {};

    setField("fechaDoc", formatFechaES(c.fechaDoc));
    setField("nroOD", c.nroOD || cododc);
    setField("preparadoPor", c.preparadoPor || "-");
    setField("cliente", c.cliente || "-");

    if (c.tprep_min !== undefined && c.tprep_min !== null) setField("tiempoPrep", `${c.tprep_min} min`);
    else setField("tiempoPrep", c.tiempoPrep || "-");

    const obsFinal = [c.direccion, c.obs].filter(Boolean).join(" — ");
    setField("obs", obsFinal || c.obs || "-");


    const yaInicio = !!c.inicio_dt && String(c.inicio_dt).trim() !== "";
    const yaFin    = !!c.fin_dt && String(c.fin_dt).trim() !== "";

    if (yaFin) setIniciado(false);
    else if (yaInicio) setIniciado(true);
    else setIniciado(false);

    // - INICIO: requiere preparado y NO haber iniciado ni finalizado
    const tienePreparado = (c.preparado_cod && String(c.preparado_cod).trim() !== "") || tienePreparadoEnUI();
    setInicioEnabled(tienePreparado && !yaInicio && !yaFin);

    // FIN se decide por tabla
    setFinEnabled(true);
  }

  // =========================
  // FIN state + render tabla
  // =========================
  function toNum(v){
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function refreshFinState(detalle){
    const total = (detalle || []).length;

    const completos = (detalle || []).every(r => {
      const objetivo = toNum(r.Cantidd_abastecida ?? r.Cantidad_a_Despachar);
      const esc      = toNum(r.Cantidad_Scaneada);
      return objetivo > 0 ? (esc === objetivo) : true;
    });

    // ✅ FIN solo si: ya está iniciado + hay filas + todo completo
    //setFinEnabled(iniciado && total > 0 && completos);
    setFinEnabled(iniciado && total > 0);
  }
function pintarTabla(detalle) {
  tablaBody.innerHTML = "";

  if (!detalle || !detalle.length) {
    tablaBody.innerHTML = `<tr><td colspan="10">No hay detalle.</td></tr>`;
    refreshFinState([]);
    return;
  }

  // helper: tomar el 1er valor existente de varias llaves posibles
  const pick = (obj, keys, fallback = "") => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return fallback;
  };

  detalle.forEach((row, idx) => {
    const tr = document.createElement("tr");

    const item      = pick(row, ["ITEM"], idx + 1);
    const codigo    = pick(row, ["Cod_Producto_Pedido", "CodProductoPedido", "COD_PRODUCTO_PEDIDO"], "");
    const desc      = pick(row, ["Descripcion_pedido", "Descripcion", "DESCRIPCION_PEDIDO"], "");
    const um        = pick(row, ["UM", "Um", "u_m"], "");
    const caja      = pick(row, ["Caja", "CAJA"], "");
    const ue        = pick(row, ["UE", "Ue"], "");
    const cantPed   = pick(row, ["Cantidad_a_Despachar", "Cantidad_A_Despachar", "CANTIDAD_A_DESPACHAR"], "");
    const ubicacion = pick(row, ["Ubicacion", "UBICACION"], "");

    // ✅ objetivo (abastecida o pedida)
    const objetivo = toNum(
      pick(row, ["Cantidd_abastecida", "Cantidad_abastecida", "Cantidad_Abastecida"], null)
      ?? pick(row, ["Cantidad_a_Despachar", "Cantidad_A_Despachar", "CANTIDAD_A_DESPACHAR"], 0)
    );

    // ✅ escaneada (soporta distintos alias/casing)
    const esc = toNum(
      pick(row, ["Cantidad_Scaneada", "Cantidad_scaneada", "cantidad_scaneada", "CANTIDAD_SCANEADA"], 0)
    );

    const cantScan = esc;

    const ok = (objetivo > 0) ? (esc === objetivo) : true;
    tr.classList.add(ok ? "row-ok" : "row-pend");

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

  refreshFinState(detalle);
}

  async function cargarDetalle() {
    const params = new URLSearchParams({ codppc, cododc });

    const r = await fetch(`/api/despachos/detalle/leer?${params.toString()}`, {
      method: "GET",
      credentials: "include"
    });

    if (onUnauthorized(r)) return;

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      showToast(j.msg || "Error al leer detalle", "error");
      return;
    }

    pintarTabla(j.detalle || []);
  }

  // =========================
  // MODAL (igual que tenías)
  // =========================
  const registradoBox  = document.querySelector("#registradoPor");
  const preparadoBox   = document.querySelector("#preparadoPor");

  modal = document.querySelector("#modalUsuarios");
  const usuariosBody   = document.querySelector("#usuariosBody");
  const modalTitulo    = document.querySelector("#modalTitulo");
  const btnCerrarModal = document.querySelector("#btnCerrarModal");
  const usuarioBuscar  = document.querySelector("#usuarioBuscar");

  let modoSeleccion = null;
  let cacheUsuarios = null;

  function abrirModal(modo) {
    modoSeleccion = modo;

    if (modalTitulo) {
      modalTitulo.textContent = (modo === "registrado")
        ? "Seleccionar REGISTRADO POR"
        : "Seleccionar PREPARADO POR";
    }

    if (usuarioBuscar) usuarioBuscar.value = "";

    modal?.classList.remove("hidden");
    modal?.setAttribute("aria-hidden", "false");

    cargarUsuarios();
  }

  function cerrarModal() {
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");
    focusScanner();
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
    if (cacheUsuarios) { pintarUsuarios(cacheUsuarios); return; }

    const r = await fetch("/api/despachos/usuarios", {
      method: "GET",
      credentials: "include"
    });

    if (onUnauthorized(r)) return;

    const j = await r.json().catch(() => ({}));
    if (!r.ok) { showToast(j.msg || "Error al listar usuarios", "error"); return; }

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

  async function seleccionarUsuario(u) {
    const codigo = (u.CODIGO || "").toString();
    const nombre = (u.NOMBRE || "").toString();
    if (!codigo) return;

    const payload = { codppc, cododc };
    if (modoSeleccion === "registrado") payload.registrado_id = codigo;
    if (modoSeleccion === "preparado")  payload.preparado_id  = codigo;

    if (modoSeleccion === "registrado") setField("registradoPor", nombre);
    if (modoSeleccion === "preparado") {
      setField("preparadoPor", nombre);
    }

    const r = await fetch("/api/despachos/detalle/asignar", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (onUnauthorized(r)) return;

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      showToast(j.msg || "Error al asignar usuario", "error");
      return;
    }

    await cargarCabecera();
    cerrarModal();
  }

  registradoBox?.addEventListener("click", () => abrirModal("registrado"));
  preparadoBox?.addEventListener("click", () => abrirModal("preparado"));
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
  // INICIO (simétrico)
  // =========================
  btnInicio?.addEventListener("click", async () => {
    if (!btnInicio) return;

    if (btnInicio.classList.contains("is-disabled")) return;

    if (!tienePreparadoEnUI()) {
      await ask(
        "No puedes INICIAR si no has llenado el campo PREPARADO POR.",
        "Falta PREPARADO POR",
        { yesText: "Entendido", noText: "Cerrar" }
      );
      focusScanner();
      return;
    }

    if (btnInicio.dataset.loading === "1") return;
    btnInicio.dataset.loading = "1";
    setInicioEnabled(false);

    try {
      const r = await fetch("/api/despachos/detalle/inicio", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ codppc, cododc })
      });

      const txt = await r.text();
      let j = {};
      try { j = txt ? JSON.parse(txt) : {}; } catch(_) {}

      if (r.status === 401) {
        showToast("Sesión vencida. Vuelve a iniciar sesión.", "error");
        window.location.href = "/login";
        return;
      }

      if (r.status === 409) {
        await ask(j.msg || "Debe seleccionar PREPARADO POR antes de iniciar.", "Falta PREPARADO POR");
        return;
      }

      if (!r.ok) {
        showToast(j.msg || "Error al iniciar.", "error");
        return;
      }

      setIniciado(true);
      showToast(j.msg || "Inicio OK", "success");

      await cargarCabecera();
      await cargarDetalle();

      requestAnimationFrame(() => requestAnimationFrame(() => {
        focusTabla();
        setTimeout(focusTabla, 150);
      }));

    } catch (err) {
      console.error("[INICIO] FETCH ERROR:", err);
      showToast("Error de red al iniciar (ver consola).", "error");
      setIniciado(false);
      await cargarDetalle();
    } finally {
      btnInicio.dataset.loading = "0";
      focusScanner();
    }
  });

  // =========================
  // FIN (simétrico)
  // =========================
  btnFin?.addEventListener("click", async () => {
    if (!btnFin) return;

    if (btnFin.classList.contains("is-disabled")) return;

    const ok = await ask("¿Finalizar preparación y guardar tiempo?", "Finalizar", { danger: true });
    if (!ok) return;

    btnFin.dataset.loading = "1";
    setFinEnabled(false);

    try {
      const r = await fetch("/api/despachos/detalle/fin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codppc, cododc })
      });

      if (onUnauthorized(r)) return;

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast(j.msg || "Error al finalizar", "error");
        await cargarDetalle();
        return;
      }

      if (j?.cabecera?.tprep_min !== undefined && j?.cabecera?.tprep_min !== null) {
        setField("tiempoPrep", `${j.cabecera.tprep_min} min`);
      }

      showToast(j.msg || "Fin OK", "success");
      setIniciado(false);

      await cargarCabecera();
      await cargarDetalle();
      focusScanner();

    } catch (err) {
      console.error("[FIN] FETCH ERROR:", err);
      showToast("Error de red al finalizar (ver consola).", "error");
      await cargarDetalle();
    } finally {
      btnFin.dataset.loading = "0";
    }
  });

  // =========================
  // Parsear QR (NUEVO)
  // =========================
  // ✅ Ya NO parseamos en el frontend (evita que "producto" salga como fecha por cambios de formato)
  // Solo validamos que no venga vacío y enviamos el RAW al backend.
function parsearQR(raw) {
  const partes = (raw || "").trim().split("|").map(p => (p || "").trim()).filter(p => p !== "");

  if (partes.length === 9) {
    const ppcQr = partes[1];
    const codprod = (partes[3] || "").replace(/\./g, "").trim();
    const cantidad = parseFloat((partes[4] || "").replace(",", "."));
    const etiqueta = (partes[7] || "").trim();

    if (!codprod) return { ok:false, error:"Código de producto vacío" };
    if (Number.isNaN(cantidad)) return { ok:false, error:"Cantidad inválida" };
    if (!etiqueta) return { ok:false, error:"Etiqueta vacía" };

    return { ok:true, data:{ codprod, cantidad, etiqueta, ppcQr } };
  }

  if (partes.length === 8) {
    const codprod = (partes[1] || "").replace(/\./g, "").trim();
    const cantidad = parseFloat((partes[2] || "").replace(",", "."));
    const etiqueta = (partes[4] || "").trim();
    const ppcQr = null;

    if (!codprod) return { ok:false, error:"Código de producto vacío" };
    if (Number.isNaN(cantidad)) return { ok:false, error:"Cantidad inválida" };
    if (!etiqueta) return { ok:false, error:"Etiqueta vacía" };

    return { ok:true, data:{ codprod, cantidad, etiqueta, ppcQr } };
  }

  return { ok:false, error:`QR inválido (campos=${partes.length})` };
}

  // =========================
  // Enviar Scan (NUEVO)
  // =========================
  // ✅ Enviamos raw al backend. El backend:
  // - hace parse_qr_scan()
  // - valida mismatch PPC si aplica
  // - arma codprod/cantidad/etiqueta
  // - responde detalle actualizado
async function enviarScan({ codprod, cantidad, etiqueta, ppcQr }) {
  if (!iniciado) {
    showToast("Debe presionar INICIO antes de escanear.", "error");
    return;
  }

  // Validar ppc QR vs pantalla (si viene en el QR)
  if (ppcQr && ppcQr !== codppc) {
    const ok = await ask(
      `El QR es del despacho ${ppcQr}, pero estás en ${codppc}. ¿Continuar?`,
      "QR de otro despacho",
      { danger: true }
    );
    if (!ok) return;
  }

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

  const j = await r.json().catch(() => ({}));

  if (!r.ok) {
    showToast(j.msg || "Error en escaneo", "error");
    return;
  }

  pintarTabla(j.detalle || []);
  focusScanner();
}

  // =========================
  // scanInput (si existe)
  // =========================
  if (scanInput) {
    scanInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();

      const raw = scanInput.value.trim();
      scanInput.value = "";
      if (!raw) return;

      const res = parsearQR(raw);
      if (!res.ok) return showToast(res.error, "error");
      enviarScan(res.data);
    });
  }

  // =========================
  // Modo global scanner HID
  // =========================
  let buffer = "";
  let lastTs = 0;

  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    const modalAbierto = modal && !modal.classList.contains("hidden");
    const confirmAbierto = !document.getElementById("confirmModal")?.classList.contains("hidden") ? true : false;

    if ((modalAbierto || confirmAbierto) && (tag === "input" || tag === "textarea")) return;
    if (confirmAbierto) return;

    const now = Date.now();
    if (now - lastTs > 80) buffer = "";
    lastTs = now;

    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();

      const raw = buffer.trim();
      buffer = "";
      if (!raw) return;

      const res = parsearQR(raw);
      if (!res.ok) return showToast(res.error, "error");
      enviarScan(res.data);
      return;
    }

    if (e.key.length !== 1) return;
    buffer += e.key;
  }, true);

  // =========================
  // Refresh / Guardar / Reset
  // =========================
  btnRefresh?.addEventListener("click", () => {
    cargarCabecera();
    cargarDetalle();
    focusScanner();
  });

  btnGuardar?.addEventListener("click", async () => {
    const ok = await ask(
      `¿Deseas GUARDAR y finalizar el despacho ${codppc}?\n\nEsto cerrará el detalle y volverás a la lista.`,
      "Guardar y finalizar",
      { yesText: "Guardar", noText: "Cancelar", danger: true }
    );
    if (!ok) return;

    const r = await fetch("/api/despachos/detalle/terminar", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codppc, cododc })
    });

    if (onUnauthorized(r)) return;

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      showToast(j.msg || "Error al guardar despacho", "error");
      return;
    }

    window.location.href = "/despachos";
  });

  tablaBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-quitar");
    if (!btn) return;

    const codprod = (btn.dataset.codprod || "").replace(/\./g, "").trim();
    if (!codprod) return;

    const ok = await ask(`¿Resetear escaneo del producto ${codprod}?`, "Resetear escaneo", {
      yesText: "Resetear", noText: "Cancelar", danger: true
    });
    if (!ok) return;

    const r = await fetch("/api/despachos/detalle/reset", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codppc, cododc, codprod })
    });

    if (onUnauthorized(r)) return;

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      showToast(j.msg || "Error al resetear", "error");
      return;
    }

    for (const k of Array.from(etiquetasEscaneadas)) {
      if (k.startsWith(codprod + "|")) etiquetasEscaneadas.delete(k);
    }

    pintarTabla(j.detalle || []);
    focusScanner();
  });

  // =========================
  // Primera carga
  // =========================
  cargarCabecera();
  cargarDetalle();
  focusScanner();
});