from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, date
from sqlalchemy import text
from ..db import engine

def _fecha_a_periodo(fecha: str) -> str:
    """
    Convierte '2025-11-14' -> '202511' (formato yyyymm) para el SP.
    """
    if not fecha:
        return None
    dt = datetime.strptime(fecha, "%Y-%m-%d")
    return dt.strftime("%Y%m")

#LISTAR DESPACHOS
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
    - fecha_desde / fecha_hasta vienen del frontend como 'YYYY-MM-DD'
    - Si NO vienen, se usa por defecto un rango de 4 meses (incluyendo el mes actual)
    - Se convierten a per_ini / per_fin: 'yyyymm'
    - Paginamos en Python (el SP no tiene page/page_size).
    """

    if fecha_desde or fecha_hasta:
        # si el front envía fechas, usamos esas
        per_ini = _fecha_a_periodo(fecha_desde) if fecha_desde else None
        per_fin = _fecha_a_periodo(fecha_hasta) if fecha_hasta else None
    else:
        # si el front NO envía fechas -> últimos 4 meses por defecto
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

        # paginación en Python
        start = (page - 1) * page_size
        end = start + page_size
        data_page = data[start:end]

        conn.commit()
        return data_page, total
    finally:
        conn.close()

#LISTAR DETALLES DE DESPACHO
def listar_detalle_tabla(codcia, codsuc, codppc, cododc):
    """Lee el detalle desde la tabla PICKING_DETALLE."""
    with engine.begin() as conn:
        result = conn.execute(text("""
            SELECT *
            FROM dbo.PICKING_DETALLE
            WHERE CIA_CODCIA = :CIA_CODCIA
              AND SUC_CODSUC = :SUC_CODSUC
              AND PPC_NUMPPC = :PPC_NUMPPC
              AND ODC_NUMODC = :ODC_NUMODC
            ORDER BY ITEM
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
    1) Revisa si ya existe detalle en PICKING_DETALLE.
    2) Si existe -> solo lo lee y lo devuelve.
    3) Si NO existe -> llama al SP, inserta en PICKING_DETALLE y devuelve lo insertado.
    """
    # 1) ¿Ya existe?
    existente = listar_detalle_tabla(codcia, codsuc, codppc, cododc)
    if existente:
        return existente  # no borra nada, solo reutiliza

    # 2) No existe -> llamar SP
    data = listar_detalle_sp(codcia, codsuc, codppc, cododc)
    if not data:
        return []

    # 3) Insertar en tabla PICKING_DETALLE
    insert_sql = text("""
        INSERT INTO dbo.PICKING_DETALLE (
            CIA_CODCIA, SUC_CODSUC, PPC_NUMPPC, ODC_NUMODC,
            ITEM, It_D, L, Cod_Producto_Pedido,
            Descripcion_pedido, CodigoParte, UM,
            UE, Indica_Cierre, Cantidad_a_Despachar,
            Cantidd_abastecida, Caja, Peso_Neto,
            Cantidad_Scaneada, Diferencia
        )
        VALUES (
            :CIA_CODCIA, :SUC_CODSUC, :PPC_NUMPPC, :ODC_NUMODC,
            :ITEM, :It_D, :L, :Cod_Producto_Pedido,
            :Descripcion_pedido, :CodigoParte, :UM,
            :UE, :Indica_Cierre, :Cantidad_a_Despachar,
            :Cantidd_abastecida, :Caja, :Peso_Neto,
            :Cantidad_Scaneada, :Diferencia
        )
    """)

    # normalizar campos clave en cada fila
    for row in data:
        row["CIA_CODCIA"] = row.get("CIA_CODCIA", codcia)
        row["SUC_CODSUC"] = row.get("SUC_CODSUC", codsuc)
        row["PPC_NUMPPC"] = row.get("PPC_NUMPPC", codppc)
        row["ODC_NUMODC"] = row.get("ODC_NUMODC", cododc)

    with engine.begin() as conn:
        conn.execute(insert_sql, data)

    # leer lo que quedó
    return listar_detalle_tabla(codcia, codsuc, codppc, cododc)

def terminar_detalle(codcia, codsuc, codppc, cododc):
    """
    Borra SOLO el detalle de ese despacho de PICKING_DETALLE.
    Esto se llama al presionar el botón 'Terminado'.
    """
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

#ESCANEADO
def actualizar_scan(codcia, codsuc, codppc, cododc, codprod, cantidad_sumar):
    """
    Suma cantidad_sumar a Cantidad_Scaneada SIN permitir sobrepicking.
    Además, actualiza la columna ESTADO del despacho:
      - '1' si TODOS los ítems de ese PPC/ODC están completos,
      - '0' si aún hay pendientes.
    """
    with engine.begin() as conn:
        # 1) Leer situación actual del ítem
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

        # 2) Validar sobrepicking
        if nuevo_total > abastecida:
            return 0, "sobrepicking"

        # 3) Actualizar con el nuevo total de ese ítem
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

        # 4) Revisar si todavía hay ítems pendientes en ese despacho
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

        # 5) Actualizar ESTADO para todas las filas de ese despacho
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

#RANGO DE FECHAS POR DEFECTO 4MESES
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
    Devuelve (per_ini, per_fin) para los últimos 4 meses
    incluyendo el mes actual.
    Ej: hoy = 2025-11-19 -> per_ini='202508', per_fin='202511'
    """
    hoy = date.today()
    # periodo final: mes actual
    per_fin = hoy.strftime("%Y%m")

    # mes inicial: 3 meses atrás (4 meses en total contando el actual)
    mes_ini = hoy.month - 3
    anio_ini = hoy.year
    while mes_ini <= 0:
        mes_ini += 12
        anio_ini -= 1

    per_ini = f"{anio_ini}{mes_ini:02d}"
    return per_ini, per_fin
