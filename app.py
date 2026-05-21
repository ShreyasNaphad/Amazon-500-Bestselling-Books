"""
app.py — Book Recommendation Engine API
=========================================
FastAPI server wrapping the matrix-based content recommendation engine.
Builds the similarity matrix once at startup and exposes REST endpoints
for the premium frontend UI.

Author : Shreyansh
Created: 2026-05-21
"""

import math
from fastapi import FastAPI, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import pandas as pd

from recommender import build_engine, get_recommendations

# ── Build Engine at Startup ──────────────────────────────────────────────────
print("\nBuilding recommendation engine...")
df_engine, sim_matrix = build_engine()
print("Engine ready!\n")


# ── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="Book Recommendation Engine",
    description="Matrix-based content recommendation engine with premium UI",
    version="1.0.0",
)


# ── Helper: Convert DataFrame row to dict ────────────────────────────────────
def book_to_dict(row) -> dict:
    """Convert a pandas row to a clean JSON-serializable dictionary."""
    d = {}
    for col in row.index:
        val = row[col]
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            d[col] = None
        elif hasattr(val, 'item'):  # numpy scalar
            d[col] = val.item()
        else:
            d[col] = val
    return d


# ── API Endpoints ────────────────────────────────────────────────────────────

@app.get("/api/books")
def list_books(
    search: str = Query(default="", description="Search term for title/author"),
    genre: str = Query(default="", description="Filter by category or sub_genre"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
):
    """List all books with optional search and genre filtering."""
    filtered = df_engine.copy()

    if search:
        search_lower = search.lower()
        filtered = filtered[
            filtered["title"].str.lower().str.contains(search_lower, na=False)
            | filtered["author"].str.lower().str.contains(search_lower, na=False)
        ]

    if genre:
        genre_lower = genre.lower()
        filtered = filtered[
            filtered["category"].str.lower().str.contains(genre_lower, na=False)
            | filtered["sub_genre"].str.lower().str.contains(genre_lower, na=False)
        ]

    total = len(filtered)
    start = (page - 1) * limit
    end = start + limit
    page_data = filtered.iloc[start:end]

    books = []
    for _, row in page_data.iterrows():
        books.append(book_to_dict(row))

    return {
        "books": books,
        "total": total,
        "page": page,
        "pages": max(1, math.ceil(total / limit)),
    }


@app.get("/api/books/{title}")
def get_book(title: str):
    """Get details for a single book by title."""
    matches = df_engine[df_engine["title"].str.lower() == title.lower()]
    if matches.empty:
        raise HTTPException(status_code=404, detail=f"Book '{title}' not found")
    row = matches.iloc[0]
    return {"book": book_to_dict(row)}


@app.get("/api/recommend/{title}")
def recommend(title: str, top_n: int = Query(default=6, ge=1, le=20)):
    """Get top-N recommendations for a given book title."""
    result = get_recommendations(title, df_engine, sim_matrix, top_n=top_n)
    if result.empty:
        raise HTTPException(status_code=404, detail=f"Book '{title}' not found")

    recommendations = []
    for _, row in result.iterrows():
        rec = book_to_dict(row)
        # Convert similarity to match percentage
        sim = rec.get("similarity", 0) or 0
        rec["match_percent"] = round(sim * 100)
        recommendations.append(rec)

    return {"query": title, "recommendations": recommendations}


@app.get("/api/stats")
def get_stats():
    """System stats: total books, avg rating, genre distribution, etc."""
    total_books = len(df_engine)
    avg_rating = round(float(df_engine["rating"].mean()), 2)
    total_reviews = int(df_engine["reviews"].sum())

    # Genre distribution (top 12)
    genre_counts = df_engine["sub_genre"].value_counts().head(12)
    genres = [
        {"name": name, "count": int(count)}
        for name, count in genre_counts.items()
    ]

    # Category split
    category_counts = df_engine["category"].value_counts()
    categories = [
        {"name": name, "count": int(count)}
        for name, count in category_counts.items()
    ]

    # Format distribution
    format_counts = df_engine["format"].value_counts()
    formats = [
        {"name": name, "count": int(count)}
        for name, count in format_counts.items()
    ]

    # Rating distribution
    rating_bins = pd.cut(df_engine["rating"], bins=[0, 3.5, 4.0, 4.5, 5.0])
    rating_dist = rating_bins.value_counts().sort_index()
    ratings = [
        {"range": str(interval), "count": int(count)}
        for interval, count in rating_dist.items()
    ]

    # Top publishers
    publisher_counts = df_engine["publisher"].value_counts().head(10)
    publishers = [
        {"name": name, "count": int(count)}
        for name, count in publisher_counts.items()
    ]

    return {
        "total_books": total_books,
        "avg_rating": avg_rating,
        "total_reviews": total_reviews,
        "genre_distribution": genres,
        "category_split": categories,
        "format_distribution": formats,
        "rating_distribution": ratings,
        "top_publishers": publishers,
    }


@app.get("/api/genres")
def get_genres():
    """List all unique genres (sub_genre) and categories."""
    sub_genres = sorted(df_engine["sub_genre"].dropna().unique().tolist())
    categories = sorted(df_engine["category"].dropna().unique().tolist())
    return {"sub_genres": sub_genres, "categories": categories}


@app.get("/api/trending")
def get_trending(limit: int = Query(default=10, ge=1, le=50)):
    """Top trending books ranked by a composite of rating × log(reviews)."""
    df_temp = df_engine.copy()
    import numpy as np
    df_temp["trend_score"] = df_temp["rating"] * np.log1p(df_temp["reviews"])
    trending = df_temp.nlargest(limit, "trend_score")

    books = []
    for _, row in trending.iterrows():
        b = book_to_dict(row)
        books.append(b)

    return {"trending": books}


# ── Serve Static Frontend ────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def serve_frontend():
    """Serve the main HTML page."""
    return FileResponse("static/index.html")
