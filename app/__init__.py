from flask import Flask, render_template, url_for, redirect
from flask_jwt_extended import JWTManager
from .config import Config

def create_app():
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(Config)

    JWTManager(app)

    # Blueprints
    from .auth.routes import auth_bp
    from .despachos.routes import despachos_bp
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(despachos_bp, url_prefix="/api/despachos")

    @app.get("/login")
    def login_view():
        return render_template("login.html")

    @app.get("/despachos")
    def home():
        return render_template("despachos.html")

    @app.get("/")
    def index():
        return redirect(url_for("login_view"))

    return app
