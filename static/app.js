/* ══════════════════════════════════════════════════════════════════════════
   Book Recommendation Engine — Client-Side Logic
   ══════════════════════════════════════════════════════════════════════════ */

// ── State Management ───────────────────────────────────────────────────────
const state = {
  currentPage: 'home',
  books: [],
  searchQuery: '',
  activeGenre: '',
  page: 1,
  totalPages: 1,
  currentBook: null,
  library: JSON.parse(localStorage.getItem('book_engine_library')) || [],
  stats: null,
  genres: []
};

// ── DOM Elements ───────────────────────────────────────────────────────────
const el = {
  // Navigation
  navItems: document.querySelectorAll('.nav-item'),
  pageViews: document.querySelectorAll('.page-view'),
  mobileToggle: document.getElementById('mobileToggle'),
  sidebar: document.getElementById('sidebar'),
  
  // UI Overlays
  loadingOverlay: document.getElementById('loadingOverlay'),
  toast: document.getElementById('toast'),
  toastMsg: document.getElementById('toastMsg'),
  
  // Hero Section
  heroSection: document.getElementById('heroSection'),
  heroTitle: document.getElementById('heroTitle'),
  heroAuthor: document.getElementById('heroAuthor'),
  heroRating: document.getElementById('heroRating'),
  heroReviews: document.getElementById('heroReviews'),
  heroWeeks: document.getElementById('heroWeeks'),
  heroFormat: document.getElementById('heroFormat'),
  heroBadge1: document.getElementById('heroBadge1'),
  heroBadge2: document.getElementById('heroBadge2'),
  heroBackdropBg: document.getElementById('heroBackdropBg'),
  btnRunAnalysis: document.getElementById('btnRunAnalysis'),
  btnAddLibrary: document.getElementById('btnAddLibrary'),
  
  // Recommendations
  recSection: document.getElementById('recSection'),
  recScroll: document.getElementById('recScroll'),
  
  // Browse Grid
  bookGrid: document.getElementById('bookGrid'),
  searchInput: document.getElementById('searchInput'),
  genreFilters: document.getElementById('genreFilters'),
  loadMoreBtn: document.getElementById('loadMoreBtn'),
  
  // Stats
  sidebarBookCount: document.getElementById('sidebarBookCount'),
  sidebarAvgRating: document.getElementById('sidebarAvgRating'),
  sidebarBar1: document.getElementById('sidebarBar1'),
  sidebarBar2: document.getElementById('sidebarBar2'),
  
  // Other Pages
  trendingList: document.getElementById('trendingList'),
  libraryContent: document.getElementById('libraryContent'),
  analyticsGrid: document.getElementById('analyticsGrid'),
};

// ── Initialization ─────────────────────────────────────────────────────────
async function init() {
  setupEventListeners();
  showLoading(true);
  
  try {
    await Promise.all([
      fetchStats(),
      fetchGenres(),
      fetchBooks(true)
    ]);
    
    // Set a default featured book (Project Hail Mary is usually rank 3)
    await loadFeaturedBook("Project Hail Mary");
    
  } catch (error) {
    console.error("Initialization failed:", error);
    showToast("Failed to connect to the recommendation engine.");
  } finally {
    showLoading(false);
  }
}

// ── Event Listeners ────────────────────────────────────────────────────────
function setupEventListeners() {
  // Navigation
  el.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const pageId = e.currentTarget.getAttribute('data-page');
      navigateTo(pageId);
      if (window.innerWidth <= 768) {
        el.sidebar.classList.remove('open');
      }
    });
  });

  // Mobile Menu
  el.mobileToggle.addEventListener('click', () => {
    el.sidebar.classList.toggle('open');
  });

  // Search with debounce
  let searchTimeout;
  el.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      state.page = 1;
      fetchBooks(true);
    }, 400);
  });

  // Load More
  el.loadMoreBtn.addEventListener('click', () => {
    if (state.page < state.totalPages) {
      state.page++;
      fetchBooks(false);
    }
  });

  // Hero Actions
  el.btnRunAnalysis.addEventListener('click', () => {
    if (state.currentBook) {
      el.recSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Small pulse effect on the recommendations
      el.recScroll.style.transform = 'scale(0.98)';
      setTimeout(() => el.recScroll.style.transform = 'scale(1)', 150);
    }
  });

  el.btnAddLibrary.addEventListener('click', () => {
    if (state.currentBook) {
      toggleLibrary(state.currentBook);
    }
  });
}

// ── Navigation ─────────────────────────────────────────────────────────────
function navigateTo(pageId) {
  state.currentPage = pageId;
  
  // Update Nav Active State
  el.navItems.forEach(item => {
    if (item.getAttribute('data-page') === pageId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Show active page view
  el.pageViews.forEach(view => {
    if (view.id === `page-${pageId}`) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });
  
  // Page specific logic
  if (pageId === 'trending' && !el.trendingList.innerHTML.trim()) {
    fetchTrending();
  } else if (pageId === 'library') {
    renderLibrary();
  } else if (pageId === 'analytics' && !el.analyticsGrid.innerHTML.trim()) {
    renderAnalytics();
  }
}

// ── API Calls ──────────────────────────────────────────────────────────────
async function fetchBooks(reset = false) {
  const url = `/api/books?search=${encodeURIComponent(state.searchQuery)}&genre=${encodeURIComponent(state.activeGenre)}&page=${state.page}&limit=16`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    if (reset) {
      state.books = data.books;
      el.bookGrid.innerHTML = '';
    } else {
      state.books = [...state.books, ...data.books];
    }
    
    state.totalPages = data.pages;
    renderBookGrid(data.books);
    
    el.loadMoreBtn.style.display = (state.page < state.totalPages) ? 'inline-block' : 'none';
    
    // If no featured book yet, use the first one
    if (!state.currentBook && data.books.length > 0) {
      loadFeaturedBook(data.books[0].title);
    }
    
  } catch (error) {
    console.error("Error fetching books:", error);
  }
}

async function loadFeaturedBook(title) {
  try {
    // 1. Fetch book details
    const res = await fetch(`/api/books/${encodeURIComponent(title)}`);
    if (!res.ok) throw new Error("Book not found");
    const data = await res.json();
    state.currentBook = data.book;
    
    // 2. Update Hero UI
    updateHeroUI();
    
    // 3. Fetch Recommendations
    const recRes = await fetch(`/api/recommend/${encodeURIComponent(title)}?top_n=8`);
    if (recRes.ok) {
      const recData = await recRes.json();
      renderRecommendations(recData.recommendations);
    }
    
  } catch (error) {
    console.error("Error loading featured book:", error);
  }
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    state.stats = await res.json();
    
    // Update Sidebar Stats
    animateValue(el.sidebarBookCount, 0, state.stats.total_books, 1000);
    animateValue(el.sidebarAvgRating, 0, state.stats.avg_rating, 1000, 2);
    
    setTimeout(() => {
      el.sidebarBar1.style.width = '85%';
      el.sidebarBar2.style.width = `${(state.stats.avg_rating / 5) * 100}%`;
    }, 500);
    
  } catch (error) {
    console.error("Error fetching stats:", error);
  }
}

async function fetchGenres() {
  try {
    const res = await fetch('/api/genres');
    const data = await res.json();
    state.genres = data.categories; // Using top level categories for filters
    
    renderGenreFilters();
  } catch (error) {
    console.error("Error fetching genres:", error);
  }
}

async function fetchTrending() {
  showLoading(true);
  try {
    const res = await fetch('/api/trending?limit=10');
    const data = await res.json();
    
    el.trendingList.innerHTML = '';
    data.trending.forEach((book, index) => {
      const rankClass = index < 3 ? 'top-3' : '';
      const coverImg = getCoverImage(book.category, book.sub_genre);
      
      const html = `
        <div class="trending-item fade-in" onclick="selectBook('${book.title.replace(/'/g, "\\'")}')">
          <div class="trending-rank ${rankClass}">#${index + 1}</div>
          <div class="trending-cover">
            <img src="${coverImg}" alt="${book.title} cover">
          </div>
          <div class="trending-info">
            <div class="trending-title">${book.title}</div>
            <div class="trending-author">${book.author}</div>
          </div>
          <div class="trending-stats">
            <div class="trending-stat">
              <div class="trending-stat-value" style="color:#f1c40f;">★ ${book.rating.toFixed(1)}</div>
              <div class="trending-stat-label">Rating</div>
            </div>
            <div class="trending-stat">
              <div class="trending-stat-value">${(book.reviews/1000).toFixed(1)}k</div>
              <div class="trending-stat-label">Reviews</div>
            </div>
            <div class="trending-stat">
              <div class="trending-stat-value">${book.weeks_on_list}</div>
              <div class="trending-stat-label">Weeks</div>
            </div>
          </div>
        </div>
      `;
      el.trendingList.insertAdjacentHTML('beforeend', html);
    });
  } catch (error) {
    console.error("Error fetching trending:", error);
  } finally {
    showLoading(false);
  }
}

// ── UI Rendering ───────────────────────────────────────────────────────────
function updateHeroUI() {
  const book = state.currentBook;
  if (!book) return;
  
  el.heroTitle.innerHTML = book.title;
  el.heroAuthor.innerText = book.author;
  el.heroRating.innerText = book.rating.toFixed(1);
  el.heroReviews.innerText = book.reviews.toLocaleString();
  el.heroWeeks.innerText = book.weeks_on_list;
  el.heroFormat.innerText = book.format;
  
  el.heroBadge2.innerText = book.category.toUpperCase();
  
  // Check library status
  const inLib = state.library.some(b => b.title === book.title);
  el.btnAddLibrary.innerHTML = inLib 
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> In Library`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> My Library`;
    
  if (inLib) {
    el.btnAddLibrary.classList.remove('btn-secondary');
    el.btnAddLibrary.classList.add('btn-primary');
    el.btnAddLibrary.style.background = '#27ae60';
  } else {
    el.btnAddLibrary.classList.add('btn-secondary');
    el.btnAddLibrary.classList.remove('btn-primary');
    el.btnAddLibrary.style.background = '';
  }
  
  // Dynamic Background based on category
  const bgColors = {
    'Fiction': 'linear-gradient(135deg, #1a0505, #3d0c0c, #0d0a1a)',
    'Non-Fiction': 'linear-gradient(135deg, #050f1a, #0c243d, #050a10)'
  };
  el.heroBackdropBg.style.background = bgColors[book.category] || bgColors['Fiction'];
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderRecommendations(recs) {
  el.recScroll.innerHTML = '';
  el.recScroll.scrollLeft = 0; // Reset scroll position to the start
  
  recs.forEach((rec, index) => {
    const coverImg = getCoverImage(rec.category, rec.sub_genre);
    
    // Color code match percentage
    let matchColor = '#e74c3c'; // Red (High)
    if (rec.match_percent < 80) matchColor = '#e67e22'; // Orange
    if (rec.match_percent < 60) matchColor = '#3498db'; // Blue
    
    const html = `
      <div class="rec-card fade-in" onclick="selectBook('${rec.title.replace(/'/g, "\\'")}')" style="animation-delay: ${index * 0.05}s">
        <div class="rec-card-image">
          <img src="${coverImg}" alt="${rec.title} cover" style="width: 100%; height: 100%; object-fit: cover;">
          <div class="match-badge" style="background: ${matchColor}E6;">
            ${rec.match_percent}% Match
          </div>
        </div>
        <div class="rec-card-info">
          <div class="rec-card-title" title="${rec.title}">${rec.title}</div>
          <div class="rec-card-author">${rec.author}</div>
          <div class="rec-card-meta">
            <span class="rec-card-rating">★ ${rec.rating.toFixed(1)}</span>
            <span>${rec.sub_genre}</span>
          </div>
        </div>
      </div>
    `;
    el.recScroll.insertAdjacentHTML('beforeend', html);
  });
}

function renderBookGrid(books) {
  books.forEach(book => {
    const coverImg = getCoverImage(book.category, book.sub_genre);
    
    const html = `
      <div class="book-card fade-in" onclick="selectBook('${book.title.replace(/'/g, "\\'")}')">
        <div class="book-card-cover">
          <img src="${coverImg}" alt="${book.title} cover" style="width: 100%; height: 100%; object-fit: cover;">
        </div>
        <div class="book-card-body">
          <div class="book-card-title" title="${book.title}">${book.title}</div>
          <div class="book-card-author">${book.author}</div>
          <div class="book-card-footer">
            <div class="book-card-rating">★ ${book.rating.toFixed(1)}</div>
            <div class="book-card-genre">${book.sub_genre}</div>
          </div>
        </div>
      </div>
    `;
    el.bookGrid.insertAdjacentHTML('beforeend', html);
  });
}

function renderGenreFilters() {
  // Keep the 'All' button
  const allBtn = `<button class="genre-chip active" data-genre="">All Categories</button>`;
  let buttonsHtml = allBtn;
  
  state.genres.forEach(genre => {
    buttonsHtml += `<button class="genre-chip" data-genre="${genre}">${genre}</button>`;
  });
  
  el.genreFilters.innerHTML = buttonsHtml;
  
  // Add Event Listeners
  document.querySelectorAll('.genre-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.genre-chip').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      
      state.activeGenre = e.currentTarget.getAttribute('data-genre');
      state.page = 1;
      fetchBooks(true);
    });
  });
}

function renderLibrary() {
  if (state.library.length === 0) {
    el.libraryContent.innerHTML = `
      <div class="library-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        <h3>Your Library is Empty</h3>
        <p>Save books you want to read later by clicking "My Library" on a book's detail view.</p>
      </div>
    `;
    return;
  }
  
  let html = `<div class="book-grid">`;
  state.library.forEach(book => {
    const coverImg = getCoverImage(book.category, book.sub_genre);
    html += `
      <div class="book-card fade-in" onclick="selectBook('${book.title.replace(/'/g, "\\'")}')">
        <div class="book-card-cover">
          <img src="${coverImg}" alt="${book.title} cover" style="width: 100%; height: 100%; object-fit: cover;">
        </div>
        <div class="book-card-body">
          <div class="book-card-title" title="${book.title}">${book.title}</div>
          <div class="book-card-author">${book.author}</div>
          <div class="book-card-footer">
            <div class="book-card-rating">★ ${book.rating.toFixed(1)}</div>
            <div class="book-card-genre">${book.sub_genre}</div>
          </div>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  el.libraryContent.innerHTML = html;
}

function renderAnalytics() {
  if (!state.stats) return;
  
  el.analyticsGrid.innerHTML = '';
  
  // Card 1: Corpus Stats
  el.analyticsGrid.insertAdjacentHTML('beforeend', `
    <div class="analytics-card fade-in">
      <div class="analytics-card-title">Database Overview</div>
      <div class="analytics-card-value">${state.stats.total_books}</div>
      <div class="analytics-card-sub">Total books indexed in vector space</div>
      <div style="margin-top: 20px;">
        <div class="analytics-card-value" style="font-size: 1.5rem;">${(state.stats.total_reviews / 1000000).toFixed(1)}M+</div>
        <div class="analytics-card-sub">Aggregated user reviews analyzed</div>
      </div>
    </div>
  `);
  
  // Card 2: Top Genres
  let genresHtml = '';
  const maxGenreCount = Math.max(...state.stats.genre_distribution.map(g => g.count));
  
  state.stats.genre_distribution.slice(0, 6).forEach(g => {
    const pct = (g.count / maxGenreCount) * 100;
    genresHtml += `
      <div class="bar-row">
        <div class="bar-label" title="${g.name}">${g.name}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: 0%" data-width="${pct}%"></div>
        </div>
        <div class="bar-value">${g.count}</div>
      </div>
    `;
  });
  
  el.analyticsGrid.insertAdjacentHTML('beforeend', `
    <div class="analytics-card fade-in">
      <div class="analytics-card-title">Top Sub-Genres (Vector Density)</div>
      <div class="bar-chart">
        ${genresHtml}
      </div>
    </div>
  `);
  
  // Card 3: Rating Distribution
  let ratingsHtml = '';
  const maxRatingCount = Math.max(...state.stats.rating_distribution.map(r => r.count));
  
  state.stats.rating_distribution.reverse().forEach(r => {
    const pct = (r.count / maxRatingCount) * 100;
    // Format range string (e.g. "(4.5, 5.0]" -> "4.5 - 5.0")
    const label = r.range.replace(/[()\[\]]/g, '').replace(', ', ' - ');
    ratingsHtml += `
      <div class="bar-row">
        <div class="bar-label">★ ${label}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: 0%" data-width="${pct}%"></div>
        </div>
        <div class="bar-value">${r.count}</div>
      </div>
    `;
  });
  
  el.analyticsGrid.insertAdjacentHTML('beforeend', `
    <div class="analytics-card fade-in">
      <div class="analytics-card-title">Corpus Rating Distribution</div>
      <div class="bar-chart">
        ${ratingsHtml}
      </div>
    </div>
  `);
  
  // Animate bars after rendering
  setTimeout(() => {
    document.querySelectorAll('#page-analytics .bar-fill').forEach(bar => {
      bar.style.width = bar.getAttribute('data-width');
    });
  }, 100);
}

// ── Helpers ────────────────────────────────────────────────────────────────
window.selectBook = function(title) {
  loadFeaturedBook(title);
  if (state.currentPage !== 'home') {
    navigateTo('home');
  }
};

function toggleLibrary(book) {
  const index = state.library.findIndex(b => b.title === book.title);
  
  if (index === -1) {
    // Add to library
    state.library.push(book);
    showToast(`Added to Library`);
  } else {
    // Remove from library
    state.library.splice(index, 1);
    showToast(`Removed from Library`);
  }
  
  localStorage.setItem('book_engine_library', JSON.stringify(state.library));
  updateHeroUI(); // Update button state
  
  // Re-render library if we are on that page
  if (state.currentPage === 'library') {
    renderLibrary();
  }
}

function showToast(msg) {
  el.toastMsg.innerText = msg;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 3000);
}

function showLoading(show) {
  if (show) {
    el.loadingOverlay.classList.remove('hidden');
  } else {
    el.loadingOverlay.classList.add('hidden');
  }
}

function getCoverImage(category, subGenre = '') {
  const cat = (category || '').toLowerCase();
  const sub = (subGenre || '').toLowerCase();
  
  if (sub.includes('sci') || cat.includes('sci')) return '/static/images/scifi.png';
  if (sub.includes('romance') || cat.includes('romance') || sub.includes('romantasy')) return '/static/images/romance.png';
  if (sub.includes('thriller') || sub.includes('mystery') || sub.includes('crime')) return '/static/images/thriller.png';
  if (sub.includes('fantasy') || sub.includes('magic')) return '/static/images/fantasy.png';
  if (sub.includes('self-help') || sub.includes('productivity') || cat.includes('non-fiction')) return '/static/images/nonfiction.png';
  
  // Fallback to a random cover based on title length or character code so it's deterministic per book
  const fallback = ['/static/images/scifi.png', '/static/images/thriller.png', '/static/images/fantasy.png', '/static/images/romance.png'][sub.length % 4];
  return fallback;
}

function animateValue(obj, start, end, duration, decimals = 0) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const value = progress * (end - start) + start;
    obj.innerHTML = decimals > 0 ? value.toFixed(decimals) : Math.floor(value);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
