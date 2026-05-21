"""
recommender.py -- Matrix-Based Content Recommendation Engine
==============================================================
Builds a content-based filtering system using metadata similarity
and weighted re-ranking on popularity signals.

Architecture:
  1. Feature Engineering  -- Concatenate categorical metadata into a
                             single tokenizable string ("metadata_soup").
  2. Vectorization        -- CountVectorizer encodes the soup into a
                             sparse term-frequency matrix.
  3. Similarity Matrix    -- Cosine similarity across all 500 books.
  4. Retrieval            -- Threshold-gated retrieval (cosine >= 0.75)
                             with fallback to next-best candidates.
  5. Re-ranking           -- Weighted composite score blending similarity
                             with normalized rating, reviews, and longevity.

Author : Shreyansh
Created: 2026-05-21
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import MinMaxScaler

# ── Configuration ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
INPUT_CSV = BASE_DIR / "cleaned_bestsellers.csv"

# Similarity threshold -- discard candidates below this score
SIMILARITY_THRESHOLD = 0.75

# Re-ranking weight distribution (must sum to 1.0)
W_SIMILARITY   = 0.50
W_RATING       = 0.20
W_REVIEWS      = 0.20
W_WEEKS        = 0.10

# Columns used to build the metadata soup
SOUP_COLS = ["author", "category", "sub_genre", "format", "publisher"]

# Numeric columns to normalize for re-ranking
RANK_COLS = ["rating", "reviews", "weeks_on_list"]


# ── Feature Engineering ──────────────────────────────────────────────────────
def _sanitize_token(text: str) -> str:
    """Lowercase and strip all spaces so multi-word names become single tokens.

    Examples:
        "Taylor Jenkins Reid"       -> "taylorjenkinsreid"
        "Psychological Thriller"    -> "psychologicalthriller"
        "Self-Help / Productivity"  -> "self-help/productivity"
    """
    return str(text).lower().replace(" ", "")


def build_metadata_soup(df: pd.DataFrame) -> pd.DataFrame:
    """Create the 'metadata_soup' column by concatenating categorical features.

    Each field is sanitized into a single token (spaces removed, lowercased),
    then all tokens are joined with a space so CountVectorizer treats each
    compound name (e.g., "taylorjenkinsreid") as one unique feature.
    """
    df = df.copy()

    # Sanitize each soup column individually, then join with spaces
    soup_parts = [df[col].fillna("").apply(_sanitize_token) for col in SOUP_COLS]
    df["metadata_soup"] = soup_parts[0]
    for part in soup_parts[1:]:
        df["metadata_soup"] = df["metadata_soup"] + " " + part

    return df


# ── Vectorization & Similarity ──────────────────────────────────────────────
def build_similarity_matrix(df: pd.DataFrame) -> np.ndarray:
    """Vectorize the metadata_soup and compute pairwise cosine similarity.

    Uses CountVectorizer (bag-of-words) since our tokens are pre-sanitized
    compound strings -- TF-IDF is unnecessary here because token frequency
    within a single soup string is always 1.

    Returns:
        np.ndarray of shape (n_books, n_books) with cosine similarities.
    """
    vectorizer = CountVectorizer()
    count_matrix = vectorizer.fit_transform(df["metadata_soup"])

    # Compute the full cosine similarity matrix (500x500 = 250K entries, fast)
    sim_matrix = cosine_similarity(count_matrix, count_matrix)

    return sim_matrix


# ── Normalization for Re-ranking ─────────────────────────────────────────────
def normalize_ranking_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Scale rating, reviews, and weeks_on_list to [0, 1] using MinMaxScaler.

    Creates new columns: rating_norm, reviews_norm, weeks_on_list_norm.
    These are used in the weighted composite score calculation.
    """
    df = df.copy()
    scaler = MinMaxScaler()

    for col in RANK_COLS:
        norm_col = f"{col}_norm"
        df[norm_col] = scaler.fit_transform(df[[col]])

    return df


# ── Recommendation Engine ───────────────────────────────────────────────────
def get_recommendations(
    book_title: str,
    df: pd.DataFrame,
    sim_matrix: np.ndarray,
    top_n: int = 5,
) -> pd.DataFrame:
    """Retrieve and re-rank book recommendations with fallback guarantee.

    Always returns exactly top_n results (or fewer only if the dataset
    itself has fewer than top_n other books).

    Pipeline:
      1. Look up the query book's index in the DataFrame.
      2. Extract its similarity scores against all other books.
      3. Separate into strong matches (cosine >= 0.75) and the rest.
      4. If strong matches fill top_n slots, rank them by weighted
         composite score and return.
      5. Otherwise, fill remaining slots from the highest-similarity
         candidates below the threshold ("Alternative Match").
      6. Label each result as "Strong Match" or "Alternative Match".

    Weighted composite score:
        50% Cosine Similarity | 20% Rating | 20% Reviews | 10% Weeks on List

    Args:
        book_title: Exact title string to look up (case-insensitive).
        df:         The processed DataFrame with metadata_soup and norm cols.
        sim_matrix: Precomputed cosine similarity matrix.
        top_n:      Number of recommendations to return.

    Returns:
        DataFrame with columns: title, author, sub_genre, category,
        similarity, composite_score, match_type, rating, reviews,
        weeks_on_list.
    """
    # ── 1. Look up the query book ────────────────────────────────────────────
    matches = df[df["title"].str.lower() == book_title.lower()]

    if matches.empty:
        print(f"[ERROR] Book '{book_title}' not found in the dataset.")
        print("        Available titles (first 10):")
        for t in df["title"].head(10).tolist():
            print(f"          - {t}")
        return pd.DataFrame()

    query_idx = matches.index[0]
    query_book = df.loc[query_idx]

    print(f"\n{'='*70}")
    print(f"  Recommendations for: \"{query_book['title']}\"")
    print(f"  by {query_book['author']} | {query_book['sub_genre']} | {query_book['category']}")
    print(f"{'='*70}")

    # ── 2. Extract similarity scores (exclude self) ──────────────────────────
    all_scores = [
        (idx, sim_matrix[query_idx][idx])
        for idx in range(len(df))
        if idx != query_idx
    ]

    # ── 3. Partition into strong matches and alternatives ────────────────────
    strong = [(idx, s) for idx, s in all_scores if s >= SIMILARITY_THRESHOLD]
    below  = [(idx, s) for idx, s in all_scores if s <  SIMILARITY_THRESHOLD]

    # Sort each pool by similarity descending
    strong.sort(key=lambda x: x[1], reverse=True)
    below.sort(key=lambda x: x[1], reverse=True)

    print(f"\n  Strong matches (>= {SIMILARITY_THRESHOLD}): {len(strong)}")

    # ── 4. Assemble the candidate list with match labels ─────────────────────
    #    Priority: strong matches first, then backfill from alternatives
    selected = []

    for idx, score in strong:
        if len(selected) >= top_n:
            break
        selected.append((idx, score, "Strong Match"))

    slots_remaining = top_n - len(selected)
    if slots_remaining > 0:
        print(f"  Backfilling {slots_remaining} slot(s) from alternatives...")
        for idx, score in below:
            if len(selected) >= top_n:
                break
            selected.append((idx, score, "Alternative Match"))

    # ── 5. Build result DataFrame ────────────────────────────────────────────
    sel_indices  = [idx for idx, _, _ in selected]
    sel_sims     = {idx: score for idx, score, _ in selected}
    sel_labels   = {idx: label for idx, _, label in selected}

    result = df.loc[sel_indices].copy()
    result["similarity"]  = result.index.map(sel_sims)
    result["match_type"]  = result.index.map(sel_labels)

    # ── 6. Compute weighted composite score ──────────────────────────────────
    sim_min = result["similarity"].min()
    sim_max = result["similarity"].max()
    if sim_max > sim_min:
        result["similarity_norm"] = (result["similarity"] - sim_min) / (sim_max - sim_min)
    else:
        result["similarity_norm"] = 1.0

    result["composite_score"] = (
        W_SIMILARITY * result["similarity_norm"]
        + W_RATING   * result["rating_norm"]
        + W_REVIEWS  * result["reviews_norm"]
        + W_WEEKS    * result["weeks_on_list_norm"]
    )

    # ── 7. Sort by composite score and format output ─────────────────────────
    result = result.sort_values("composite_score", ascending=False).head(top_n)

    display_cols = [
        "title", "author", "sub_genre", "category",
        "similarity", "composite_score", "match_type",
        "rating", "reviews", "weeks_on_list",
    ]
    result = result[display_cols].reset_index(drop=True)

    # ── Pretty-print ─────────────────────────────────────────────────────────
    strong_count = (result["match_type"] == "Strong Match").sum()
    alt_count    = (result["match_type"] == "Alternative Match").sum()
    print(f"  Returning {len(result)} results ({strong_count} strong, {alt_count} alternative):\n")

    for i, row in result.iterrows():
        tag = "[STRONG]" if row["match_type"] == "Strong Match" else "[ALT]"
        print(f"  #{i+1}  {tag}  {row['title']}")
        print(f"      Author: {row['author']} | Genre: {row['sub_genre']}")
        print(f"      Similarity: {row['similarity']:.4f} | Composite: {row['composite_score']:.4f}")
        print(f"      Rating: {row['rating']} | Reviews: {row['reviews']:,} | Weeks: {row['weeks_on_list']}")
        print()

    return result


# ── Pipeline Orchestrator ────────────────────────────────────────────────────
def build_engine():
    """Load data, engineer features, build the similarity matrix.

    Returns:
        (df, sim_matrix) ready for get_recommendations() calls.
    """
    # ── 1. Load ──────────────────────────────────────────────────────────────
    print("[1/4] Loading cleaned dataset...")
    df = pd.read_csv(INPUT_CSV)
    print(f"      Loaded {len(df)} books with {len(df.columns)} columns.")

    # ── 2. Feature Engineering ───────────────────────────────────────────────
    print("[2/4] Engineering metadata_soup...")
    df = build_metadata_soup(df)
    print(f"      Sample soup: \"{df['metadata_soup'].iloc[0]}\"")

    # ── 3. Normalize ranking columns ─────────────────────────────────────────
    print("[3/4] Normalizing ranking signals (rating, reviews, weeks_on_list)...")
    df = normalize_ranking_columns(df)

    # ── 4. Build similarity matrix ───────────────────────────────────────────
    print("[4/4] Vectorizing metadata & computing cosine similarity matrix...")
    sim_matrix = build_similarity_matrix(df)
    print(f"      Matrix shape: {sim_matrix.shape}")
    print(f"      Avg similarity: {sim_matrix.mean():.4f}")
    print(f"      Max off-diagonal: {np.fill_diagonal(sim_matrix.copy(), 0) or np.max(sim_matrix - np.eye(len(df))):.4f}")

    print("\n[READY] Recommendation engine built successfully.\n")
    return df, sim_matrix


# ── Entrypoint & Test Block ──────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 70)
    print("  Book Recommendation Engine -- Matrix-Based Content Filtering")
    print("=" * 70, "\n")

    # Build the engine
    df, sim_matrix = build_engine()

    # ── Test 1: Sci-fi book (likely triggers fallback) ───────────────────────
    r1 = get_recommendations("Project Hail Mary", df, sim_matrix, top_n=5)
    print(f"[TEST 1] Returned {len(r1)} result(s) for 'Project Hail Mary'.")

    # ── Test 2: Non-fiction book (may have strong matches) ───────────────────
    r2 = get_recommendations("Atomic Habits", df, sim_matrix, top_n=5)
    print(f"[TEST 2] Returned {len(r2)} result(s) for 'Atomic Habits'.")

    print("\n" + "=" * 70)
    print("  Engine Test Complete [DONE]")
    print("=" * 70)
