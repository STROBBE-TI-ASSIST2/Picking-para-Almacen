from flask import Flask, render_template, url_for, redirect
from flask_jwt_extended import JWTManager, jwt_required
from .config import Config

def create_app():
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(Config)

    jwt = JWTManager(app)

    # ==========================
    # Blueprints (API)
    # ==========================
    from .auth.routes import auth_bp
    from .despachos.routes import despachos_bp
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(despachos_bp, url_prefix="/api/despachos")
    from flask import send_from_directory

    from flask import send_from_directory

    @app.get("/sw.js")
    def sw():
        return send_from_directory(app.static_folder, "static/sw.js")
    # ==========================
    # Manejo elegante cuando falta JWT (para VISTAS)
    # ==========================
    @jwt.unauthorized_loader
    def on_missing_jwt(reason):
        # Si intentan entrar a una vista protegida sin token -> login
        return redirect(url_for("login_view"))

    @jwt.invalid_token_loader
    def on_invalid_jwt(reason):
        return redirect(url_for("login_view"))

    @jwt.expired_token_loader
    def on_expired_jwt(jwt_header, jwt_payload):
        return redirect(url_for("login_view"))

    # ==========================
    # VISTAS (HTML)
    # ==========================
    @app.get("/login")
    def login_view():
        return render_template("auth/login.html")

    @app.get("/menu")
    @jwt_required()
    def menu_view():
        return render_template("menu/index.html")

    @app.get("/menu/logistico")
    @jwt_required()
    def menu_logistico_view():
        return render_template("menu/logistico.html")

    @app.get("/despachos")
    @jwt_required()
    def despachos_view():
        return render_template("despachos/preparacion_qr.html")


    @app.get("/")
    def index():
        return redirect(url_for("login_view"))

    return app
