from flask import Blueprint, request, jsonify, render_template
from flask_jwt_extended import jwt_required
from .service import listar_despachos_sp, generar_detalle_si_no_existe,terminar_detalle,listar_detalle_tabla, actualizar_scan

despachos_bp = Blueprint("despachos", __name__)

@despachos_bp.get("/")
@jwt_required()
def listar():
    q = request.args

    fecha_desde = q.get("fecha_desde")  # '2025-08-01'
    fecha_hasta = q.get("fecha_hasta")  # '2025-11-30'
    page        = int(q.get("page", 1))
    page_size   = int(q.get("page_size", 20))

    # por ahora codcia/codsuc fijas '01' / '01'
    data, total = listar_despachos_sp(
        codcia="01",
        codsuc="01",
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        page=page,
        page_size=page_size
    )

    return jsonify({
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": data
    }), 200

@despachos_bp.post("/detalle/generar")
@jwt_required()
def generar_detalle():
    body = request.get_json() or {}
    codppc = body.get("codppc")
    cododc = body.get("cododc")

    if not codppc or not cododc:
        return jsonify({"msg": "Falta codppc o cododc"}), 400

    codcia = "01"
    codsuc = "01"

    detalle = generar_detalle_si_no_existe(codcia, codsuc, codppc, cododc)

    return jsonify({
        "msg": "Detalle listo (usando snapshot existente o SP)",
        "total": len(detalle),
        "detalle": detalle
    }), 200

@despachos_bp.post("/detalle/terminar")
@jwt_required()
def terminar():
    body = request.get_json() or {}
    codppc = body.get("codppc")
    cododc = body.get("cododc")

    if not codppc or not cododc:
        return jsonify({"msg": "Falta codppc o cododc"}), 400

    codcia = "01"
    codsuc = "01"

    terminar_detalle(codcia, codsuc, codppc, cododc)

    return jsonify({"msg": "Detalle eliminado (Terminado)"}), 200

@despachos_bp.get("/ver/<codppc>/<cododc>")
#@jwt_required()
def ver_detalle_html(codppc, cododc):
    return render_template("despacho_detalle.html",
                          codppc=codppc,
                          cododc=cododc)

@despachos_bp.get("/detalle/leer")
@jwt_required()
def leer_detalle():
    codppc = request.args.get("codppc")
    cododc = request.args.get("cododc")

    if not codppc or not cododc:
        return jsonify({"msg": "Falta codppc o cododc"}), 400

    codcia = "01"
    codsuc = "01"

    detalle = listar_detalle_tabla(codcia, codsuc, codppc, cododc)
    return jsonify({
        "detalle": detalle,
        "total": len(detalle)
    }), 200

#ESCANEO
@despachos_bp.post("/detalle/scan")
@jwt_required()
def scan_item():
    body = request.get_json() or {}

    codppc   = body.get("codppc")
    cododc   = body.get("cododc")
    codprod  = body.get("codprod")
    cantidad = body.get("cantidad", 1)

    if not codppc or not cododc or not codprod:
        return jsonify({"msg": "Datos incompletos"}), 400

    codcia = "01"
    codsuc = "01"

    try:
        cantidad = float(cantidad)
    except (TypeError, ValueError):
        return jsonify({"msg": "Cantidad inválida"}), 400

    filas, motivo = actualizar_scan(codcia, codsuc, codppc, cododc, codprod, cantidad)

    if motivo == "no_encontrado":
        return jsonify({
            "msg": f"No se encontró ítem para producto {codprod} en ese despacho."
        }), 404

    if motivo == "sobrepicking":
        return jsonify({
            "msg": "El escaneo excede la cantidad abastecida. No se permite sobrepicking."
        }), 400

    detalle = listar_detalle_tabla(codcia, codsuc, codppc, cododc)

    return jsonify({
        "msg": "OK",
        "detalle": detalle
    }), 200



