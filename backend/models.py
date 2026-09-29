from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default="customer")
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    def set_password(self, p): self.password_hash = generate_password_hash(p)
    def check_password(self, p): return check_password_hash(self.password_hash, p)
    def to_dict(self):
        return dict(id=self.id, name=self.name, email=self.email, role=self.role,
                    active=self.active, created_at=self.created_at.isoformat())

class Platform(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(60), unique=True, nullable=False)
    category = db.Column(db.String(30))          # grocery | marketplace | fashion | brand
    url = db.Column(db.String(255))
    search_url = db.Column(db.String(500))       # {q} placeholder
    source_match = db.Column(db.String(200), default="")  # keywords matched against live API "source"
    color = db.Column(db.String(9), default="#334155")
    delivery_fee = db.Column(db.Float, default=0)
    free_delivery_above = db.Column(db.Float, default=0)  # 0 = never free
    delivery_time = db.Column(db.String(40), default="2-4 days")
    price_factor = db.Column(db.Float, default=1.0)       # used for estimated prices
    enabled = db.Column(db.Boolean, default=True)
    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

class SearchLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    term = db.Column(db.String(200))
    user_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class PriceCache(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(200), unique=True, index=True)
    payload = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
