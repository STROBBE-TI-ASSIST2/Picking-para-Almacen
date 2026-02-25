from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, date
from sqlalchemy import text
from ..db import engine

from datetime import datetime
from sqlalchemy import text
from ..db import engine
from datetime import datetime
from typing import Optional
from sqlalchemy import text
from ..db import engine
# =========================================================
# Helpers fechas
# =========================================================
from sqlalchemy import text
from ..db import engine

def tiene_inicio(codcia, codsuc, codppc, cododc) -> bool:
    with engine.begin() as conn:
        inicio = conn.execute(text("""
            SELECT inicio_dt
            FROM dbo.PICKING_ASIGNACION
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc}).scalar()

        return inicio is not None

def _fecha_a_periodo(fecha: str) -> Optional[str]:
    """
    Convierte '2025-11-14' -> '202511' (formato yyyymm) para el SP.
    """
    if not fecha:
        return None
    dt = datetime.strptime(fecha, "%Y-%m-%d")
    return dt.strftime("%Y%m")


def _periodos_por_defecto_4_meses() -> Tuple[str, str]:
    """
    Devuelve (per_ini, per_fin) para los últimos 4 meses incluyendo el mes actual.
    """
    hoy = date.today()
    per_fin = hoy.strftime("%Y%m")

    mes_ini = hoy.month - 3
    anio_ini = hoy.year
    while mes_ini <= 0:
        mes_ini += 12
        anio_ini -= 1

    per_ini = f"{anio_ini}{mes_ini:02d}"
    return per_ini, per_fin


# =========================================================
# LISTAR DESPACHOS (SP)
# =========================================================
def listar_despachos_sp(
    codcia: str = "01",
    codsuc: str = "01",
    fecha_desde: str = None,   # '2025-08-01'
    fecha_hasta: str = None,   # '2025-11-30'
    page: int = 1,
    page_size: int = 20
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Llama a pa_Preparacion_Despacho_Local_por_atender usando periodos yyyymm.
    Paginamos en Python (el SP no tiene page/page_size).
    """

    if fecha_desde or fecha_hasta:
        per_ini = _fecha_a_periodo(fecha_desde) if fecha_desde else None
        per_fin = _fecha_a_periodo(fecha_hasta) if fecha_hasta else None
    else:
        per_ini, per_fin = _periodos_por_defecto_4_meses()

    conn = engine.raw_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            EXEC pa_Preparacion_Despacho_Local_por_atender
                 @codcia=?,
                 @codsuc=?,
                 @perini=?,
                 @perfin=?
        """, (codcia, codsuc, per_ini, per_fin))

        cols = [c[0] for c in cur.description]
        rows = cur.fetchall()
        data = [dict(zip(cols, r)) for r in rows]

        total = len(data)

        start = (page - 1) * page_size
        end = start + page_size
        data_page = data[start:end]

        conn.commit()
        return data_page, total
    finally:
        conn.close()


# =========================================================
# DETALLE
# =========================================================
def listar_detalle_tabla(codcia, codsuc, codppc, cododc):
    """
    Lee el detalle desde:
    - PICKING_HISTORICO si ya está finalizado (fin_dt NOT NULL),
    - caso contrario desde PICKING_DETALLE.
    """
    if esta_finalizado(codcia, codsuc, codppc, cododc):
        return listar_detalle_historico(codcia, codsuc, codppc, cododc)

    # Activo: tabla detalle
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT *
            FROM dbo.PICKING_DETALLE
            WHERE CIA_CODCIA = :CIA_CODCIA
              AND SUC_CODSUC = :SUC_CODSUC
              AND PPC_NUMPPC = :PPC_NUMPPC
              AND ODC_NUMODC = :ODC_NUMODC
            ORDER BY Ubicacion ASC
        """), {
            "CIA_CODCIA": codcia,
            "SUC_CODSUC": codsuc,
            "PPC_NUMPPC": codppc,
            "ODC_NUMODC": cododc,
        })
        cols = result.keys()
        rows = result.fetchall()
        return [dict(zip(cols, r)) for r in rows]



def listar_detalle_sp(codcia, codsuc, codppc, cododc):
    """Llama al SP detalle y devuelve la lista de dicts."""
    conn = engine.raw_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            EXEC dbo.pa_Preparacion_Despacho_Local_por_atender_detalle
                @codcia=?,
                @codsuc=?,
                @codppc=?,
                @cododc=?
        """, (codcia, codsuc, codppc, cododc))

        cols = [c[0] for c in cur.description]
        rows = cur.fetchall()
        data = [dict(zip(cols, r)) for r in rows]

        conn.commit()
        return data
    finally:
        conn.close()


def generar_detalle_si_no_existe(codcia, codsuc, codppc, cododc):
    """
    Si ya finalizó: retornar histórico y NO volver a generar detalle.
    Si está activo:
      - si existe detalle -> devolverlo
      - si no existe -> generar desde SP e insertar
    """
    # ✅ Si ya está finalizado, siempre servir histórico
    if esta_finalizado(codcia, codsuc, codppc, cododc):
        return listar_detalle_historico(codcia, codsuc, codppc, cododc)

    existente = listar_detalle_tabla(codcia, codsuc, codppc, cododc)
    if existente:
        return existente

    data = listar_detalle_sp(codcia, codsuc, codppc, cododc)
    if not data:
        return []

    insert_sql = text("""
        INSERT INTO dbo.PICKING_DETALLE (
            CIA_CODCIA, SUC_CODSUC, PPC_NUMPPC, ODC_NUMODC,
            ITEM, It_D, L, Cod_Producto_Pedido,
            Descripcion_pedido, CodigoParte, UM,
            UE, Indica_Cierre, Cantidad_a_Despachar,
            Cantidd_abastecida, Caja, Peso_Neto,
            Cantidad_Scaneada, Diferencia,Ubicacion
        )
        VALUES (
            :CIA_CODCIA, :SUC_CODSUC, :PPC_NUMPPC, :ODC_NUMODC,
            :ITEM, :It_D, :L, :Cod_Producto_Pedido,
            :Descripcion_pedido, :CodigoParte, :UM,
            :UE, :Indica_Cierre, :Cantidad_a_Despachar,
            :Cantidd_abastecida, :Caja, :Peso_Neto,
            :Cantidad_Scaneada, :Diferencia,:Ubicacion
        )
    """)

    for row in data:
        row["CIA_CODCIA"] = row.get("CIA_CODCIA", codcia)
        row["SUC_CODSUC"] = row.get("SUC_CODSUC", codsuc)
        row["PPC_NUMPPC"] = row.get("PPC_NUMPPC", codppc)
        row["ODC_NUMODC"] = row.get("ODC_NUMODC", cododc)


    with engine.begin() as conn:
        conn.execute(insert_sql, data)

    return listar_detalle_tabla(codcia, codsuc, codppc, cododc)


def terminar_detalle(codcia, codsuc, codppc, cododc):
    """Borra SOLO el detalle de ese despacho de PICKING_DETALLE."""
    with engine.begin() as conn:
        conn.execute(text("""
            DELETE FROM dbo.PICKING_DETALLE
            WHERE CIA_CODCIA = :CIA_CODCIA
              AND SUC_CODSUC = :SUC_CODSUC
              AND PPC_NUMPPC = :PPC_NUMPPC
              AND ODC_NUMODC = :ODC_NUMODC
        """), {
            "CIA_CODCIA": codcia,
            "SUC_CODSUC": codsuc,
            "PPC_NUMPPC": codppc,
            "ODC_NUMODC": cododc,
        })


# =========================================================
# ESCANEO (ya lo tenías)
# =========================================================
def actualizar_scan(codcia, codsuc, codppc, cododc, codprod, cantidad_sumar):
    """
    Suma cantidad_sumar a Cantidad_Scaneada SIN permitir sobrepicking.
    Además, actualiza ESTADO:
      - '1' si completo,
      - '0' si pendiente.
    """
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT Cantidad_Scaneada, Cantidd_abastecida
            FROM PICKING_DETALLE
            WHERE CIA_CODCIA = :cia
              AND SUC_CODSUC = :suc
              AND PPC_NUMPPC = :ppc
              AND ODC_NUMODC = :odc
              AND Cod_Producto_Pedido = :codprod
        """), {
            "cia": codcia,
            "suc": codsuc,
            "ppc": codppc,
            "odc": cododc,
            "codprod": codprod,
        }).mappings().first()

        if not row:
            return 0, "no_encontrado"

        actual_raw     = row["Cantidad_Scaneada"]
        abastecida_raw = row["Cantidd_abastecida"]

        actual     = float(actual_raw) if actual_raw is not None else 0.0
        abastecida = float(abastecida_raw) if abastecida_raw is not None else 0.0
        cantidad   = float(cantidad_sumar)

        nuevo_total = actual + cantidad

        if nuevo_total > abastecida:
            return 0, "sobrepicking"

        conn.execute(text("""
            UPDATE PICKING_DETALLE
            SET 
                Cantidad_Scaneada = :nuevo,
                Diferencia = :nuevo - ISNULL(Cantidd_abastecida, 0)
            WHERE CIA_CODCIA = :cia
              AND SUC_CODSUC = :suc
              AND PPC_NUMPPC = :ppc
              AND ODC_NUMODC = :odc
              AND Cod_Producto_Pedido = :codprod
        """), {
            "nuevo": nuevo_total,
            "cia": codcia,
            "suc": codsuc,
            "ppc": codppc,
            "odc": cododc,
            "codprod": codprod,
        })

        pendientes = conn.execute(text("""
            SELECT COUNT(*) AS pendientes
            FROM PICKING_DETALLE
            WHERE CIA_CODCIA = :cia
              AND SUC_CODSUC = :suc
              AND PPC_NUMPPC = :ppc
              AND ODC_NUMODC = :odc
              AND ISNULL(Cantidad_Scaneada,0) < ISNULL(Cantidd_abastecida,0)
        """), {
            "cia": codcia,
            "suc": codsuc,
            "ppc": codppc,
            "odc": cododc,
        }).scalar()

        nuevo_estado = '1' if pendientes == 0 else '0'

        conn.execute(text("""
            UPDATE PICKING_DETALLE
            SET ESTADO = :estado
            WHERE CIA_CODCIA = :cia
              AND SUC_CODSUC = :suc
              AND PPC_NUMPPC = :ppc
              AND ODC_NUMODC = :odc
        """), {
            "estado": nuevo_estado,
            "cia": codcia,
            "suc": codsuc,
            "ppc": codppc,
            "odc": cododc,
        })

        return 1, "ok"


def obtener_cabecera_pedido(
    codcia, codsuc, codppc, cododc,
    usuario_id: Optional[str] = None   # 👈 nuevo
) -> Optional[Dict[str, Any]]:

    data, _ = listar_despachos_sp(
        codcia=codcia, codsuc=codsuc,
        fecha_desde=None, fecha_hasta=None,
        page=1, page_size=5000
    )

    fila = None
    for r in data:
        if str(r.get("ppc_numppc", "")).strip() == str(codppc).strip() and \
           str(r.get("odc_numodc", "")).strip() == str(cododc).strip():
            fila = r
            break

    if not fila:
        return None

    cab = {
        "nroPedido": fila.get("ppc_numppc", codppc),
        "nroOD": fila.get("odc_numodc", cododc),

        # ✅ tu fecha (fallbacks por si cambia el SP)
        "fechaDoc": (
            fila.get("ppc_fecdoc")
            or fila.get("PPC_FECDOC")
            or fila.get("FPedido")
            or fila.get("fpedido")
            or fila.get("pdd_horini")
            or fila.get("PDD_HORINI")
            or ""
        ),

        "cliente": fila.get("aux_nomaux", ""),
        "obs": fila.get("ppc_obsped", ""),
        "direccion": fila.get("dir_Despacho", ""),
        "estadoTxt": fila.get("c_sit_orddes", ""),
        "nroOrden": fila.get("ppc_ordcom", "")
    }

    # ✅ traer asignación real de tu tabla
    asi = obtener_asignacion(codcia, codsuc, codppc, cododc)

    # =========================================================
    # ✅ AUTO-LLENAR REGISTRADO POR (usuario logueado)
    # =========================================================
    registrado_cod = (asi.get("registrado_cod") or "").strip()

    # normalizar usuario_id (por si viene dict desde JWT)
    uid = usuario_id
    if isinstance(uid, dict):
        # ajusta la key según tu login (id, cod, username, etc.)
        uid = uid.get("id") or uid.get("cod") or uid.get("usuario") or uid.get("aux_codaux")

    uid = (str(uid).strip() if uid is not None else "")

    if (not registrado_cod) and uid:
        reg_nom = obtener_nombre_usuario_erp(codcia, uid) or uid

        with engine.begin() as conn:
            # 1) asegura fila
            conn.execute(text("""
                MERGE dbo.PICKING_ASIGNACION AS T
                USING (SELECT :cia CIA_CODCIA, :suc SUC_CODSUC, :ppc PPC_NUMPPC, :odc ODC_NUMODC) S
                ON (T.CIA_CODCIA=S.CIA_CODCIA AND T.SUC_CODSUC=S.SUC_CODSUC
                    AND T.PPC_NUMPPC=S.PPC_NUMPPC AND T.ODC_NUMODC=S.ODC_NUMODC)
                WHEN NOT MATCHED THEN
                  INSERT (CIA_CODCIA, SUC_CODSUC, PPC_NUMPPC, ODC_NUMODC, updated_at)
                  VALUES (:cia, :suc, :ppc, :odc, GETDATE());
            """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc})

            # 2) setear solo si está vacío
            conn.execute(text("""
                UPDATE dbo.PICKING_ASIGNACION
                SET registrado_cod = :reg_cod,
                    registrado_nom = :reg_nom,
                    updated_at = GETDATE()
                WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
                  AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
                  AND (registrado_cod IS NULL OR LTRIM(RTRIM(registrado_cod)) = '')
            """), {
                "cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc,
                "reg_cod": uid, "reg_nom": reg_nom
            })

        # refrescar
        asi = obtener_asignacion(codcia, codsuc, codppc, cododc)

    cab.update({
        "registradoPor": asi.get("registrado_nom") or "-",
        "preparadoPor":  asi.get("preparado_nom")  or "-",
        "preparado_cod": asi.get("preparado_cod"),
        "inicio_dt":     asi.get("inicio_dt"),
        "fin_dt":        asi.get("fin_dt"),
        "tprep_min":     asi.get("tprep_min"),
        "tiempoPrep":    (f'{asi.get("tprep_min")} min' if asi.get("tprep_min") is not None else "-")
    })
    return cab

from sqlalchemy import text
from ..db import engine

def listar_usuarios_preparacion(codcia="01"):
    with engine.begin() as conn:
        r = conn.execute(text("""
            SELECT
              a.aux_codaux AS CODIGO,
              LEFT(a.aux_nomaux, 60) AS NOMBRE
            FROM STROBBE_V13.dbo.V_Auxiliares a
            WHERE a.cia_codcia = :codcia
              AND a.aux_indest = '1'
              AND a.aux_indemp = '1'
              AND a.aux_codaux IN (
                  SELECT x.aux_codaux
                  FROM STROBBE_V13.dbo.TRABAJADOR_USUARIO_TRU x
                  WHERE x.cia_codcia = :codcia
                    AND x.tru_predes = 1
              )
            ORDER BY LEFT(a.aux_nomaux, 60)
        """), {"codcia": codcia})

        return [dict(row) for row in r.mappings()]

def _fmt_hhmmss(segundos: int) -> str:
    if segundos is None:
        return None
    h = segundos // 3600
    m = (segundos % 3600) // 60
    s = segundos % 60
    return f"{h:02d}:{m:02d}:{s:02d}"

def _upsert_base_asignacion(conn, codcia, codsuc, codppc, cododc):
    # asegura que exista la fila en PICKING_ASIGNACION
    conn.execute(text("""
        MERGE dbo.PICKING_ASIGNACION AS T
        USING (SELECT :cia AS CIA_CODCIA, :suc AS SUC_CODSUC, :ppc AS PPC_NUMPPC, :odc AS ODC_NUMODC) AS S
        ON (T.CIA_CODCIA=S.CIA_CODCIA AND T.SUC_CODSUC=S.SUC_CODSUC AND T.PPC_NUMPPC=S.PPC_NUMPPC AND T.ODC_NUMODC=S.ODC_NUMODC)
        WHEN NOT MATCHED THEN
          INSERT (CIA_CODCIA, SUC_CODSUC, PPC_NUMPPC, ODC_NUMODC)
          VALUES (:cia, :suc, :ppc, :odc);
    """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc})


def marcar_inicio_preparacion(codcia, codsuc, codppc, cododc):
    with engine.begin() as conn:
        # 1) asegurar fila base (como ya haces)
        conn.execute(text("""
            MERGE dbo.PICKING_ASIGNACION AS T
            USING (SELECT :cia CIA_CODCIA, :suc SUC_CODSUC, :ppc PPC_NUMPPC, :odc ODC_NUMODC) S
            ON (T.CIA_CODCIA=S.CIA_CODCIA AND T.SUC_CODSUC=S.SUC_CODSUC
                AND T.PPC_NUMPPC=S.PPC_NUMPPC AND T.ODC_NUMODC=S.ODC_NUMODC)
            WHEN NOT MATCHED THEN
              INSERT (CIA_CODCIA, SUC_CODSUC, PPC_NUMPPC, ODC_NUMODC, updated_at)
              VALUES (:cia, :suc, :ppc, :odc, GETDATE());
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc})

        # 2) ✅ VALIDAR preparado_cod
        preparado_cod = conn.execute(text("""
            SELECT NULLIF(LTRIM(RTRIM(preparado_cod)), '') AS preparado_cod
            FROM dbo.PICKING_ASIGNACION
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc}).scalar()

        if not preparado_cod:
            # 👇 importante: NO actualiza inicio_dt
            return {"ok": False, "msg": "Debe seleccionar PREPARADO POR antes de iniciar."}

        # 3) actualizar inicio (solo si pasó validación)
        conn.execute(text("""
            UPDATE dbo.PICKING_ASIGNACION
            SET inicio_dt = GETDATE(),
                fin_dt = NULL,
                tprep_min = NULL,
                updated_at = GETDATE()
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc})

        return {"ok": True, "msg": "Inicio OK"}




'''def marcar_fin_preparacion(codcia, codsuc, codppc, cododc):
    with engine.begin() as conn:

        # ✅ 1) validar pendientes
        pendientes = conn.execute(text("""
            SELECT COUNT(*) AS pendientes
            FROM dbo.PICKING_DETALLE
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
              AND ISNULL(Cantidad_Scaneada,0) <> ISNULL(Cantidd_abastecida,0)
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc}).scalar()

        if pendientes and int(pendientes) > 0:
            return {"ok": False, "msg": f"No se puede finalizar: faltan {pendientes} ítems por completar."}

        # ✅ 2) validar inicio existe (tu lógica actual)
        row = conn.execute(text("""
            SELECT inicio_dt
            FROM dbo.PICKING_ASIGNACION
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc}).mappings().first()

        if not row or row["inicio_dt"] is None:
            return {"ok": False, "msg": "No existe inicio", "tprep_min": None}

        # ✅ 3) finalizar y calcular tiempo
        conn.execute(text("""
            UPDATE dbo.PICKING_ASIGNACION
            SET fin_dt = GETDATE(),
                tprep_min = CAST(DATEDIFF(SECOND, inicio_dt, GETDATE()) / 60.0 AS DECIMAL(10,2)),
                updated_at = GETDATE()
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc})

        mins = conn.execute(text("""
            SELECT tprep_min
            FROM dbo.PICKING_ASIGNACION
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc}).scalar()

        return {"ok": True, "msg": "Fin OK", "tprep_min": mins}
'''
def marcar_fin_preparacion(codcia, codsuc, codppc, cododc):
    with engine.begin() as conn:

        pendientes = conn.execute(text("""
            SELECT COUNT(*) AS pendientes
            FROM dbo.PICKING_DETALLE
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
              AND ISNULL(Cantidad_Scaneada,0) <> ISNULL(Cantidd_abastecida,0)
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc}).scalar()

        if pendientes and int(pendientes) > 0:
            return {"ok": False, "msg": f"No se puede finalizar: faltan {pendientes} ítems por completar."}

        row = conn.execute(text("""
            SELECT inicio_dt
            FROM dbo.PICKING_ASIGNACION
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc}).mappings().first()

        if not row or row["inicio_dt"] is None:
            return {"ok": False, "msg": "No existe inicio"}

        res = conn.execute(text("""
            UPDATE dbo.PICKING_ASIGNACION
            SET fin_dt = GETDATE(),
                tprep_min = CAST(DATEDIFF(SECOND, inicio_dt, GETDATE()) / 60.0 AS DECIMAL(10,2)),
                updated_at = GETDATE()
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc})

        if res.rowcount == 0:
            return {"ok": False, "msg": "FIN no actualizó nada (rowcount=0). Revisa CIA/SUC/PPC/ODC."}

        cab = conn.execute(text("""
            SELECT fin_dt, tprep_min
            FROM dbo.PICKING_ASIGNACION
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc}).mappings().first()

        return {"ok": True, "msg": "Fin OK", "fin_dt": cab["fin_dt"], "tprep_min": cab["tprep_min"]}

def _fmt_dt_lima(dt) -> Optional[str]:
    """Convierte datetime -> 'YYYY-MM-DD HH:MM:SS' (hora tal cual viene de SQL Server)."""
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    return str(dt)

def obtener_asignacion(codcia, codsuc, codppc, cododc):
    with engine.begin() as conn:
        r = conn.execute(text("""
            SELECT
              registrado_cod, registrado_nom,
              preparado_cod,  preparado_nom,
              inicio_dt, fin_dt, tprep_min
            FROM dbo.PICKING_ASIGNACION
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
        """), {
            "cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc
        }).mappings().first()

        if not r:
            return {}

        d = dict(r)
        d["inicio_dt"] = _fmt_dt_lima(d.get("inicio_dt"))
        d["fin_dt"]    = _fmt_dt_lima(d.get("fin_dt"))
        return d


def obtener_nombre_usuario_erp(codcia, codaux):
    """
    Devuelve el nombre del usuario desde el ERP (STROBBE_V13)
    usando aux_codaux.
    """
    if not codaux:
        return None

    with engine.begin() as conn:
        r = conn.execute(text("""
            SELECT TOP 1 LEFT(a.aux_nomaux, 60) AS NOMBRE
            FROM STROBBE_V13.dbo.V_Auxiliares a
            WHERE a.cia_codcia = :codcia
              AND a.aux_codaux = :codaux
        """), {
            "codcia": codcia,
            "codaux": codaux
        }).mappings().first()

        return r["NOMBRE"] if r else None

def asignar_usuarios_preparacion(
    codcia,
    codsuc,
    codppc,
    cododc,
    registrado_id=None,
    preparado_id=None
):
    """
    Guarda REGISTRADO POR y/o PREPARADO POR
    en la tabla PICKING_ASIGNACION.
    """

    registrado_nom = obtener_nombre_usuario_erp(codcia, registrado_id)
    preparado_nom  = obtener_nombre_usuario_erp(codcia, preparado_id)

    with engine.begin() as conn:
        conn.execute(text("""
            MERGE dbo.PICKING_ASIGNACION AS T
            USING (
                SELECT
                    :cia  AS CIA_CODCIA,
                    :suc  AS SUC_CODSUC,
                    :ppc  AS PPC_NUMPPC,
                    :odc  AS ODC_NUMODC
            ) AS S
            ON (
                T.CIA_CODCIA = S.CIA_CODCIA AND
                T.SUC_CODSUC = S.SUC_CODSUC AND
                T.PPC_NUMPPC = S.PPC_NUMPPC AND
                T.ODC_NUMODC = S.ODC_NUMODC
            )
            WHEN MATCHED THEN
                UPDATE SET
                    registrado_cod = COALESCE(:reg_cod, T.registrado_cod),
                    registrado_nom = COALESCE(:reg_nom, T.registrado_nom),
                    preparado_cod  = COALESCE(:pre_cod, T.preparado_cod),
                    preparado_nom  = COALESCE(:pre_nom, T.preparado_nom),
                    updated_at     = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (
                    CIA_CODCIA, SUC_CODSUC, PPC_NUMPPC, ODC_NUMODC,
                    registrado_cod, registrado_nom,
                    preparado_cod, preparado_nom,
                    updated_at
                )
                VALUES (
                    :cia, :suc, :ppc, :odc,
                    :reg_cod, :reg_nom,
                    :pre_cod, :pre_nom,
                    GETDATE()
                );
        """), {
            "cia": codcia,
            "suc": codsuc,
            "ppc": codppc,
            "odc": cododc,
            "reg_cod": registrado_id,
            "reg_nom": registrado_nom,
            "pre_cod": preparado_id,
            "pre_nom": preparado_nom
        })

        # Devolver lo que quedó guardado
        row = conn.execute(text("""
            SELECT registrado_nom, preparado_nom
            FROM dbo.PICKING_ASIGNACION
            WHERE CIA_CODCIA=:cia
              AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc
              AND ODC_NUMODC=:odc
        """), {
            "cia": codcia,
            "suc": codsuc,
            "ppc": codppc,
            "odc": cododc
        }).mappings().first()

    return {
        "registradoPor": row["registrado_nom"] if row else None,
        "preparadoPor": row["preparado_nom"] if row else None
    }

def esta_finalizado(codcia, codsuc, codppc, cododc) -> bool:
    with engine.begin() as conn:
        fin = conn.execute(text("""
            SELECT fin_dt
            FROM dbo.PICKING_ASIGNACION
            WHERE CIA_CODCIA=:cia AND SUC_CODSUC=:suc
              AND PPC_NUMPPC=:ppc AND ODC_NUMODC=:odc
        """), {"cia": codcia, "suc": codsuc, "ppc": codppc, "odc": cododc}).scalar()
        return fin is not None

def listar_detalle_historico(codcia, codsuc, codppc, cododc):
    """Lee el detalle desde la tabla PICKING_HISTORICO."""
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT *
            FROM dbo.PICKING_HISTORICO
            WHERE CIA_CODCIA = :CIA_CODCIA
              AND SUC_CODSUC = :SUC_CODSUC
              AND PPC_NUMPPC = :PPC_NUMPPC
              AND ODC_NUMODC = :ODC_NUMODC
            ORDER BY Ubicacion ASC, ITEM ASC
        """), {
            "CIA_CODCIA": codcia,
            "SUC_CODSUC": codsuc,
            "PPC_NUMPPC": codppc,
            "ODC_NUMODC": cododc,
        })
        cols = result.keys()
        rows = result.fetchall()
        return [dict(zip(cols, r)) for r in rows]
