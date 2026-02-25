from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    set_access_cookies,
    unset_jwt_cookies
)
from .service import autenticar_usuario

auth_bp = Blueprint("auth", __name__)

@auth_bp.post("/login")
def login():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = (body.get("password") or "").strip()

    if not username or not password:
        return jsonify({"msg": "Falta usuario o contraseña"}), 400

    user = autenticar_usuario(username, password)
    if not user:
        return jsonify({"msg": "Usuario o contraseña incorrectos"}), 401

    # ✅ Mantener identity simple (string) para no romper otros lugares
    # Lo ideal: usar el codigo ERP (AUXCODAUX) si existe
    identity = str(user.get("codigo") or user.get("id_usuario") or user.get("username") or "")

    access_token = create_access_token(
        identity=identity,
        additional_claims={
            "username": user.get("username") or "",
            "nombre": user.get("nombre") or "",
            "codigo": user.get("codigo") or "",

            # opcionales (si no existen, no rompen)
            "area": user.get("area") or "",
            "cargo": user.get("cargo") or "",
        }
    )

    resp = jsonify({
        "msg": "login ok",
        "user": user
    })

    set_access_cookies(resp, access_token)
    return resp, 200


@auth_bp.post("/logout")
def logout():
    resp = jsonify({"msg": "logout ok"})
    unset_jwt_cookies(resp)
    return resp, 200
