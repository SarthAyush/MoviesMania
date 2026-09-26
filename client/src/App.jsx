import React, { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import HeroBanner from "./components/HeroBanner";
import MovieRow from "./components/MovieRow";
import DetailModal from "./components/DetailModal";
import VideoPlayer from "./components/VideoPlayer";
import CatalogView from "./components/CatalogView";
import WatchlistView from "./components/WatchlistView";
import { fetchHome, fetchRandomTitle } from "./services/api";
import { isTvSeries } from "./services/seriesHelper";
import Toast from "./components/Toast";
import { Loader2, Film, Heart } from "lucide-react";

const THEME_NAMES = {
  crimson: "Crimson Rose",
  cyan: "Neon Cyan",
  violet: "Amethyst Violet",
  emerald: "Emerald Matrix",
  amber: "Imperial Gold",
};

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [homeSections, setHomeSections] = useState([]);
  const [bannerItems, setBannerItems] = useState([]);
  const [loadingHome, setLoadingHome] = useState(true);

  // Active theme (persisted in localStorage)
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("cinebox_theme") || "crimson";
    } catch {
      return "crimson";
    }
  });

  // Toast notifications state
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSelectTheme = (newTheme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem("cinebox_theme", newTheme);
    } catch {}
    addToast(`Theme switched to ${THEME_NAMES[newTheme] || newTheme}`, "info");
  };

  // Sync theme to document element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Active movie for detail modal
  const [detailMovie, setDetailMovie] = useState(null);

  // Active movie for playback
  const [playerState, setPlayerState] = useState(null); // { movie, season, episode, meta }

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Watchlist stored in localStorage
  const [watchlist, setWatchlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cinebox_watchlist") || "[]");
    } catch {
      return [];
    }
  });

  // Recently watched stored in localStorage
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cinebox_history") || "[]");
    } catch {
      return [];
    }
  });

  // Sync watchlist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("cinebox_watchlist", JSON.stringify(watchlist));
    } catch (e) {
      console.error(e);
    }
  }, [watchlist]);

  // Sync history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("cinebox_history", JSON.stringify(history));
    } catch (e) {
      console.error(e);
    }
  }, [history]);

  // Live Playback Progress Map (tracks { [subject_id]: { time, duration, percent } })
  const [progressMap, setProgressMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cinebox_playback_progress") || "{}");
    } catch {
      return {};
    }
  });

  const handleProgressUpdate = (progressData) => {
    if (!progressData?.subject_id) return;
    setProgressMap((prev) => ({
      ...prev,
      [progressData.subject_id]: progressData,
      [`${progressData.subject_id}_s${progressData.season}_e${progressData.episode}`]: progressData
    }));
  };

  // Fetch Home Data
  useEffect(() => {
    let isMounted = true;
    setLoadingHome(true);

    fetchHome()
      .then((data) => {
        if (!isMounted) return;
        const sections = data.sections || [];
        const banners = sections.find((s) => s.section === "Banner")?.items || [];
        const contentSections = sections.filter((s) => s.section !== "Banner");

        setBannerItems(banners);
        setHomeSections(contentSections);
      })
      .catch((err) => {
        console.error("Home fetch error:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingHome(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Watchlist helpers
  const isWatchlisted = (subjectId) => {
    return watchlist.some((item) => String(item.subject_id) === String(subjectId));
  };

  const toggleWatchlist = (movie) => {
    if (!movie) return;
    const movieName = movie.name || movie.title || "Title";
    setWatchlist((prev) => {
      const exists = prev.some((item) => String(item.subject_id) === String(movie.subject_id));
      if (exists) {
        addToast(`Removed "${movieName}" from Watchlist`, "info");
        return prev.filter((item) => String(item.subject_id) !== String(movie.subject_id));
      } else {
        addToast(`Added "${movieName}" to Watchlist`, "success");
        return [{
          subject_id: movie.subject_id,
          name: movieName,
          slug: movie.slug,
          poster_url: movie.poster_url,
          rating: movie.rating,
          badge: movie.badge
        }, ...prev];
      }
    });
  };

  const removeFromWatchlist = (subjectId) => {
    const item = watchlist.find((i) => String(i.subject_id) === String(subjectId));
    if (item) {
      addToast(`Removed "${item.name}" from Watchlist`, "info");
    }
    setWatchlist((prev) => prev.filter((item) => String(item.subject_id) !== String(subjectId)));
  };

  // Watch History helpers
  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem("cinebox_history");
    } catch (e) {
      console.error(e);
    }
    addToast("Watch history cleared", "info");
  };

  const removeFromHistory = (subjectId) => {
    const item = history.find((m) => String(m.subject_id) === String(subjectId));
    if (item) {
      addToast(`Removed "${item.name}" from history`, "info");
    }
    setHistory((prev) => prev.filter((m) => String(m.subject_id) !== String(subjectId)));
  };

  // Surprise Me / Random Title Generator
  const handleSurpriseMe = async () => {
    addToast("Rolling dice for a top-rated pick...", "magic");
    try {
      const randomItem = await fetchRandomTitle();
      if (randomItem) {
        addToast(`Found: ${randomItem.name || randomItem.title}!`, "magic");
        setDetailMovie(randomItem);
      }
    } catch (err) {
      console.error("Surprise Me error:", err);
      addToast("Could not find a random title. Please try again.", "error");
    }
  };

  // Play handler with meta (seasons, dubs)
  const handlePlayMovie = (movie, season = 0, episode = 0, meta = {}) => {
    const isSeries = meta.isSeries !== undefined 
      ? meta.isSeries 
      : (isTvSeries(movie) || season > 0 || episode > 0);

    let effectiveSeason = season;
    let effectiveEpisode = episode;

    // For TV series, ensure at least Season 1, Episode 1 if unselected or resume last watched
    if (isSeries && (effectiveSeason === 0 || effectiveEpisode === 0)) {
      try {
        const stored = JSON.parse(localStorage.getItem("cinebox_playback_progress") || "{}");
        const prevProg = stored[movie.subject_id];
        if (prevProg && prevProg.season && prevProg.episode) {
          effectiveSeason = prevProg.season;
          effectiveEpisode = prevProg.episode;
        } else {
          effectiveSeason = 1;
          effectiveEpisode = 1;
        }
      } catch (e) {
        effectiveSeason = 1;
        effectiveEpisode = 1;
      }
    }

    const effectiveMeta = {
      ...meta,
      isSeries,
      allSeasons: isSeries ? (meta.allSeasons || []) : []
    };

    setPlayerState({ 
      movie, 
      season: effectiveSeason, 
      episode: effectiveEpisode, 
      meta: effectiveMeta 
    });

    // Add to history
    setHistory((prev) => {
      const filtered = prev.filter((m) => String(m.subject_id) !== String(movie.subject_id));
      return [{
        subject_id: movie.subject_id,
        name: movie.name || movie.title,
        slug: movie.slug,
        poster_url: movie.poster_url,
        season: effectiveSeason,
        episode: effectiveEpisode,
        isSeries,
        playedAt: Date.now()
      }, ...filtered].slice(0, 20);
    });
  };

  // Handle Search submit from Navbar
  const handleSearchSubmit = (query) => {
    setSearchQuery(query);
    setActiveTab("search");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#0b0c10] text-slate-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white relative">
      {/* Ambient background glow matching active theme */}
      <div className="ambient-glow absolute top-0 left-0 right-0 h-96 z-0" />

      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onSelectMovie={(movie) => setDetailMovie(movie)}
        watchlistCount={watchlist.length}
        onSearchSubmit={handleSearchSubmit}
        currentTheme={theme}
        onSelectTheme={handleSelectTheme}
        onSurpriseMe={handleSurpriseMe}
      />

      {/* Main Content Areas */}
      <main className="flex-1 relative z-10">
        {activeTab === "home" && (
          <div>
            {loadingHome ? (
              <div className="pt-24 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
                {/* Hero Banner Shimmer Skeleton */}
                <div className="relative aspect-[16/9] sm:aspect-[21/9] w-full bg-slate-900/80 rounded-3xl border border-white/5 overflow-hidden skeleton-shimmer flex flex-col justify-end p-8 sm:p-12">
                  <div className="max-w-xl space-y-4">
                    <div className="h-6 w-32 bg-slate-800 rounded-lg" />
                    <div className="h-10 sm:h-12 w-3/4 bg-slate-800 rounded-xl" />
                    <div className="h-4 w-full bg-slate-800/60 rounded" />
                    <div className="flex gap-4 pt-2">
                      <div className="h-11 w-32 bg-slate-800 rounded-xl" />
                      <div className="h-11 w-32 bg-slate-800 rounded-xl" />
                    </div>
                  </div>
                </div>

                {/* Rows Skeletons */}
                {[1, 2].map((r) => (
                  <div key={r} className="space-y-4">
                    <div className="h-6 w-44 bg-slate-900 rounded-lg skeleton-shimmer" />
                    <div className="flex items-center gap-5 overflow-hidden">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="w-36 sm:w-44 md:w-48 lg:w-52 flex-shrink-0 space-y-2.5">
                          <div className="aspect-[2/3] w-full bg-slate-900 rounded-xl border border-white/5 skeleton-shimmer" />
                          <div className="h-3.5 bg-slate-900 rounded w-3/4 skeleton-shimmer" />
                          <div className="h-2.5 bg-slate-900/60 rounded w-1/2 skeleton-shimmer" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Hero Banner Carousel */}
                <HeroBanner
                  banners={bannerItems}
                  onPlay={(movie) => handlePlayMovie(movie, 0, 0)}
                  onOpenDetail={(movie) => setDetailMovie(movie)}
                  onToggleWatchlist={toggleWatchlist}
                  isWatchlisted={isWatchlisted}
                  onSurpriseMe={handleSurpriseMe}
                />

                {/* Continue Watching / History Row */}
                {history.length > 0 && (
                  <div className="-mt-6 relative z-20">
                    <MovieRow
                      title="Continue Watching"
                      movies={history}
                      onSelectMovie={(m) => setDetailMovie(m)}
                      onPlayMovie={(m) => handlePlayMovie(m, m.season || 0, m.episode || 0)}
                      isWatchlisted={isWatchlisted}
                      onToggleWatchlist={toggleWatchlist}
                      onClearRow={clearHistory}
                      onRemoveItem={(m) => removeFromHistory(m.subject_id)}
                      progressMap={progressMap}
                    />
                  </div>
                )}

                {/* Dynamic Home Content Rows */}
                <div className="space-y-2 mt-4 pb-16">
                  {homeSections.map((section, idx) => (
                    <MovieRow
                      key={idx}
                      title={section.section}
                      movies={section.items}
                      onSelectMovie={(m) => setDetailMovie(m)}
                      onPlayMovie={(m) => handlePlayMovie(m, 0, 0)}
                      isWatchlisted={isWatchlisted}
                      onToggleWatchlist={toggleWatchlist}
                      progressMap={progressMap}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "movies" && (
          <CatalogView
            category="movies"
            title="Movies Catalog"
            onSelectMovie={(m) => setDetailMovie(m)}
            onPlayMovie={(m) => handlePlayMovie(m, 0, 0)}
            isWatchlisted={isWatchlisted}
            onToggleWatchlist={toggleWatchlist}
            progressMap={progressMap}
          />
        )}

        {activeTab === "tv" && (
          <CatalogView
            category="tv"
            title="TV Shows & Series"
            onSelectMovie={(m) => setDetailMovie(m)}
            onPlayMovie={(m) => handlePlayMovie(m, 1, 1)}
            isWatchlisted={isWatchlisted}
            onToggleWatchlist={toggleWatchlist}
            progressMap={progressMap}
          />
        )}

        {activeTab === "anime" && (
          <CatalogView
            category="anime"
            title="Anime & Animation"
            onSelectMovie={(m) => setDetailMovie(m)}
            onPlayMovie={(m) => handlePlayMovie(m, 1, 1)}
            isWatchlisted={isWatchlisted}
            onToggleWatchlist={toggleWatchlist}
            progressMap={progressMap}
          />
        )}

        {activeTab === "search" && (
          <CatalogView
            category="search"
            searchQuery={searchQuery}
            title="Search Results"
            onSelectMovie={(m) => setDetailMovie(m)}
            onPlayMovie={(m) => handlePlayMovie(m, 0, 0)}
            isWatchlisted={isWatchlisted}
            onToggleWatchlist={toggleWatchlist}
            progressMap={progressMap}
          />
        )}

        {activeTab === "watchlist" && (
          <WatchlistView
            watchlist={watchlist}
            history={history}
            onSelectMovie={(m) => setDetailMovie(m)}
            onPlayMovie={(m, se, ep) => handlePlayMovie(m, se || 0, ep || 0)}
            onRemoveFromWatchlist={removeFromWatchlist}
            onClearHistory={clearHistory}
            onRemoveFromHistory={removeFromHistory}
            progressMap={progressMap}
          />
        )}
      </main>

      {/* Detail Modal */}
      {detailMovie && (
        <DetailModal
          movie={detailMovie}
          onClose={() => setDetailMovie(null)}
          onPlay={(movie, se, ep, meta) => {
            setDetailMovie(null);
            handlePlayMovie(movie, se, ep, meta);
          }}
          isWatchlisted={isWatchlisted}
          onToggleWatchlist={toggleWatchlist}
        />
      )}

      {/* Video Player Overlay / Floating Mini-Player */}
      {playerState && (
        <VideoPlayer
          movie={playerState.movie}
          season={playerState.season}
          episode={playerState.episode}
          meta={playerState.meta || {}}
          onClose={() => setPlayerState(null)}
          onToast={addToast}
          onProgressUpdate={handleProgressUpdate}
          onNextEpisode={() => {
            setPlayerState((prev) => ({
              ...prev,
              episode: (prev.episode || 1) + 1
            }));
          }}
        />
      )}

      {/* Floating Interactive Toast Feedback */}
      <Toast toasts={toasts} onDismiss={removeToast} />

      {/* Modern Sleek Footer */}
      <footer className="border-t border-slate-900 bg-[#07080c] py-12 px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md"
              style={{ backgroundColor: "var(--theme-primary)" }}
            >
              <Film className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-black tracking-wider text-white">
                CINE<span style={{ color: "var(--theme-primary)" }}>BOX</span>
              </span>
              <p className="text-[11px] text-slate-500">Next-Gen Cinema Experience</p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-400 flex-wrap">
            <span>Adaptive Themes</span>
            <span>•</span>
            <span>Accurate Category Filters</span>
            <span>•</span>
            <span>Isolated Hover Motion</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-slate-400">
              Made with <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
