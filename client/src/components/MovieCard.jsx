import React, { memo } from "react";
import { Play, Star, Bookmark, Film, Trash2, ListFilter } from "lucide-react";
import { isTvSeries } from "../services/seriesHelper";

function MovieCard({ movie, onSelect, onPlay, isWatchlisted, onToggleWatchlist, onRemove, progress }) {
  if (!movie) return null;
  const inWatchlist = isWatchlisted?.(movie.subject_id);
  const isSeries = isTvSeries(movie);
  const hasProgress = progress && progress.percent > 2 && progress.percent < 96 && progress.time > 15;

  const handlePlayClick = (e) => {
    e.stopPropagation();
    if (isSeries) {
      const playSe = progress?.season || 1;
      const playEp = progress?.episode || 1;
      onPlay(movie, playSe, playEp, { isSeries: true });
    } else {
      onPlay(movie);
    }
  };

  return (
    <div className="group relative flex-shrink-0 cursor-pointer select-none">
      {/* Poster Container with isolated GPU layer */}
      <div 
        onClick={() => onSelect(movie)}
        className="movie-tile poster-frame rounded-2xl overflow-hidden border border-white/10 shadow-lg group-hover:border-white/20 transition-all duration-200"
      >
        {movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt={movie.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              e.target.onerror = null;
              e.target.style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-slate-900 to-slate-950 text-slate-500">
            <Film className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-[11px] text-center font-medium text-slate-400 line-clamp-2">
              {movie.name}
            </span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10 gap-1.5">
          {movie.badge ? (
            <span 
              className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase text-white shadow-md backdrop-blur-md"
              style={{ backgroundColor: "var(--theme-primary)" }}
            >
              {movie.badge}
            </span>
          ) : isSeries ? (
            <span 
              className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase text-white shadow-md backdrop-blur-md bg-white/20 border border-white/20"
            >
              Series
            </span>
          ) : <span />}

          {movie.rating && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] font-bold bg-black/75 text-amber-300 backdrop-blur-md border border-white/10 shadow">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              {movie.rating}
            </span>
          )}
        </div>

        {/* Subtle Ambient Bottom Progress Bar if previously watched */}
        {hasProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/75 z-20 overflow-hidden">
            <div 
              className="h-full transition-all duration-300 shadow-[0_0_8px_var(--theme-primary)]"
              style={{ 
                width: `${progress.percent}%`,
                backgroundColor: "var(--theme-primary)"
              }}
            />
          </div>
        )}

        {/* Hover Gradient Overlay with Instant Play / Episodes */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 z-30">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handlePlayClick}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white font-bold text-xs shadow-lg transition-transform active:scale-95 btn-theme hover:scale-105"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              {hasProgress ? (isSeries && progress.episode ? `Resume E${progress.episode}` : "Resume") : (isSeries ? "Play S1" : "Play")}
            </button>

            {isSeries && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(movie);
                }}
                title="Choose Episode"
                className="p-2 rounded-xl border border-white/20 bg-black/60 text-white hover:bg-white/20 backdrop-blur-md transition-all hover:scale-105"
              >
                <ListFilter className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleWatchlist?.(movie);
              }}
              title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
              className={`p-2 rounded-xl border backdrop-blur-md transition-all hover:scale-105 ${inWatchlist ? "bg-white/20 border-white/40 text-white" : "bg-black/60 border-white/20 text-white hover:bg-white/20"}`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${inWatchlist ? "fill-white text-white" : ""}`} />
            </button>

            {onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(movie);
                }}
                title="Remove from history"
                className="p-2 rounded-xl border border-rose-500/30 bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white backdrop-blur-md transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Uniform Title & Info below card */}
      <div className="mt-2.5 px-0.5" onClick={() => onSelect(movie)}>
        <h3 className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-white transition-colors truncate">
          {movie.name}
        </h3>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
          {movie.year && <span>{movie.year}</span>}
          {movie.genre && <span className="truncate max-w-[120px]">{movie.genre}</span>}
          {isSeries && !movie.genre && <span className="text-[10px] text-slate-400 uppercase font-medium">TV Series</span>}
        </div>
      </div>
    </div>
  );
}

export default memo(MovieCard);
