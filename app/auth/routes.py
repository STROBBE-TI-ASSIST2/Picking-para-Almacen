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

    access_token = create_access_token(
        identity=str(user["id_usuario"]),
        additional_claims={
            "username": user["username"],
            "area": user["area"],
            "cargo": user["cargo"],
            "codigo": user["codigo"],
        }
    )

    # ✅ Respuesta JSON normal
    resp = jsonify({
        "msg": "login ok",
        "user": user
        # Si quieres mantenerlo por compatibilidad:
        # "access_token": access_token
    })

    # ✅ CLAVE: setear JWT en cookie
    set_access_cookies(resp, access_token)

    return resp, 200


@auth_bp.post("/logout")
def logout():
    resp = jsonify({"msg": "logout ok"})
    unset_jwt_cookies(resp)
    return resp, 200
