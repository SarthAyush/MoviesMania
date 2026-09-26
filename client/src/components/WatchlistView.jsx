import React, { useState } from "react";
import { Bookmark, Clock, Trash2, Film } from "lucide-react";
import MovieCard from "./MovieCard";

export default function WatchlistView({
  watchlist = [],
  history = [],
  onSelectMovie,
  onPlayMovie,
  onRemoveFromWatchlist,
  onClearHistory,
  onRemoveFromHistory,
  progressMap
}) {
  const [libraryTab, setLibraryTab] = useState("watchlist");

  const isHistoryTab = libraryTab === "history";
  const activeItems = isHistoryTab ? history : watchlist;

  return (
    <div className="pt-24 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Top Header with Library Navigation Tabs */}
      <div className="border-b border-slate-800 pb-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <span 
              className="w-2 h-6 rounded-full inline-block"
              style={{ backgroundColor: "var(--theme-primary)" }}
            />
            {isHistoryTab ? "Watch History" : "My Watchlist"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {isHistoryTab
              ? `${history.length} ${history.length === 1 ? "title" : "titles"} recently watched`
              : `${watchlist.length} ${watchlist.length === 1 ? "title" : "titles"} saved to your library`}
          </p>
        </div>

        {/* Tab Switcher & Clear History Action */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              onClick={() => setLibraryTab("watchlist")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !isHistoryTab
                  ? "bg-white/10 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Watchlist</span>
              <span className="text-[10px] bg-white/10 px-1.5 py-0.2 rounded-full font-bold">
                {watchlist.length}
              </span>
            </button>

            <button
              onClick={() => setLibraryTab("history")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isHistoryTab
                  ? "bg-white/10 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Watch History</span>
              <span className="text-[10px] bg-white/10 px-1.5 py-0.2 rounded-full font-bold">
                {history.length}
              </span>
            </button>
          </div>

          {/* Clear History Button (only in history tab if items exist) */}
          {isHistoryTab && history.length > 0 && onClearHistory && (
            <button
              onClick={onClearHistory}
              title="Clear all watch history"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600/15 hover:bg-rose-600 border border-rose-500/30 text-rose-400 hover:text-white text-xs font-semibold transition-all duration-150"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear History</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {activeItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-center text-slate-500 gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
            {isHistoryTab ? (
              <Clock className="w-8 h-8 opacity-40 text-slate-400" />
            ) : (
              <Bookmark className="w-8 h-8 opacity-40 text-slate-400" />
            )}
          </div>
          <h3 className="text-lg font-bold text-slate-300">
            {isHistoryTab ? "No watch history found" : "Your Watchlist is empty"}
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-sm">
            {isHistoryTab
              ? "Movies and shows you stream will be automatically remembered here so you can pick up where you left off."
              : "Save movies and TV shows you want to watch later by clicking the bookmark icon on any title."}
          </p>
        </div>
      ) : (
        /* Uniform Grid with pixel-perfect spacing */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 sm:gap-6">
          {activeItems.map((movie) => (
            <div key={movie.subject_id} className="w-full">
              <MovieCard
                movie={movie}
                onSelect={onSelectMovie}
                onPlay={(m) => onPlayMovie(m, m.season || 0, m.episode || 0)}
                isWatchlisted={() => watchlist.some((i) => String(i.subject_id) === String(movie.subject_id))}
                onToggleWatchlist={() => onRemoveFromWatchlist?.(movie.subject_id)}
                onRemove={isHistoryTab ? () => onRemoveFromHistory?.(movie.subject_id) : undefined}
                progress={progressMap?.[movie.subject_id]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
