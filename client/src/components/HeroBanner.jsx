import React, { useState, useEffect, useRef } from "react";
import { Play, Info, Bookmark, Star, ChevronLeft, ChevronRight, Sparkles, Tv } from "lucide-react";
import { isTvSeries } from "../services/seriesHelper";

export default function HeroBanner({ banners = [], onPlay, onOpenDetail, onToggleWatchlist, isWatchlisted, onSurpriseMe }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!banners.length || isPaused) return;
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 6500);
    return () => clearInterval(timerRef.current);
  }, [banners.length, isPaused]);

  if (!banners.length) return null;

  const current = banners[currentIndex];
  const inWatchlist = isWatchlisted(current.subject_id);
  const isSeries = isTvSeries(current);

  const handlePlayClick = () => {
    if (isSeries) {
      onPlay(current, 1, 1, { isSeries: true });
    } else {
      onPlay(current);
    }
  };

  return (
    <div 
      className="relative w-full h-[68vh] sm:h-[78vh] lg:h-[84vh] overflow-hidden select-none bg-[#07090e]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Backdrop Image with smooth crossfade and zoom */}
      <div 
        key={current.poster_url || currentIndex}
        className="absolute inset-0 bg-cover bg-center transition-all duration-1000 transform scale-105 animate-in fade-in zoom-in-105"
        style={{
          backgroundImage: `url(${current.poster_url})`,
        }}
      >
        {/* Layered Cinema Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07090e] via-[#07090e]/65 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07090e] via-[#07090e]/80 to-transparent w-full md:w-3/4" />
        <div className="absolute inset-0 bg-radial-gradient from-transparent to-[#07090e]/70" />
      </div>

      {/* Content Container */}
      <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-16 sm:pb-20 z-10">
        <div className="max-w-2xl space-y-4">
          
          {/* Metadata badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {current.badge ? (
              <span 
                className="px-2.5 py-1 rounded-full text-[11px] font-black tracking-wider uppercase text-white shadow-lg"
                style={{ backgroundColor: "var(--theme-primary)", boxShadow: "0 4px 15px -2px var(--theme-glow)" }}
              >
                {current.badge}
              </span>
            ) : isSeries ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase text-white bg-white/15 border border-white/20 backdrop-blur-md">
                <Tv className="w-3 h-3" />
                Series
              </span>
            ) : null}

            {current.rating && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30 backdrop-blur-sm shadow-sm">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                {current.rating}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-slate-300 backdrop-blur-md border border-white/10">
              Ultra HD 4K
            </span>
            {current.genre && (
              <span className="text-xs font-medium text-slate-300/80">
                {current.genre}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight drop-shadow-2xl">
            {current.name}
          </h1>

          {/* Description */}
          {current.description && (
            <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 sm:line-clamp-3 leading-relaxed drop-shadow-md max-w-xl font-normal">
              {current.description}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handlePlayClick}
              className="flex items-center gap-2.5 px-6 sm:px-7 py-3 rounded-full text-white font-bold text-sm shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 btn-theme group"
            >
              <Play className="w-4 h-4 fill-white transition-transform group-hover:scale-110" />
              {isSeries ? "Watch Series" : "Watch Now"}
            </button>

            <button
              onClick={() => onOpenDetail(current)}
              className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm backdrop-blur-xl border border-white/15 hover:border-white/30 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg"
            >
              <Info className="w-4 h-4" />
              {isSeries ? "Episodes & Info" : "Details"}
            </button>

            {onSurpriseMe && (
              <button
                onClick={onSurpriseMe}
                title="Random Pick"
                className="hidden sm:flex items-center gap-2 px-4 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm backdrop-blur-xl border border-white/15 hover:border-white/30 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                Random
              </button>
            )}

            <button
              onClick={() => onToggleWatchlist(current)}
              title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
              className={`p-3 rounded-full border transition-all duration-200 hover:scale-105 active:scale-95 backdrop-blur-xl shadow-lg ${inWatchlist ? "bg-white/20 border-white/40 text-white" : "bg-white/10 border-white/15 text-white hover:bg-white/20"}`}
            >
              <Bookmark className={`w-4 h-4 ${inWatchlist ? "fill-white text-white" : ""}`} />
            </button>
          </div>
        </div>

        {/* Carousel Indicators & Next/Prev */}
        <div className="absolute right-4 sm:right-8 bottom-16 sm:bottom-20 flex items-center gap-2">
          <button
            onClick={() => setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)}
            aria-label="Previous banner"
            className="p-2 rounded-full bg-black/50 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md border border-white/10 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex gap-1.5 px-2">
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${currentIndex === idx ? "w-6" : "w-1.5 bg-white/30 hover:bg-white/60"}`}
                style={currentIndex === idx ? { backgroundColor: "var(--theme-primary)" } : {}}
              />
            ))}
          </div>

          <button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % banners.length)}
            aria-label="Next banner"
            className="p-2 rounded-full bg-black/50 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md border border-white/10 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
