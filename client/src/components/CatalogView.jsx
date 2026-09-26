import React, { useState, useEffect } from "react";
import { Loader2, ArrowLeft, ArrowRight, Filter, Film, RotateCcw, Calendar, Star, Sparkles, Layers, SlidersHorizontal } from "lucide-react";
import MovieCard from "./MovieCard";
import { fetchCatalog, fetchSearchResults } from "../services/api";

const GENRES = [
  "ALL", "Action", "Comedy", "Drama", "Sci-Fi", "Horror",
  "Romance", "Thriller", "Adventure", "Animation", "Crime", "Fantasy", "Mystery"
];

const YEARS = [
  "ALL", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018"
];

export default function CatalogView({
  category, // 'movies' | 'tv' | 'anime' | 'search'
  searchQuery,
  title,
  onSelectMovie,
  onPlayMovie,
  isWatchlisted,
  onToggleWatchlist,
  progressMap
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState("RECOMMEND");
  const [genre, setGenre] = useState("ALL");
  const [year, setYear] = useState("ALL");

  const isFiltered = genre !== "ALL" || year !== "ALL" || sort !== "RECOMMEND";

  const resetFilters = () => {
    setGenre("ALL");
    setYear("ALL");
    setSort("RECOMMEND");
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [category, searchQuery, sort, genre, year]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const promise = category === "search"
      ? fetchSearchResults(searchQuery, page)
      : fetchCatalog(category, page, sort, genre, year);

    promise
      .then((data) => {
        if (isMounted) {
          setItems(data.items || []);
          setTotal(data.total || 0);
        }
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [category, searchQuery, page, sort, genre, year]);

  return (
    <div className="pt-24 pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header bar */}
      <div className="border-b border-white/5 pb-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight flex items-center gap-3">
              <span 
                className="w-2.5 h-7 rounded-full inline-block shadow-md"
                style={{ backgroundColor: "var(--theme-primary)", boxShadow: "0 0 15px var(--theme-glow)" }}
              />
              {title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5 flex items-center gap-2">
              {category === "search" ? (
                <span>Showing verified results for <strong className="text-white">"{searchQuery}"</strong></span>
              ) : (
                <span>Showing verified titles • <strong className="text-white">{genre !== "ALL" ? genre : "All Genres"}</strong> • <strong className="text-white">{year !== "ALL" ? year : "All Years"}</strong> • Page {page}</span>
              )}
            </p>
          </div>

          {/* Reset Filters button if any active */}
          {isFiltered && category !== "search" && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-white border border-white/10 transition-all self-start sm:self-auto hover:scale-105 active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          )}
        </div>

        {/* ACCURATE MODERN GLASS FILTER BAR for categories */}
        {category !== "search" && (
          <div className="space-y-4 pt-3 bg-white/[0.02] p-4 sm:p-5 rounded-2xl border border-white/5">
            {/* Genre Quick-Select Pills */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {GENRES.map((g) => {
                const isActive = genre === g;
                return (
                  <button
                    key={g}
                    onClick={() => setGenre(g)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${
                      isActive
                        ? "text-white shadow-lg border-transparent scale-105"
                        : "bg-black/30 border-white/5 text-slate-400 hover:text-white hover:border-white/15"
                    }`}
                    style={isActive ? { 
                      backgroundColor: "var(--theme-primary)", 
                      boxShadow: "0 4px 15px -2px var(--theme-glow)" 
                    } : {}}
                  >
                    {g === "ALL" ? "All Genres" : g}
                  </button>
                );
              })}
            </div>

            {/* Dropdowns row: Year & Sort Order */}
            <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-white/5">
              {/* Year Select */}
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3.5 py-1.5 text-xs shadow-inner">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 font-medium">Year:</span>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer pr-1"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y} className="bg-slate-900 text-white">
                      {y === "ALL" ? "All Years" : y}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort Select */}
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3.5 py-1.5 text-xs shadow-inner">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 font-medium">Sort By:</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer pr-1"
                >
                  <option value="RECOMMEND" className="bg-slate-900 text-white">Recommended</option>
                  <option value="LATEST" className="bg-slate-900 text-white">Latest Releases</option>
                  <option value="RATING" className="bg-slate-900 text-white">Highest Rating</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading Shimmer State with Uniform Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 sm:gap-6">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div key={idx} className="space-y-2">
              <div className="aspect-[2/3] w-full bg-slate-900 rounded-2xl border border-white/5 skeleton-shimmer shadow-lg" />
              <div className="h-3.5 bg-slate-900 rounded-lg w-3/4 skeleton-shimmer" />
              <div className="h-2.5 bg-slate-900/60 rounded-lg w-1/2 skeleton-shimmer" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-slate-500 gap-3">
          <Film className="w-12 h-12 stroke-[1.5] opacity-40" />
          <p className="text-base font-semibold text-slate-300">No titles match your filter criteria.</p>
          <button
            onClick={resetFilters}
            className="mt-2 px-5 py-2.5 rounded-full text-xs font-bold text-white shadow-lg btn-theme"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        /* Uniform Grid with pixel-perfect spacing */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 sm:gap-6">
          {items.map((movie, idx) => (
            <div key={movie.subject_id || idx} className="w-full">
              <MovieCard
                movie={movie}
                onSelect={onSelectMovie}
                onPlay={onPlayMovie}
                isWatchlisted={isWatchlisted}
                onToggleWatchlist={onToggleWatchlist}
                progress={progressMap?.[movie.subject_id]}
              />
            </div>
          ))}
        </div>
      )}

      {/* Pagination Bar */}
      {!loading && items.length > 0 && (
        <div className="mt-14 flex items-center justify-center gap-4">
          <button
            disabled={page <= 1}
            onClick={() => {
              setPage((p) => Math.max(1, p - 1));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </button>

          <span className="text-xs font-bold text-slate-300 px-3.5 py-1.5 bg-white/5 rounded-full border border-white/10">
            Page {page}
          </span>

          <button
            onClick={() => {
              setPage((p) => p + 1);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-semibold text-white transition-all shadow-lg hover:scale-105 active:scale-95 btn-theme"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
