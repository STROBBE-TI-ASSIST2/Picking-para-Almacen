from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from datetime import timedelta
from .service import autenticar_usuario

auth_bp = Blueprint("auth", __name__)

@auth_bp.post("/login")
def login():
    body = request.get_json() or {}
    username = body.get("username")
    password = body.get("password")

    if not username or not password:
        return jsonify({"msg": "Falta usuario o contraseña"}), 400

    user = autenticar_usuario(username, password)
    if not user:
        return jsonify({"msg": "Usuario o contraseña incorrectos"}), 401

    # identity principal del JWT
    access_token = create_access_token(
        identity=str(user["id_usuario"]),
        additional_claims={
            "username": user["username"],
            "area": user["area"],
            "cargo": user["cargo"],
            "codigo": user["codigo"],
        }
    )

    return jsonify({
        "access_token": access_token,
        "user": user
    }), 200