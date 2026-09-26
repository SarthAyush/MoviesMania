import React, { useState, useEffect, useRef } from "react";
import {
  Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX,
  Maximize, Minimize, Minimize2, Maximize2, PictureInPicture2, Settings, Subtitles, X, Loader2,
  SkipForward, AlertCircle, Check, ListFilter, Languages, RefreshCw,
  Sliders, Gauge, HelpCircle
} from "lucide-react";
import { fetchStreamSources, fetchCaptions, fetchMovieDetail } from "../services/api";
import { parseSeriesData, isTvSeries } from "../services/seriesHelper";

export default function VideoPlayer({
  movie,
  season = 0,
  episode = 0,
  onClose,
  onNextEpisode,
  meta = {}, // { allSeasons, allDubs, currentDub }
  onToast,
  onProgressUpdate
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const progressBarRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  // Keep track of timestamp when switching audio/resolution
  const savedTimestampRef = useRef(0);
  const wasPlayingRef = useRef(true);

  // Stream state
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState(null);
  const [sources, setSources] = useState([]);
  const [currentQuality, setCurrentQuality] = useState("");
  const [currentStreamUrl, setCurrentStreamUrl] = useState("");

  // Seasons & Episodes state
  const [currentSeason, setCurrentSeason] = useState(season || 1);
  const [currentEpisode, setCurrentEpisode] = useState(episode || 1);
  const [seasonsList, setSeasonsList] = useState(() => {
    if (meta.allSeasons && Array.isArray(meta.allSeasons) && meta.allSeasons.length > 0) {
      return meta.allSeasons;
    }
    return [];
  });
  const [showEpisodesDrawer, setShowEpisodesDrawer] = useState(false);

  // Dubs / Audio languages state
  const [dubsList, setDubsList] = useState(meta.allDubs || []);
  const [activeDub, setActiveDub] = useState(meta.currentDub || null);
  const [showAudioMenu, setShowAudioMenu] = useState(false);

  // Subtitles
  const [captions, setCaptions] = useState([]);
  const [selectedCaption, setSelectedCaption] = useState("off");
  const [activeSubtitleText, setActiveSubtitleText] = useState("");
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showCaptionCustomizer, setShowCaptionCustomizer] = useState(false);

  // Caption customization preferences (persisted in localStorage)
  const [captionSettings, setCaptionSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("cinebox_caption_settings");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      fontSize: "22px",      // 16px, 22px, 28px, 34px
      color: "#ffffff",       // #ffffff, #fde047, #22d3ee, #4ade80
      bgColor: "rgba(0,0,0,0.65)", // transparent, rgba(0,0,0,0.65), rgba(0,0,0,0.95)
      edgeStyle: "shadow",   // none, shadow, outline
      bottomOffset: "12%"    // 8%, 12%, 18%
    };
  });

  const updateCaptionSetting = (key, val) => {
    setCaptionSettings((prev) => {
      const updated = { ...prev, [key]: val };
      try {
        localStorage.setItem("cinebox_caption_settings", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Floating In-App Mini-Player state
  const [isMini, setIsMini] = useState(false);
  const lastSaveTimeRef = useRef(0);

  // Native Picture-in-Picture toggle
  const toggleNativePip = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn("Native PiP error:", err);
      setIsMini(true);
    }
  };

  // Soothing Soft Volume Ramp-Up (Prevents sudden loud blast on playback start)
  const fadeAudioIn = (targetVolume = volume) => {
    if (!videoRef.current) return;
    const vid = videoRef.current;
    if (isMuted || targetVolume === 0) {
      vid.volume = 0;
      return;
    }
    vid.volume = 0.05;
    let cur = 0.05;
    const effectiveTarget = Math.max(0.1, targetVolume);
    const step = effectiveTarget / 8;
    const timer = setInterval(() => {
      if (!videoRef.current) {
        clearInterval(timer);
        return;
      }
      cur = Math.min(effectiveTarget, cur + step);
      videoRef.current.volume = cur;
      if (cur >= effectiveTarget) {
        clearInterval(timer);
      }
    }, 35);
  };

  // Progress scrubbing states
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [hoverPosition, setHoverPosition] = useState(null); // { percent, time }

  // Load seasons / dubs metadata if missing
  useEffect(() => {
    if (!seasonsList.length && (movie?.slug || movie?.subject_id)) {
      fetchMovieDetail(movie.slug, movie.subject_id)
        .then((res) => {
          const { isSeries: detectedSeries, seasons } = parseSeriesData(
            res.data?.resource?.seasons,
            res.data?.subject,
            movie
          );
          if (detectedSeries && seasons.length > 0) {
            setSeasonsList(seasons);
          }
          const d = res.data?.subject?.dubs || [];
          if (d.length && !dubsList.length) setDubsList(d);
        })
        .catch(() => {});
    }
  }, [movie?.slug, movie?.subject_id, seasonsList.length]);

  // Load stream and captions whenever movie, dub, season, or episode changes
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const activeSubjectId = activeDub?.subjectId || movie.subject_id;
    const activeDetailPath = activeDub?.detailPath || movie.slug;

    async function loadMedia() {
      try {
        const streamData = await fetchStreamSources(activeSubjectId, activeDetailPath, currentSeason, currentEpisode);
        const availableSources = streamData.sources || [];

        if (!availableSources.length) {
          throw new Error(streamData.note || "No playable stream found for this selection.");
        }

        if (isMounted) {
          setSources(availableSources);
          // Pick best quality (1080p, else first)
          const primary = availableSources.find((s) => s.resolution === "1080p") || availableSources[0];
          setCurrentQuality(primary.resolution);
          setCurrentStreamUrl(primary.proxy_url || primary.url);
        }

        // Fetch captions
        try {
          const capData = await fetchCaptions(activeSubjectId, activeDetailPath, currentSeason, currentEpisode);
          if (isMounted) {
            setCaptions(capData.captions || []);
          }
        } catch (capErr) {
          console.warn("Captions error:", capErr);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to load video stream.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadMedia();
    return () => {
      isMounted = false;
    };
  }, [movie.subject_id, movie.slug, activeDub, currentSeason, currentEpisode]);

  // Resume playback from saved timestamp when new stream metadata loads
  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const vid = videoRef.current;
    const totalDuration = vid.duration || 0;
    setDuration(totalDuration);
    vid.playbackRate = playbackSpeed;

    if (savedTimestampRef.current > 0) {
      vid.currentTime = savedTimestampRef.current;
      setCurrentTime(savedTimestampRef.current);
      savedTimestampRef.current = 0;
      if (wasPlayingRef.current) {
        vid.play().catch(() => {});
        setIsPlaying(true);
        fadeAudioIn();
      }
    } else {
      // Check stored progress from localStorage
      try {
        const stored = JSON.parse(localStorage.getItem("cinebox_playback_progress") || "{}");
        const progKey = `${movie.subject_id}_s${currentSeason}_e${currentEpisode}`;
        const prevProg = stored[progKey] || stored[movie.subject_id];
        if (prevProg && prevProg.time > 15 && prevProg.percent < 95) {
          vid.currentTime = prevProg.time;
          setCurrentTime(prevProg.time);
          if (onToast) {
            const mins = Math.floor(prevProg.time / 60);
            const secs = String(Math.floor(prevProg.time % 60)).padStart(2, "0");
            onToast(`Resumed from ${mins}:${secs}`, "info");
          }
        }
      } catch (e) {}

      vid.play().catch(() => {});
      setIsPlaying(true);
      fadeAudioIn();
    }
  };

  // Subtitle cue listener
  useEffect(() => {
    if (!videoRef.current) return;
    const vid = videoRef.current;

    const setupTracks = () => {
      const tracks = vid.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (selectedCaption === "off") {
          track.mode = "disabled";
        } else if (track.id === String(selectedCaption)) {
          track.mode = "hidden"; // hidden parses cues without browser's default ugly render
          track.oncuechange = () => {
            const cues = track.activeCues;
            if (cues && cues.length > 0) {
              setActiveSubtitleText(cues[0].text);
            } else {
              setActiveSubtitleText("");
            }
          };
        } else {
          track.mode = "disabled";
        }
      }
    };

    setupTracks();
  }, [selectedCaption, captions]);

  // Handle controls auto-hide
  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (
        isPlaying &&
        !showEpisodesDrawer &&
        !showAudioMenu &&
        !showQualityMenu &&
        !showSubtitleMenu &&
        !showCaptionCustomizer &&
        !isDragging
      ) {
        setShowControls(false);
      }
    }, 3500);
  };

  const handleMouseMove = () => triggerControls();

  // Play / Pause toggle
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    triggerControls();
  };

  // Seek +/- 10 seconds
  const handleSeekOffset = (seconds) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(videoRef.current.currentTime + seconds, duration));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    triggerControls();
  };

  // Progress Bar Dragging & Seeking Handlers
  const calculateTimeFromEvent = (e) => {
    if (!progressBarRef.current || !duration) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = offsetX / rect.width;
    return percent * duration;
  };

  const handleProgressMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    const targetTime = calculateTimeFromEvent(e);
    setDragTime(targetTime);
  };

  const handleProgressMouseMove = (e) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = (offsetX / rect.width) * 100;
    const time = (offsetX / rect.width) * duration;
    setHoverPosition({ percent, time });

    if (isDragging) {
      setDragTime(time);
    }
  };

  const handleProgressMouseLeave = () => {
    setHoverPosition(null);
  };

  // Global Mouse Up / Touch End to finalize drag seek
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        if (videoRef.current) {
          videoRef.current.currentTime = dragTime;
          setCurrentTime(dragTime);
        }
        setIsDragging(false);
      }
    };

    const handleGlobalMouseMove = (e) => {
      if (isDragging) {
        const time = calculateTimeFromEvent(e);
        setDragTime(time);
      }
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
      window.addEventListener("touchmove", handleGlobalMouseMove);
      window.addEventListener("touchend", handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("touchmove", handleGlobalMouseMove);
      window.removeEventListener("touchend", handleGlobalMouseUp);
    };
  }, [isDragging, dragTime, duration]);

  // Track buffered ranges and sync playback progress
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const vid = videoRef.current;
    if (!isDragging) {
      setCurrentTime(vid.currentTime);
    }
    if (vid.buffered && vid.buffered.length > 0) {
      try {
        setBufferedEnd(vid.buffered.end(vid.buffered.length - 1));
      } catch {}
    }

    // Save playback progress to localStorage every 2 seconds
    const now = Date.now();
    if (now - lastSaveTimeRef.current > 2000 && vid.duration > 10) {
      lastSaveTimeRef.current = now;
      const progressObj = {
        subject_id: movie.subject_id,
        title: movie.name || movie.title,
        season: currentSeason,
        episode: currentEpisode,
        time: Math.floor(vid.currentTime),
        duration: Math.floor(vid.duration),
        percent: Math.min(100, Math.round((vid.currentTime / vid.duration) * 100)),
        updatedAt: now
      };
      try {
        const stored = JSON.parse(localStorage.getItem("cinebox_playback_progress") || "{}");
        const progKey = `${movie.subject_id}_s${currentSeason}_e${currentEpisode}`;
        stored[progKey] = progressObj;
        stored[movie.subject_id] = progressObj;
        localStorage.setItem("cinebox_playback_progress", JSON.stringify(stored));
      } catch (e) {}

      if (onProgressUpdate) {
        onProgressUpdate(progressObj);
      }
    }
  };

  // Volume
  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRef.current.muted = nextMuted;
    if (!nextMuted && volume === 0) {
      setVolume(0.5);
      videoRef.current.volume = 0.5;
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Quality switch (preserves exact playback time)
  const switchQuality = (res) => {
    const target = sources.find((s) => s.resolution === res);
    if (!target || !videoRef.current) return;
    
    savedTimestampRef.current = videoRef.current.currentTime;
    wasPlayingRef.current = !videoRef.current.paused;

    setCurrentQuality(res);
    setCurrentStreamUrl(target.proxy_url || target.url);
    setShowQualityMenu(false);
  };

  // Audio Dub switch (PRESERVES EXACT PLAYBACK TIME)
  const switchAudioDub = (dub) => {
    if (!videoRef.current) return;
    savedTimestampRef.current = videoRef.current.currentTime;
    wasPlayingRef.current = !videoRef.current.paused;

    setActiveDub(dub);
    setShowAudioMenu(false);
    if (onToast) onToast(`Audio switched to ${dub.lanName}`, "info");
  };

  // Playback Speed switch
  const switchPlaybackSpeed = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
    if (onToast) onToast(`Speed set to ${speed}x`, "info");
  };

  // Subtitle switch
  const switchSubtitle = (capId) => {
    setSelectedCaption(capId);
    if (capId === "off") setActiveSubtitleText("");
    setShowSubtitleMenu(false);
  };

  // Switch Episode
  const selectEpisode = (se, ep) => {
    savedTimestampRef.current = 0;
    setCurrentSeason(se);
    setCurrentEpisode(ep);
    setShowEpisodesDrawer(false);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleSeekOffset(10);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleSeekOffset(-10);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setVolume((prev) => {
          const next = Math.min(1, parseFloat((prev + 0.1).toFixed(2)));
          if (videoRef.current) {
            videoRef.current.volume = next;
            videoRef.current.muted = false;
          }
          setIsMuted(false);
          return next;
        });
        triggerControls();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setVolume((prev) => {
          const next = Math.max(0, parseFloat((prev - 0.1).toFixed(2)));
          if (videoRef.current) {
            videoRef.current.volume = next;
            videoRef.current.muted = next === 0;
          }
          setIsMuted(next === 0);
          return next;
        });
        triggerControls();
      } else if (e.key === "f") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "m") {
        e.preventDefault();
        toggleMute();
      } else if (e.key === "c") {
        e.preventDefault();
        if (captions.length > 0) {
          setSelectedCaption((prev) => (prev === "off" ? String(captions[0].id) : "off"));
        }
      } else if (e.key === "?") {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
      } else if (e.key === "Escape") {
        if (showShortcutsModal) setShowShortcutsModal(false);
        else if (showCaptionCustomizer) setShowCaptionCustomizer(false);
        else if (showEpisodesDrawer) setShowEpisodesDrawer(false);
        else if (!document.fullscreenElement) onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, duration, showEpisodesDrawer, showCaptionCustomizer, showShortcutsModal, captions]);

  // Format seconds to HH:MM:SS
  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds) || timeInSeconds < 0) return "00:00";
    const h = Math.floor(timeInSeconds / 3600);
    const m = Math.floor((timeInSeconds % 3600) / 60);
    const s = Math.floor(timeInSeconds % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
    }
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Series & Episodes details
  const activeSeasonData = seasonsList.find((s) => s.se === currentSeason) || seasonsList[0] || {
    se: currentSeason || 1,
    episodes: [currentEpisode || 1],
    totalEpisodes: 1
  };
  const episodeNumbers = activeSeasonData?.episodes || (activeSeasonData?.maxEp > 0 ? Array.from({ length: activeSeasonData.maxEp }, (_, i) => i + 1) : [1]);
  const maxEpisodes = episodeNumbers.length;
  const isSeries = meta.isSeries !== false && (
    isTvSeries(movie) || 
    seasonsList.length > 1 || 
    maxEpisodes > 1 || 
    currentSeason > 0 || 
    currentEpisode > 0
  );

  // Compute percentages for progress bar
  const activeTime = isDragging ? dragTime : currentTime;
  const playedPercent = duration > 0 ? (activeTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;

  // Build caption text shadow based on edgeStyle
  const getCaptionShadow = () => {
    if (captionSettings.edgeStyle === "outline") {
      return "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.8)";
    }
    if (captionSettings.edgeStyle === "shadow") {
      return "0 2px 6px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 0, 0, 0.7)";
    }
    return "none";
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={
        isMini
          ? "fixed bottom-5 right-5 sm:bottom-6 sm:right-6 w-80 sm:w-96 aspect-video z-50 rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-slate-950 select-none font-sans mini-player-dock group/mini"
          : "fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden select-none font-sans"
      }
    >
      {/* Loading & Buffering state */}
      {(loading || buffering) && (
        <div className="absolute flex flex-col items-center gap-3 text-white z-20 pointer-events-none">
          <Loader2 className="w-12 h-12 animate-spin text-rose-500 drop-shadow-md" />
          <p className="text-xs font-semibold tracking-wider uppercase text-slate-300 bg-black/60 px-4 py-1.5 rounded-full backdrop-blur-md">
            {loading ? "Loading Media..." : "Buffering..."}
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center gap-4 p-8 bg-slate-900 border border-white/10 rounded-2xl max-w-md text-center z-20 shadow-2xl">
          <AlertCircle className="w-12 h-12 text-rose-500" />
          <h3 className="text-lg font-bold text-white">Stream Error</h3>
          <p className="text-xs sm:text-sm text-slate-400">{error}</p>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                setCurrentEpisode((prev) => prev);
              }}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* HTML5 Video Element */}
      {currentStreamUrl && (
        <video
          ref={videoRef}
          src={currentStreamUrl}
          playsInline
          autoPlay
          preload="auto"
          crossOrigin="anonymous"
          onClick={togglePlay}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onError={() => {
            setBuffering(false);
            setLoading(false);
            const curSource = sources.find((s) => (s.proxy_url === currentStreamUrl || s.url === currentStreamUrl));
            if (curSource && currentStreamUrl === curSource.proxy_url && curSource.url) {
              console.warn("Proxy stream failed, attempting direct CDN fallback...");
              setCurrentStreamUrl(curSource.url);
            } else {
              setError("Playback failed. The upstream media CDN may be temporarily slow or geo-restricted. Try changing resolution or episode.");
            }
          }}
          className="w-full h-full object-contain cursor-pointer"
        >
          {captions.map((cap) => (
            <track
              key={cap.id}
              id={String(cap.id)}
              kind="subtitles"
              label={cap.label}
              srcLang={cap.language || "en"}
              src={cap.vtt_proxy_url || cap.url}
              default={selectedCaption === String(cap.id)}
            />
          ))}
        </video>
      )}

      {/* Floating In-App Mini-Player Overlay */}
      {isMini && (
        <div 
          onClick={() => setIsMini(false)}
          className="absolute inset-0 bg-black/40 hover:bg-black/65 transition-all duration-200 z-30 flex flex-col justify-between p-3.5 cursor-pointer group/overlay"
        >
          {/* Top Row in Mini Mode */}
          <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs font-bold text-white truncate max-w-[190px] drop-shadow">
              {movie.name}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsMini(false)}
                title="Expand to Fullscreen"
                className="p-1.5 rounded-lg bg-black/60 hover:bg-white/20 text-white backdrop-blur-md transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onClose}
                title="Close Player"
                className="p-1.5 rounded-lg bg-black/60 hover:bg-rose-600 text-white backdrop-blur-md transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Center Play/Pause in Mini Mode */}
          <div className="flex items-center justify-center opacity-0 group-hover/overlay:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="w-11 h-11 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center shadow-xl transition-transform active:scale-95"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
            </button>
          </div>

          {/* Bottom Progress Bar in Mini Mode */}
          <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-rose-500 transition-all duration-150"
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Full-Theater Controls & Overlays (Only visible when not minimized) */}
      {!isMini && (
        <>
          {/* Custom Subtitle Overlay Container */}
          {selectedCaption !== "off" && activeSubtitleText && (
            <div
              className="absolute left-0 right-0 flex justify-center items-center pointer-events-none z-20 px-8 text-center"
              style={{ bottom: captionSettings.bottomOffset }}
            >
              <div
                className="rounded-lg px-4 py-1.5 transition-all duration-150 inline-block max-w-4xl"
                style={{
                  fontSize: captionSettings.fontSize,
                  color: captionSettings.color,
                  backgroundColor: captionSettings.bgColor,
                  textShadow: getCaptionShadow(),
                  fontWeight: 600,
                  lineHeight: 1.4
                }}
              >
                {activeSubtitleText}
              </div>
            </div>
          )}

          {/* Top Header Overlay */}
          <div
            className={`absolute top-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-b from-black/85 via-black/40 to-transparent transition-opacity duration-300 z-30 flex items-center justify-between pointer-events-auto ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onClose}
                  title="Close (Esc)"
                  className="p-2 rounded-full bg-white/10 hover:bg-rose-600 text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setIsMini(true)}
                  title="Minimize to Floating Mini-Player"
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
                {document.pictureInPictureEnabled && (
                  <button
                    onClick={toggleNativePip}
                    title="Picture-in-Picture"
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors hidden sm:block"
                  >
                    <PictureInPicture2 className="w-5 h-5" />
                  </button>
                )}
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-xs sm:max-w-md">
                  {movie.name}
                </h2>
            <div className="flex items-center gap-2 mt-0.5">
              {isSeries && (
                <span className="text-xs text-rose-400 font-semibold tracking-wide">
                  Season {currentSeason} • Episode {currentEpisode}
                </span>
              )}
              {activeDub && (
                <span className="text-[11px] text-slate-300 bg-white/10 px-2 py-0.5 rounded font-medium">
                  {activeDub.lanName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Top Right Buttons */}
        <div className="flex items-center gap-2.5">
          {isSeries && (
            <button
              onClick={() => {
                setShowEpisodesDrawer(!showEpisodesDrawer);
                setShowAudioMenu(false);
                setShowQualityMenu(false);
                setShowSubtitleMenu(false);
                setShowCaptionCustomizer(false);
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md border border-white/10 transition-colors"
            >
              <ListFilter className="w-4 h-4 text-rose-400" />
              <span>Episodes</span>
            </button>
          )}

          {isSeries && currentEpisode < maxEpisodes && (
            <button
              onClick={() => {
                savedTimestampRef.current = 0;
                setCurrentEpisode((prev) => prev + 1);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/30 transition-colors"
            >
              <span>Next Ep</span>
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Episodes Picker Slide-out Drawer */}
      {showEpisodesDrawer && isSeries && (
        <div className="absolute right-0 top-0 bottom-0 w-80 sm:w-96 bg-[#0c101a]/95 border-l border-white/10 z-40 backdrop-blur-2xl p-6 flex flex-col shadow-2xl animate-in slide-in-from-right duration-250">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-[var(--theme-primary)]" />
              Episodes & Seasons
            </h3>
            <button
              onClick={() => setShowEpisodesDrawer(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {seasonsList.length > 1 && (
            <div className="flex items-center gap-1.5 py-4 overflow-x-auto no-scrollbar">
              {seasonsList.map((s) => {
                const isSelected = currentSeason === s.se;
                return (
                  <button
                    key={s.se}
                    onClick={() => {
                      setCurrentSeason(s.se);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 transition-all ${
                      isSelected 
                        ? "text-white shadow-md font-bold" 
                        : "bg-white/5 text-slate-300 hover:text-white hover:bg-white/10"
                    }`}
                    style={isSelected ? { backgroundColor: "var(--theme-primary)" } : {}}
                  >
                    Season {s.se}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex-1 overflow-y-auto mt-2 space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
            {episodeNumbers.map((epNum) => {
              const isActive = currentEpisode === epNum;
              return (
                <button
                  key={epNum}
                  onClick={() => selectEpisode(currentSeason, epNum)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all ${
                    isActive 
                      ? "bg-white/15 border-[var(--theme-primary)] text-white shadow-md" 
                      : "bg-white/[0.04] border-white/5 text-slate-200 hover:bg-white/10 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center text-[11px] text-slate-300 font-mono">
                      {epNum}
                    </span>
                    <span>Episode {epNum}</span>
                  </div>
                  {isActive ? (
                    <span 
                      className="text-[10px] uppercase font-bold text-white px-2 py-0.5 rounded shadow-sm"
                      style={{ backgroundColor: "var(--theme-primary)" }}
                    >
                      Playing
                    </span>
                  ) : (
                    <Play className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Caption Customizer Modal */}
      {showCaptionCustomizer && (
        <div className="absolute right-4 sm:right-16 bottom-20 w-80 bg-slate-900/95 border border-white/15 rounded-2xl p-5 shadow-2xl backdrop-blur-2xl z-40 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-rose-500" />
              Customize Captions
            </h4>
            <button
              onClick={() => setShowCaptionCustomizer(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4 text-xs">
            {/* Font Size */}
            <div>
              <span className="text-slate-400 block mb-1.5">Font Size</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: "S", val: "16px" },
                  { label: "M", val: "22px" },
                  { label: "L", val: "28px" },
                  { label: "XL", val: "34px" }
                ].map((s) => (
                  <button
                    key={s.val}
                    onClick={() => updateCaptionSetting("fontSize", s.val)}
                    className={`py-1 rounded-lg font-semibold border ${captionSettings.fontSize === s.val ? "bg-rose-600 border-rose-500 text-white" : "bg-slate-800 border-white/5 text-slate-300 hover:bg-slate-700"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Color */}
            <div>
              <span className="text-slate-400 block mb-1.5">Text Color</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: "White", val: "#ffffff", preview: "bg-white" },
                  { label: "Yellow", val: "#fde047", preview: "bg-yellow-300" },
                  { label: "Cyan", val: "#22d3ee", preview: "bg-cyan-400" },
                  { label: "Green", val: "#4ade80", preview: "bg-green-400" }
                ].map((c) => (
                  <button
                    key={c.val}
                    onClick={() => updateCaptionSetting("color", c.val)}
                    className={`flex items-center justify-center gap-1.5 py-1 rounded-lg border text-[11px] font-semibold ${captionSettings.color === c.val ? "border-rose-500 bg-rose-600/20 text-white" : "border-white/5 bg-slate-800 text-slate-300"}`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${c.preview}`} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Background Opacity */}
            <div>
              <span className="text-slate-400 block mb-1.5">Background Box</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: "None", val: "transparent" },
                  { label: "Semi-Dark", val: "rgba(0,0,0,0.65)" },
                  { label: "Solid", val: "rgba(0,0,0,0.95)" }
                ].map((b) => (
                  <button
                    key={b.val}
                    onClick={() => updateCaptionSetting("bgColor", b.val)}
                    className={`py-1 rounded-lg font-semibold border text-[11px] ${captionSettings.bgColor === b.val ? "bg-rose-600 border-rose-500 text-white" : "bg-slate-800 border-white/5 text-slate-300"}`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Shadow / Edge Style */}
            <div>
              <span className="text-slate-400 block mb-1.5">Text Edge Style</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: "None", val: "none" },
                  { label: "Shadow", val: "shadow" },
                  { label: "Outline", val: "outline" }
                ].map((e) => (
                  <button
                    key={e.val}
                    onClick={() => updateCaptionSetting("edgeStyle", e.val)}
                    className={`py-1 rounded-lg font-semibold border text-[11px] ${captionSettings.edgeStyle === e.val ? "bg-rose-600 border-rose-500 text-white" : "bg-slate-800 border-white/5 text-slate-300"}`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Preview Box */}
            <div className="pt-2 border-t border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Preview</span>
              <div className="bg-slate-950 p-2.5 rounded-xl flex items-center justify-center min-h-[48px]">
                <span
                  style={{
                    fontSize: captionSettings.fontSize,
                    color: captionSettings.color,
                    backgroundColor: captionSettings.bgColor,
                    textShadow: getCaptionShadow(),
                    padding: "2px 8px",
                    borderRadius: "4px"
                  }}
                >
                  Subtitle Preview Text
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Center Big Play Indicator (when paused) */}
      {!loading && !isPlaying && !error && (
        <button
          onClick={togglePlay}
          className="absolute z-20 w-20 h-20 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-transform"
        >
          <Play className="w-8 h-8 fill-white ml-1" />
        </button>
      )}

      {/* Bottom Controls Bar Overlay */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 z-30 flex flex-col gap-3 pointer-events-auto ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        {/* Advanced Ultra-Smooth Dual-Layer Progress Scrubber Bar */}
        <div
          ref={progressBarRef}
          onMouseDown={handleProgressMouseDown}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
          className="relative py-2 group/scrub cursor-pointer select-none"
        >
          {/* Track Rail */}
          <div className="relative w-full h-1.5 group-hover/scrub:h-2.5 bg-white/20 rounded-full overflow-hidden transition-all duration-150">
            {/* Buffered Progress Bar */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-white/30 transition-all duration-200"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Played Progress Bar */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-rose-600 to-pink-500 rounded-full"
              style={{ width: `${playedPercent}%` }}
            />
          </div>

          {/* Scrubber Handle Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 group-hover/scrub:w-4 group-hover/scrub:h-4 bg-white rounded-full shadow-lg pointer-events-none transition-transform duration-75"
            style={{ left: `${playedPercent}%` }}
          />

          {/* Hover Time Tooltip */}
          {hoverPosition && (
            <div
              className="absolute bottom-6 -translate-x-1/2 px-2 py-1 rounded-md bg-slate-900 border border-white/10 text-white text-[10px] font-bold shadow-xl pointer-events-none"
              style={{ left: `${hoverPosition.percent}%` }}
            >
              {formatTime(hoverPosition.time)}
            </div>
          )}
        </div>

        {/* Buttons Row */}
        <div className="flex items-center justify-between gap-4">
          
          {/* Left Controls: Play/Pause, Seek 10s, Volume, Time */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button onClick={togglePlay} className="text-white hover:text-rose-400 transition-colors">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-white" />}
            </button>

            <button onClick={() => handleSeekOffset(-10)} title="Rewind 10s (←)" className="text-slate-300 hover:text-white transition-colors">
              <RotateCcw className="w-5 h-5" />
            </button>

            <button onClick={() => handleSeekOffset(10)} title="Forward 10s (→)" className="text-slate-300 hover:text-white transition-colors">
              <RotateCw className="w-5 h-5" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2 group/volume">
              <button onClick={toggleMute} className="text-slate-300 hover:text-white transition-colors">
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-rose-500" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 sm:w-20 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-rose-500 opacity-80 group-hover/volume:opacity-100"
              />
            </div>

            {/* Time display */}
            <div className="text-xs font-medium text-slate-300 tracking-wide">
              <span>{formatTime(activeTime)}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Audio Dub, Subtitles, Customize, Quality, Fullscreen */}
          <div className="flex items-center gap-2 sm:gap-3 relative">
            
            {/* Audio Language / Dub Switcher */}
            {dubsList.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowAudioMenu(!showAudioMenu);
                    setShowSubtitleMenu(false);
                    setShowQualityMenu(false);
                    setShowCaptionCustomizer(false);
                  }}
                  title="Audio Language"
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${showAudioMenu ? "bg-rose-600 text-white" : "bg-white/10 hover:bg-white/20 text-slate-200"}`}
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{activeDub?.lanName || "Audio"}</span>
                </button>

                {showAudioMenu && (
                  <div className="absolute bottom-full right-0 mb-3 w-56 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-2 z-40 max-h-60 overflow-y-auto">
                    <p className="text-[11px] font-bold text-slate-400 uppercase px-2 py-1">Select Audio Dub</p>
                    {dubsList.map((dub) => {
                      const isCurrent = (activeDub?.detailPath === dub.detailPath) || (!activeDub && dub.original);
                      return (
                        <button
                          key={dub.detailPath}
                          onClick={() => switchAudioDub(dub)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-300 transition-colors"
                        >
                          <span className="truncate">{dub.lanName} {dub.original ? "(Original)" : ""}</span>
                          {isCurrent && <Check className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Subtitles Menu */}
            {captions.length > 0 && (
              <div className="relative flex items-center">
                <button
                  onClick={() => {
                    setShowSubtitleMenu(!showSubtitleMenu);
                    setShowAudioMenu(false);
                    setShowQualityMenu(false);
                    setShowCaptionCustomizer(false);
                  }}
                  title="Captions / Subtitles"
                  className={`p-1.5 rounded-lg transition-colors ${selectedCaption !== "off" ? "text-rose-400 bg-white/10" : "text-slate-300 hover:text-white"}`}
                >
                  <Subtitles className="w-5 h-5" />
                </button>

                {showSubtitleMenu && (
                  <div className="absolute bottom-full right-0 mb-3 w-56 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-2 z-40 max-h-64 overflow-y-auto">
                    <div className="flex items-center justify-between px-2 py-1 border-b border-slate-800 mb-1">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Subtitles</span>
                      <button
                        onClick={() => {
                          setShowSubtitleMenu(false);
                          setShowCaptionCustomizer(true);
                        }}
                        className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold"
                      >
                        <Sliders className="w-3 h-3" />
                        Style
                      </button>
                    </div>

                    <button
                      onClick={() => switchSubtitle("off")}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-300 transition-colors"
                    >
                      <span>Off</span>
                      {selectedCaption === "off" && <Check className="w-3.5 h-3.5 text-rose-500" />}
                    </button>

                    {captions.map((cap) => (
                      <button
                        key={cap.id}
                        onClick={() => switchSubtitle(String(cap.id))}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-300 transition-colors"
                      >
                        <span className="truncate">{cap.label}</span>
                        {selectedCaption === String(cap.id) && <Check className="w-3.5 h-3.5 text-rose-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Caption Customize Button directly in bar */}
            {selectedCaption !== "off" && (
              <button
                onClick={() => {
                  setShowCaptionCustomizer(!showCaptionCustomizer);
                  setShowSubtitleMenu(false);
                  setShowAudioMenu(false);
                  setShowQualityMenu(false);
                }}
                title="Customize Subtitle Style"
                className={`p-1.5 rounded-lg transition-colors ${showCaptionCustomizer ? "bg-rose-600 text-white" : "text-slate-300 hover:text-white"}`}
              >
                <Sliders className="w-4 h-4" />
              </button>
            )}

            {/* Playback Speed Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSpeedMenu(!showSpeedMenu);
                  setShowQualityMenu(false);
                  setShowAudioMenu(false);
                  setShowSubtitleMenu(false);
                  setShowCaptionCustomizer(false);
                }}
                title="Playback Speed"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>{playbackSpeed}x</span>
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-3 w-32 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-2 z-40">
                  <p className="text-[11px] font-bold text-slate-400 uppercase px-2 py-1">Speed</p>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => switchPlaybackSpeed(spd)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-300 transition-colors"
                    >
                      <span>{spd}x</span>
                      {playbackSpeed === spd && <Check className="w-3.5 h-3.5 text-rose-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quality Selector Menu */}
            {sources.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowQualityMenu(!showQualityMenu);
                    setShowSpeedMenu(false);
                    setShowAudioMenu(false);
                    setShowSubtitleMenu(false);
                    setShowCaptionCustomizer(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{currentQuality || "Auto"}</span>
                </button>

                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-3 w-36 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-2 z-40">
                    <p className="text-[11px] font-bold text-slate-400 uppercase px-2 py-1">Resolution</p>
                    {sources.map((s) => (
                      <button
                        key={s.resolution}
                        onClick={() => switchQuality(s.resolution)}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 text-slate-300 transition-colors"
                      >
                        <span>{s.resolution}</span>
                        {currentQuality === s.resolution && <Check className="w-3.5 h-3.5 text-rose-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Keyboard Shortcuts Button */}
            <button
              onClick={() => setShowShortcutsModal(true)}
              title="Keyboard Shortcuts (?)"
              className="text-slate-300 hover:text-white transition-colors p-1"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            {/* Mini-Player Toggle */}
            <button
              onClick={() => setIsMini(true)}
              title="Minimize to Floating Mini-Player"
              className="text-slate-300 hover:text-white transition-colors p-1"
            >
              <Minimize2 className="w-5 h-5" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
              className="text-slate-300 hover:text-white transition-colors p-1"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>

          </div>
        </div>

      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-rose-500" />
                Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {[
                { key: "Space / K", desc: "Play or Pause video" },
                { key: "← / →", desc: "Rewind / Fast-forward 10s" },
                { key: "↑ / ↓", desc: "Volume up / down 10%" },
                { key: "M", desc: "Mute or Unmute audio" },
                { key: "F", desc: "Toggle Fullscreen" },
                { key: "C", desc: "Toggle Subtitles" },
                { key: "?", desc: "Show / Hide shortcuts guide" },
                { key: "Esc", desc: "Close menus or exit player" },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-800/50">
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-white/10 font-mono font-bold text-white text-[11px]">
                    {item.key}
                  </span>
                  <span className="text-slate-300 text-right">{item.desc}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowShortcutsModal(false)}
              className="w-full mt-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
        </>
      )}

    </div>
  );
}
