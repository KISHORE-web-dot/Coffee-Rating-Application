from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./coffee.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Coffee(Base):
    __tablename__ = "coffees"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(100), nullable=False)
    origin      = Column(String(100), default="")
    roast       = Column(String(50), default="Medium")    # Light / Medium / Dark / Espresso
    description = Column(Text, default="")
    emoji       = Column(String(10), default="☕")
    price       = Column(Float, default=0.0)
    votes       = Column(Integer, default=0)              # ← core vote counter
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow)


def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if db.query(Coffee).count() == 0:
        seed = [
            Coffee(name="Ethiopian Yirgacheffe", origin="Ethiopia",       roast="Light",    emoji="🌿", price=5.50, description="Bright, fruity and floral with notes of jasmine and blueberry. A delicate single-origin experience."),
            Coffee(name="Colombian Supremo",      origin="Colombia",       roast="Medium",   emoji="☕", price=4.75, description="Smooth and well-balanced with hints of caramel, nuts and a clean finish."),
            Coffee(name="Sumatra Mandheling",     origin="Indonesia",      roast="Dark",     emoji="🌑", price=5.00, description="Full-bodied, earthy and rich with low acidity and a lingering chocolate finish."),
            Coffee(name="Espresso Classico",      origin="Italy (Blend)",  roast="Espresso", emoji="⚡", price=3.50, description="Intense, velvety crema with bittersweet dark chocolate and a bold caffeine punch."),
            Coffee(name="Guatemala Antigua",      origin="Guatemala",      roast="Medium",   emoji="🏔️", price=4.90, description="Smoky sweetness with hints of dark chocolate, apple and spice — grown at high altitude."),
            Coffee(name="Kenya AA",               origin="Kenya",          roast="Light",    emoji="🍒", price=5.25, description="Bright wine-like acidity with ripe berry notes and a long, juicy finish."),
            Coffee(name="Brazilian Santos",       origin="Brazil",         roast="Medium",   emoji="🥜", price=4.25, description="Sweet, low-acid and nutty with a mild chocolatey body — perfect for everyday drinking."),
            Coffee(name="Costa Rica Tarrazú",     origin="Costa Rica",     roast="Medium",   emoji="🌺", price=5.10, description="Clean and bright with a honey-like sweetness, citrus zest and floral notes."),
        ]
        db.add_all(seed)
        db.commit()
    db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
