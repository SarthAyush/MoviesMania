const BASE = "";

// High-speed client-side in-memory cache
const memoryCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

function getCached(key) {
  const entry = memoryCache.get(key);
  if (entry && (Date.now() - entry.time < CACHE_TTL_MS)) {
    return entry.data;
  }
  return null;
}

function setCache(key, data) {
  memoryCache.set(key, { time: Date.now(), data });
}

export async function fetchHome() {
  const cached = getCached("home");
  if (cached) return cached;

  const res = await fetch(`${BASE}/home`);
  if (!res.ok) throw new Error("Failed to fetch home data");
  const data = await res.json();
  setCache("home", data);
  return data;
}

export async function fetchCatalog(category, page = 1, sort = "RECOMMEND", genre = "ALL", year = "ALL") {
  const cacheKey = `cat_${category}_${page}_${sort}_${genre}_${year}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const endpoint = category === "movies" ? "/movies" : category === "tv" ? "/tv-series" : "/animation";
  const params = new URLSearchParams({
    page: String(page),
    sort,
    genre,
    year
  });
  const res = await fetch(`${BASE}${endpoint}?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch ${category}`);
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

export async function fetchSuggestions(query) {
  if (!query || query.trim().length < 1) return [];
  const res = await fetch(`${BASE}/search/suggest?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.suggestions || [];
}

export async function fetchSearchResults(query, page = 1) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}&page=${page}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function fetchMovieDetail(slug, subjectId = null) {
  const effectiveSlug = slug || subjectId;
  const cacheKey = `detail_${effectiveSlug}_${subjectId || ""}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = subjectId 
    ? `${BASE}/detail/${encodeURIComponent(effectiveSlug)}?subject_id=${encodeURIComponent(subjectId)}`
    : `${BASE}/detail/${encodeURIComponent(effectiveSlug)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch details");
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}

export async function fetchStreamSources(subjectId, detailPath, se = 0, ep = 0) {
  const cacheKey = `stream_${subjectId}_${detailPath}_${se}_${ep}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${BASE}/api/stream/${subjectId}?detail_path=${detailPath}&se=${se}&ep=${ep}`);
  if (!res.ok) throw new Error("Failed to fetch stream sources");
  const data = await res.json();
  if (data.has_resource) {
    setCache(cacheKey, data);
  }
  return data;
}

export async function fetchCaptions(subjectId, detailPath, se = 0, ep = 0) {
  const res = await fetch(`${BASE}/api/stream/${subjectId}/captions?detail_path=${detailPath}&se=${se}&ep=${ep}`);
  if (!res.ok) return { captions: [] };
  return res.json();
}

export async function fetchRandomTitle() {
  const res = await fetch(`${BASE}/api/random`);
  if (!res.ok) throw new Error("Failed to fetch random title");
  return res.json();
}
