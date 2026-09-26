import React, { useRef } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import MovieCard from "./MovieCard";

export default function MovieRow({
  title,
  movies = [],
  onSelectMovie,
  onPlayMovie,
  isWatchlisted,
  onToggleWatchlist,
  onClearRow,
  onRemoveItem,
  progressMap
}) {
  const rowRef = useRef(null);

  if (!movies || movies.length === 0) return null;

  const scroll = (direction) => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollAmount = direction === "left" ? -clientWidth * 0.75 : clientWidth * 0.75;
      rowRef.current.scrollTo({ left: scrollLeft + scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <div className="my-8 relative group">
      {/* Row Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-3 flex items-center justify-between">
        <h2 className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-wide flex items-center gap-2.5">
          <span 
            className="w-1.5 h-4.5 rounded-full inline-block"
            style={{ backgroundColor: "var(--theme-primary)" }}
          />
          {title}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-medium">
            {movies.length} {movies.length === 1 ? "item" : "items"}
          </span>
          {onClearRow && (
            <button
              onClick={onClearRow}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 hover:bg-rose-600/20 text-slate-400 hover:text-rose-400 border border-white/10 hover:border-rose-500/40 text-xs font-semibold transition-all duration-150"
            >
              <Trash2 className="w-3 h-3 text-rose-400" />
              Clear History
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Container with Left/Right Buttons and UNIFORM GAPS */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Left Arrow */}
        <button
          onClick={() => scroll("left")}
          className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/75 hover:bg-slate-800 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-xl backdrop-blur-md border border-white/10 hover:scale-105 active:scale-95"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Uniform Gap Row */}
        <div
          ref={rowRef}
          className="flex items-center gap-5 overflow-x-auto no-scrollbar scroll-smooth py-3 px-1"
        >
          {movies.map((movie, idx) => (
            <div key={movie.subject_id || `${movie.slug}-${idx}`} className="w-36 sm:w-44 md:w-48 lg:w-52 flex-shrink-0">
              <MovieCard
                movie={movie}
                onSelect={onSelectMovie}
                onPlay={onPlayMovie}
                isWatchlisted={isWatchlisted}
                onToggleWatchlist={onToggleWatchlist}
                onRemove={onRemoveItem}
                progress={progressMap?.[movie.subject_id]}
              />
            </div>
          ))}
        </div>

        {/* Right Arrow */}
        <button
          onClick={() => scroll("right")}
          className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/75 hover:bg-slate-800 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-xl backdrop-blur-md border border-white/10 hover:scale-105 active:scale-95"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
