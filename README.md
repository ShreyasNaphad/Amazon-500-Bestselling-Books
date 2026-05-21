# Amazon Bestselling Books Recommendation Engine

A matrix-based content recommendation engine and premium single-page web application powered by **FastAPI** and **scikit-learn**. This engine processes over 500 Amazon bestselling books and provides similarity-based recommendations using cosine similarity matrices and weighted re-ranking.

## Features
- **Cosine Similarity Engine**: Builds an in-memory TF-IDF matrix for sub-millisecond similarity scoring.
- **FastAPI Backend**: Provides REST endpoints for fetching books, genres, stats, and recommendations.
- **Premium Dark UI**: Built with vanilla HTML/CSS/JS, featuring glassmorphism, responsive grids, and genre-based image mapping.
- **Analytics Dashboard**: Tracks corpus statistics, genre distributions, and ratings via dynamic CSS charts.
- **My Library**: Save books locally to your reading list.

## Getting Started

### Prerequisites
Make sure you have Python 3 installed, then install the required dependencies:
```bash
pip install -r requirements.txt
```

### Running the App
Run the FastAPI backend using `uvicorn`:
```bash
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```
Then navigate to `http://127.0.0.1:8000` in your browser.

## Tech Stack
- **Backend**: Python, FastAPI, Pandas, scikit-learn
- **Frontend**: HTML5, Vanilla JavaScript, CSS3
- **Data**: Kaggle Top 500 Amazon Bestselling Books (cleaned and transformed)

## License
MIT License
