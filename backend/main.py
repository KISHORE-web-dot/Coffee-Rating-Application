from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

try:
    from .database import get_db, init_db, Coffee
except ImportError:
    from database import get_db, init_db, Coffee

init_db()

app = FastAPI(title="Coffee Rating API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Schemas ───────────────────────────────────────────────────────────────────

class CoffeeOut(BaseModel):
    id:          int
    name:        str
    origin:      str
    roast:       str
    description: str
    emoji:       str
    price:       float
    votes:       int
    created_at:  datetime
    updated_at:  datetime

    class Config:
        from_attributes = True


class CoffeeCreate(BaseModel):
    name:        str   = Field(..., min_length=1, max_length=100)
    origin:      str   = Field("", max_length=100)
    roast:       str   = Field("Medium", max_length=50)
    description: str   = Field("", max_length=500)
    emoji:       str   = Field("☕", max_length=10)
    price:       float = Field(0.0, ge=0)


class VoteResponse(BaseModel):
    id:    int
    name:  str
    votes: int
    message: str

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Coffee Rating API. Docs at /docs"}


@app.get("/api/coffees", response_model=List[CoffeeOut])
def get_coffees(sort: str = "votes", db: Session = Depends(get_db)):
    """
    Return all coffees.
    sort=votes  → descending vote count (leaderboard order)
    sort=name   → alphabetical
    sort=newest → newest first
    """
    query = db.query(Coffee)
    if sort == "name":
        query = query.order_by(Coffee.name)
    elif sort == "newest":
        query = query.order_by(Coffee.created_at.desc())
    else:
        query = query.order_by(Coffee.votes.desc(), Coffee.name)
    return query.all()


@app.post("/api/coffees/{coffee_id}/vote", response_model=VoteResponse)
def vote_for_coffee(coffee_id: int, db: Session = Depends(get_db)):
    """
    Core endpoint: atomically increments the vote counter for a coffee by 1.
    Uses SQLAlchemy's in-place expression to safely handle concurrent votes.
    Returns the updated vote count so the frontend can sync without a full reload.
    """
    coffee = db.query(Coffee).filter(Coffee.id == coffee_id).first()
    if not coffee:
        raise HTTPException(status_code=404, detail="Coffee not found")

    # Atomic increment — avoids race conditions
    coffee.votes     = Coffee.votes + 1
    coffee.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(coffee)

    return VoteResponse(
        id=coffee.id,
        name=coffee.name,
        votes=coffee.votes,
        message=f"Vote recorded! {coffee.name} now has {coffee.votes} vote{'s' if coffee.votes != 1 else ''}."
    )


@app.post("/api/coffees/{coffee_id}/unvote", response_model=VoteResponse)
def unvote_coffee(coffee_id: int, db: Session = Depends(get_db)):
    """Decrement vote by 1 (minimum 0). Allows users to undo a vote."""
    coffee = db.query(Coffee).filter(Coffee.id == coffee_id).first()
    if not coffee:
        raise HTTPException(status_code=404, detail="Coffee not found")

    if coffee.votes > 0:
        coffee.votes      = Coffee.votes - 1
        coffee.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(coffee)

    return VoteResponse(
        id=coffee.id,
        name=coffee.name,
        votes=coffee.votes,
        message=f"Vote removed. {coffee.name} now has {coffee.votes} vote{'s' if coffee.votes != 1 else ''}."
    )


@app.post("/api/coffees", response_model=CoffeeOut, status_code=status.HTTP_201_CREATED)
def add_coffee(data: CoffeeCreate, db: Session = Depends(get_db)):
    """Add a new coffee to the list."""
    coffee = Coffee(**data.dict())
    db.add(coffee)
    db.commit()
    db.refresh(coffee)
    return coffee


@app.delete("/api/coffees/{coffee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_coffee(coffee_id: int, db: Session = Depends(get_db)):
    """Remove a coffee entry."""
    coffee = db.query(Coffee).filter(Coffee.id == coffee_id).first()
    if not coffee:
        raise HTTPException(status_code=404, detail="Coffee not found")
    db.delete(coffee)
    db.commit()
    return None


@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    """Leaderboard summary stats."""
    total_coffees = db.query(Coffee).count()
    total_votes   = db.query(func.sum(Coffee.votes)).scalar() or 0
    top           = db.query(Coffee).order_by(Coffee.votes.desc()).first()
    return {
        "total_coffees": total_coffees,
        "total_votes":   int(total_votes),
        "top_coffee":    top.name if top else None,
        "top_votes":     top.votes if top else 0,
    }
