document.addEventListener("DOMContentLoaded", () => {
  // Tomamos los códigos desde los data-atributos del <main>
  const container = document.querySelector("main.container");
  const codppc = container.dataset.codppc;
  const cododc = container.dataset.cododc;

  const tbody = document.querySelector("#tablaDetalle tbody");
  const titulo = document.querySelector("#detalleTitulo");
  const scanInput = document.querySelector("#scanInput");
  const btnTerminado = document.querySelector("#btnTerminado"); // opcional, si lo agregas en el HTML

  // 💾 Memoria temporal de etiquetas: producto + etiqueta, solo mientras dure este detalle
  // Ejemplo de clave: "3021301212|0002"
  const etiquetasEscaneadas = new Set();

  if (scanInput) {
    scanInput.focus();        // así el lector escribe ahí aunque no se vea
  }

  function renderDetalle(items) {
    if (!items || !items.length) {
      tbody.innerHTML = `<tr><td colspan="10">Sin detalle</td></tr>`;
      return;
    }
    tbody.innerHTML = "";
    items.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.ITEM ?? ""}</td>
        <td>${row.Cod_Producto_Pedido ?? ""}</td>
        <td>${row.Descripcion_pedido ?? ""}</td>
        <td>${row.CodigoParte ?? ""}</td>
        <td>${row.UM ?? ""}</td>
        <td>${row.UE ?? ""}</td>
        <td>${row.Cantidad_a_Despachar ?? ""}</td>
        <td>${row.Cantidd_abastecida ?? ""}</td>
        <td>${row.Cantidad_Scaneada ?? ""}</td>
        <td>${row.Diferencia ?? ""}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function cargarDetalle() {
    const token = localStorage.getItem("token");
    if (!token) {
      location.href = "/login";
      return;
    }

    const params = new URLSearchParams({ codppc, cododc });
    const r = await fetch(`/api/despachos/detalle/leer?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const j = await r.json();
    if (!r.ok) {
      alert(j.msg || "Error al leer detalle");
      return;
    }
    renderDetalle(j.detalle);
  }

  // Escuchar el escaneo (lector QR suele enviar Enter al final)
  if (scanInput) {
    scanInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const raw = scanInput.value.trim();
        scanInput.value = "";
        if (raw) {
          procesarQR(raw);
        }
      }
    });
  }

  async function procesarQR(raw) {
    // Ejemplo raw:
    // "2025-09-23|L125090586|RESEMIN S.A.|30.21.30.1212|3.00|ADAPTADOR ...|202411H0171|0002|S|"
    const partes = raw.split("|");
    if (partes.length < 8) {
      alert("QR inválido");
      return;
    }

    const fecha       = partes[0];              // 2025-09-23 (no usado por ahora)
    const ppcQr       = partes[1];              // L125090586
    const cliente     = partes[2];              // RESEMIN S.A.
    const codprodRaw  = partes[3];              // 30.21.30.1212
    const cantStr     = partes[4];              // 3.00
    const descripcion = partes[5] || "";        // ADAPTADOR ...
    const lote        = partes[6];              // 202411H0171
    const etiqueta    = partes[7];              // 0002  👈 etiqueta única del bulto

    // Normalizar código de producto: quitar puntos
    const codprod = codprodRaw.replace(/\./g, "");

    const cantidad = parseFloat(cantStr.replace(",", "."));
    if (isNaN(cantidad)) {
      alert("Cantidad inválida en QR");
      return;
    }

    // Opcional: validar que el PPC del QR coincida con el de la pantalla
    if (ppcQr && ppcQr !== codppc) {
      if (!confirm(`El QR es del despacho ${ppcQr}, pero estás en ${codppc}. ¿Continuar?`)) {
        return;
      }
    }

    // 🛑 Validar etiqueta duplicada para este PRODUCTO en este DESPACHO
    const claveEtiqueta = `${codprod}|${etiqueta}`;
    if (etiquetasEscaneadas.has(claveEtiqueta)) {
      alert(`La etiqueta ${etiqueta} para el producto ${codprod} ya fue escaneada.`);
      return;
    }

    // Registrar en memoria que esta etiqueta ya fue usada
    etiquetasEscaneadas.add(claveEtiqueta);

    const token = localStorage.getItem("token");
    if (!token) {
      location.href = "/login";
      return;
    }

    const r = await fetch("/api/despachos/detalle/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        codppc,
        cododc,
        codprod,
        cantidad
      })
    });

    const j = await r.json();
    if (!r.ok) {
      // si backend rechazó (ej: sobrepicking), liberamos la etiqueta del Set
      etiquetasEscaneadas.delete(claveEtiqueta);
      alert(j.msg || "Error al actualizar escaneo");
      return;
    }

    // refrescar tabla con el detalle actualizado
    renderDetalle(j.detalle);
  }

  // ✅ Botón TERMINADO en la pantalla de DETALLE (si lo agregas en el HTML)
  if (btnTerminado) {
    btnTerminado.addEventListener("click", async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        location.href = "/login";
        return;
      }

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

      // 🧽 Limpiar memoria temporal de etiquetas
      etiquetasEscaneadas.clear();

      alert("Detalle eliminado para MPC " + codppc);
      // Redirigir a la lista de despachos
      window.location.href = "/despachos";  // ajusta si tu ruta es otra
    });
  }

  cargarDetalle();
});
