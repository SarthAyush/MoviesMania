import React, { useState, useEffect, useMemo } from "react";
import { X, Play, Star, Calendar, Clock, Globe, Bookmark, Film, Loader2, ListFilter, Volume2, Tv, Sparkles, Layers } from "lucide-react";
import { fetchMovieDetail, fetchSearchResults } from "../services/api";
import { parseSeriesData, isTvSeries } from "../services/seriesHelper";

export default function DetailModal({ movie, onClose, onPlay, isWatchlisted, onToggleWatchlist }) {
  const [detailData, setDetailData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedDub, setSelectedDub] = useState(null);
  const [activeEpisodeRange, setActiveEpisodeRange] = useState(0); // 0 = first 24, 1 = next 24...

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    async function loadData() {
      try {
        let activeSlug = movie?.slug;
        let activeSubjectId = movie?.subject_id;

        // If slug is missing (e.g. from keyword search), resolve it by searching movie.name
        if (!activeSlug && movie?.name) {
          const searchRes = await fetchSearchResults(movie.name, 1);
          if (searchRes.items && searchRes.items.length > 0) {
            activeSlug = searchRes.items[0].slug;
            activeSubjectId = searchRes.items[0].subject_id;
          }
        }

        if (!activeSlug && !activeSubjectId) {
          throw new Error("Unable to locate title slug or ID");
        }

        const res = await fetchMovieDetail(activeSlug, activeSubjectId);
        if (isMounted) {
          setDetailData(res.data || {});
          
          // Parse seasons using the universal algorithm
          const { seasons } = parseSeriesData(res.data?.resource?.seasons, res.data?.subject, movie);
          if (seasons.length > 0) {
            setSelectedSeason(seasons[0].se);
          }

          // Check dubs / audio languages
          const dubs = res.data?.subject?.dubs || [];
          if (dubs.length > 0) {
            const currentDub = dubs.find(d => d.detailPath === activeSlug) || dubs.find(d => d.original) || dubs[0];
            setSelectedDub(currentDub);
          }
        }
      } catch (err) {
        console.error("Failed to load details", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [movie]);

  // Global Escape key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!movie) return null;

  const subject = detailData?.subject || {};
  const resource = detailData?.resource || {};
  const stars = detailData?.stars || [];
  const dubs = subject?.dubs || [];
  const inWatchlist = isWatchlisted?.(movie.subject_id || subject?.subjectId);

  // Genre pills
  const rawGenre = subject.genre || movie.genre || "";
  const genres = rawGenre ? rawGenre.split(/[,/]/).map(g => g.trim()).filter(Boolean) : [];

  // Parse Series & Season Data using universal algorithm
  const { isSeries, seasons: normalizedSeasons } = useMemo(() => {
    return parseSeriesData(resource?.seasons, subject, movie);
  }, [resource?.seasons, subject, movie]);

  // Active season data
  const currentSeasonData = normalizedSeasons.find((s) => s.se === selectedSeason) || normalizedSeasons[0] || {
    se: 1,
    originalSe: 1,
    episodes: [1],
    totalEpisodes: 1
  };

  const episodesList = currentSeasonData.episodes || [1];

  // Episode range chunking (24 per page for smooth UI if season has > 24 episodes)
  const CHUNK_SIZE = 24;
  const totalChunks = Math.ceil(episodesList.length / CHUNK_SIZE);
  const visibleEpisodes = totalChunks > 1 
    ? episodesList.slice(activeEpisodeRange * CHUNK_SIZE, (activeEpisodeRange + 1) * CHUNK_SIZE)
    : episodesList;

  // Check saved progress for this title to show "Resume S... E..."
  const savedProgress = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("cinebox_playback_progress") || "{}");
      return stored[movie.subject_id] || null;
    } catch {
      return null;
    }
  }, [movie.subject_id]);

  const handleStartPlay = (se = 0, ep = 0) => {
    const targetMovie = selectedDub ? {
      ...movie,
      subject_id: selectedDub.subjectId,
      slug: selectedDub.detailPath,
      name: `${subject.title || movie.name} (${selectedDub.lanName})`
    } : movie;

    const playSeason = isSeries ? (se || selectedSeason || 1) : 0;
    const playEpisode = isSeries ? (ep || 1) : 0;

    onPlay(targetMovie, playSeason, playEpisode, {
      allSeasons: isSeries ? normalizedSeasons : [],
      allDubs: dubs,
      currentDub: selectedDub,
      isSeries: isSeries
    });
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] bg-[#0c101a]/95 border border-white/10 rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95)] flex flex-col animate-in zoom-in-95 duration-250 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 z-30 p-2.5 rounded-full bg-black/50 hover:bg-white/20 text-slate-300 hover:text-white transition-all backdrop-blur-md border border-white/10 hover:scale-105 active:scale-95 group shadow-lg"
        >
          <X className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200" />
        </button>

        {/* Modal Scroll Content */}
        <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-white/10">
          {/* Header Banner */}
          <div className="relative min-h-[280px] sm:min-h-[340px] w-full overflow-hidden bg-slate-950 flex items-end">
            {/* Background Backdrop Artwork with Deep Glow & Vignette */}
            <div
              className="absolute inset-0 bg-cover bg-center filter brightness-[0.45] saturate-125 scale-105 transition-all duration-700"
              style={{
                backgroundImage: `url(${movie.poster_url || subject.cover?.url})`,
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0c101a] via-[#0c101a]/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0c101a] via-[#0c101a]/50 to-transparent" />

            <div className="relative z-10 w-full p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-end gap-6">
              {/* Poster image card */}
              <div className="relative group/poster flex-shrink-0 hidden sm:block">
                <img
                  src={movie.poster_url || subject.cover?.url}
                  alt={movie.name}
                  className="w-32 sm:w-36 h-48 sm:h-52 object-cover rounded-2xl shadow-2xl border border-white/15"
                />
                <div className="absolute inset-0 rounded-2xl shadow-[inset_0_0_20px_rgba(0,0,0,0.4)] pointer-events-none" />
              </div>

              <div className="space-y-3 max-w-xl text-center sm:text-left">
                {/* Meta Badges */}
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  {subject.imdbRatingValue && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-400/10 text-amber-300 border border-amber-400/25 shadow-sm">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {subject.imdbRatingValue}
                    </span>
                  )}
                  {subject.corner && (
                    <span 
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white uppercase tracking-wider shadow-sm"
                      style={{ backgroundColor: "var(--theme-primary)", boxShadow: "0 2px 10px -2px var(--theme-glow)" }}
                    >
                      {subject.corner}
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-slate-300 border border-white/10">
                    {isSeries ? "TV Series" : "Movie"}
                  </span>
                  {genres.slice(0, 3).map((g, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-slate-300 border border-white/5">
                      {g}
                    </span>
                  ))}
                </div>

                <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                  {subject.title || movie.name}
                </h2>

                <div className="flex items-center justify-center sm:justify-start gap-4 text-xs text-slate-300/90 font-medium flex-wrap">
                  {subject.releaseDate && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {subject.releaseDate.slice(0, 4)}
                    </span>
                  )}
                  {subject.duration ? (
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {Math.floor(subject.duration / 60)}h {subject.duration % 60}m
                    </span>
                  ) : null}
                  {subject.countryName && (
                    <span className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      {subject.countryName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="px-6 py-4 bg-[#0e1320]/80 backdrop-blur-md border-y border-white/5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (savedProgress && savedProgress.season && savedProgress.episode) {
                    handleStartPlay(savedProgress.season, savedProgress.episode);
                  } else {
                    handleStartPlay(isSeries ? selectedSeason : 0, isSeries ? (episodesList[0] || 1) : 0);
                  }
                }}
                className="flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all hover:scale-105 active:scale-95 group"
                style={{
                  backgroundColor: "var(--theme-primary)",
                  boxShadow: "0 6px 20px -3px var(--theme-glow)"
                }}
              >
                <Play className="w-4 h-4 fill-white transition-transform group-hover:scale-110" />
                {isSeries ? (
                  savedProgress?.season && savedProgress?.episode 
                    ? `Resume S${savedProgress.season} E${savedProgress.episode}`
                    : `Play S${selectedSeason} E${episodesList[0] || 1}`
                ) : "Watch Now"}
              </button>

              <button
                onClick={() => onToggleWatchlist?.(movie)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all hover:scale-105 active:scale-95 ${inWatchlist ? "bg-white/10 border-white/30 text-white shadow-md" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"}`}
              >
                <Bookmark className={`w-4 h-4 transition-transform ${inWatchlist ? "fill-[var(--theme-primary)] text-[var(--theme-primary)]" : ""}`} />
                {inWatchlist ? "Saved in List" : "Add to List"}
              </button>
            </div>

            {/* Audio Language / Dub selector */}
            {dubs.length > 0 && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 shadow-sm">
                <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-400 font-medium">Audio:</span>
                <select
                  value={selectedDub?.detailPath || ""}
                  onChange={(e) => {
                    const found = dubs.find(d => d.detailPath === e.target.value);
                    if (found) setSelectedDub(found);
                  }}
                  className="bg-transparent text-xs text-white focus:outline-none cursor-pointer pr-1"
                >
                  {dubs.map((d) => (
                    <option key={d.detailPath} value={d.detailPath} className="bg-slate-900 text-white">
                      {d.lanName} {d.original ? "★" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Main Body */}
          <div className="p-6 sm:p-8 space-y-7">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-[var(--theme-primary)]" />
                <span className="text-xs tracking-wider uppercase font-semibold">Loading movie details & stream info...</span>
              </div>
            ) : (
              <>
                {/* Synopsis */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--theme-primary)" }} />
                    Overview
                  </h3>
                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed font-normal">
                    {subject.description || "No overview available for this title."}
                  </p>
                </div>

                {/* Series Episodes Navigator */}
                {isSeries && (
                  <div className="space-y-4 pt-2 bg-white/[0.02] p-4 sm:p-5 rounded-2xl border border-white/5">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3 flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <ListFilter className="w-4 h-4 text-[var(--theme-primary)]" />
                        <h3 className="text-xs font-bold text-white uppercase tracking-widest">
                          Episodes & Seasons
                        </h3>
                        <span className="text-[11px] text-slate-400 font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/5">
                          {normalizedSeasons.length} {normalizedSeasons.length === 1 ? "Season" : "Seasons"} • {episodesList.length} Episodes
                        </span>
                      </div>

                      {/* Season Switcher Tabs */}
                      {normalizedSeasons.length > 1 && (
                        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5 overflow-x-auto no-scrollbar max-w-full">
                          {normalizedSeasons.map((s) => {
                            const isSelected = selectedSeason === s.se;
                            return (
                              <button
                                key={s.se}
                                onClick={() => {
                                  setSelectedSeason(s.se);
                                  setActiveEpisodeRange(0);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                  isSelected 
                                    ? "text-white shadow-md font-bold" 
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                                }`}
                                style={isSelected ? { backgroundColor: "var(--theme-primary)" } : {}}
                              >
                                Season {s.se} ({s.episodes.length})
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Long Season Range Chunks (e.g. 1-24, 25-48 for Anime / Big Shows) */}
                    {totalChunks > 1 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                        <span className="text-[11px] text-slate-400 font-medium mr-1">Episodes:</span>
                        {Array.from({ length: totalChunks }, (_, idx) => {
                          const start = idx * CHUNK_SIZE + 1;
                          const end = Math.min((idx + 1) * CHUNK_SIZE, episodesList.length);
                          const isActive = activeEpisodeRange === idx;
                          return (
                            <button
                              key={idx}
                              onClick={() => setActiveEpisodeRange(idx)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                isActive 
                                  ? "bg-white/20 text-white border border-white/30" 
                                  : "bg-white/5 text-slate-400 hover:text-white"
                              }`}
                            >
                              {start} - {end}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Episode Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-72 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 pt-1">
                      {visibleEpisodes.map((epNum) => {
                        const isCurrentSaved = savedProgress?.season === selectedSeason && savedProgress?.episode === epNum;
                        return (
                          <button
                            key={epNum}
                            onClick={() => handleStartPlay(selectedSeason, epNum)}
                            className={`flex items-center justify-between p-3 rounded-xl border text-slate-200 transition-all duration-150 group hover:scale-[1.02] active:scale-[0.98] ${
                              isCurrentSaved 
                                ? "bg-white/15 border-[var(--theme-primary)] text-white shadow-md shadow-[var(--theme-glow)]" 
                                : "bg-white/[0.04] hover:bg-white/[0.09] border-white/5 hover:border-white/20"
                            }`}
                          >
                            <div className="flex flex-col text-left">
                              <span className="text-xs font-semibold group-hover:text-white transition-colors">
                                Ep {epNum}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {isCurrentSaved ? "Resume" : `S${selectedSeason} E${epNum}`}
                              </span>
                            </div>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                              isCurrentSaved 
                                ? "bg-[var(--theme-primary)] text-white" 
                                : "bg-white/5 group-hover:bg-[var(--theme-primary)] text-slate-400 group-hover:text-white"
                            }`}>
                              <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Cast & Crew */}
                {stars.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--theme-primary)" }} />
                      Featured Cast
                    </h3>
                    <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
                      {stars.map((star, idx) => (
                        <div key={idx} className="flex-shrink-0 flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] p-2.5 rounded-2xl border border-white/5 pr-4 transition-colors">
                          {star.avatar?.url ? (
                            <img src={star.avatar.url} alt={star.name} className="w-10 h-10 rounded-full object-cover border border-white/10" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-slate-300">
                              {star.name?.charAt(0) || "A"}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-white leading-tight">{star.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{star.characterName || "Actor"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
