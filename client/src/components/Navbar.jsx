import React, { useState, useEffect, useRef } from "react";
import { Search, Film, Bookmark, X, Play, Tv, Sparkles, Home as HomeIcon, Palette, Check } from "lucide-react";
import { fetchSuggestions } from "../services/api";

const THEMES = [
  { id: "crimson", name: "Crimson Rose", color: "#e11d48", dot: "bg-rose-500" },
  { id: "cyan", name: "Neon Cyan", color: "#06b6d4", dot: "bg-cyan-500" },
  { id: "violet", name: "Amethyst Violet", color: "#8b5cf6", dot: "bg-purple-500" },
  { id: "emerald", name: "Emerald Matrix", color: "#10b981", dot: "bg-emerald-500" },
  { id: "amber", name: "Imperial Gold", color: "#f59e0b", dot: "bg-amber-500" },
];

export default function Navbar({
  activeTab,
  setActiveTab,
  onSelectMovie,
  watchlistCount,
  onSearchSubmit,
  currentTheme,
  onSelectTheme,
  onSurpriseMe
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestBox, setShowSuggestBox] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const searchRef = useRef(null);
  const themeRef = useRef(null);
  const inputRef = useRef(null);

  // Global hotkey '/' or 'Ctrl+K' to focus search input
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestBox(false);
      }
      if (themeRef.current && !themeRef.current.contains(e.target)) {
        setShowThemeMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search suggestions
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await fetchSuggestions(searchQuery);
        setSuggestions(results || []);
        setShowSuggestBox(true);
      } catch (err) {
        console.error("Suggestions error:", err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      setShowSuggestBox(false);
      onSearchSubmit(searchQuery);
    }
  };

  const handleSuggestionClick = (item) => {
    setShowSuggestBox(false);
    if (item.slug && item.subject_id) {
      onSelectMovie({
        subject_id: item.subject_id,
        slug: item.slug,
        name: item.title,
        poster_url: item.poster_url
      });
    } else {
      setSearchQuery(item.title);
      onSearchSubmit(item.title);
    }
  };

  const activeThemeObj = THEMES.find((t) => t.id === currentTheme) || THEMES[0];

  return (
    <header className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? "bg-[#0b0c10]/95 backdrop-blur-md shadow-2xl py-3 border-b border-white/5" : "bg-gradient-to-b from-[#0b0c10]/90 to-transparent py-5"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        
        {/* Brand Logo */}
        <div 
          onClick={() => { setActiveTab("home"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className="flex items-center gap-2.5 cursor-pointer group select-none flex-shrink-0"
        >
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-200 group-hover:scale-105"
            style={{ backgroundColor: "var(--theme-primary)", boxShadow: "0 4px 20px -2px var(--theme-glow)" }}
          >
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-xl font-black tracking-wider bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              CINE<span style={{ color: "var(--theme-primary)" }}>BOX</span>
            </span>
            <span className="block text-[10px] tracking-widest text-slate-400 uppercase font-semibold">Cinema Pro</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10 backdrop-blur-md">
          {[
            { id: "home", label: "Home", icon: HomeIcon },
            { id: "movies", label: "Movies", icon: Film },
            { id: "tv", label: "TV Shows", icon: Tv },
            { id: "anime", label: "Anime", icon: Sparkles },
            { id: "watchlist", label: `Watchlist ${watchlistCount > 0 ? `(${watchlistCount})` : ''}`, icon: Bookmark },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 ${
                  isActive 
                    ? "text-white shadow-md" 
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
                style={isActive ? { backgroundColor: "var(--theme-primary)", boxShadow: "0 4px 15px -2px var(--theme-glow)" } : {}}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right Section: Search & Theme Switcher & Mobile Watchlist */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          
          {/* Instant Search Bar */}
          <div className="relative w-40 sm:w-56 md:w-64 lg:focus-within:w-80 transition-all duration-300 ease-out group" ref={searchRef}>
            <Search className="w-4 h-4 text-slate-400 group-focus-within:text-[var(--theme-primary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestBox(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search movies, series..."
              className="w-full bg-slate-900/80 hover:bg-slate-900 focus:bg-slate-950/95 border border-white/10 hover:border-white/20 focus:border-[var(--theme-primary)] rounded-full pl-9 pr-14 sm:pr-16 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--theme-glow)] shadow-inner transition-all duration-200"
            />
            {searchQuery ? (
              <button
                onClick={() => { setSearchQuery(""); setSuggestions([]); setShowSuggestBox(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="hidden sm:flex items-center gap-0.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 group-focus-within:opacity-20 transition-opacity">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-300 bg-white/10 border border-white/15 rounded shadow-sm">/</kbd>
              </div>
            )}

            {/* Suggestions Dropdown */}
            {showSuggestBox && suggestions.length > 0 && (
              <div className="absolute top-full right-0 sm:left-0 sm:right-auto mt-2.5 w-80 sm:w-96 bg-[#0f131c]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                <div className="px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                    <Sparkles className="w-3 h-3 text-[var(--theme-primary)]" />
                    Instant Matches
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Press ↵ to search all</span>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.04] scrollbar-thin scrollbar-thumb-white/10">
                  {suggestions.map((item, index) => (
                    <div
                      key={index}
                      onClick={() => handleSuggestionClick(item)}
                      className="p-2.5 flex items-center gap-3 hover:bg-white/[0.07] cursor-pointer transition-all duration-150 group/item"
                    >
                      {item.poster_url ? (
                        <img 
                          src={item.poster_url} 
                          alt={item.title} 
                          className="w-9 h-12 object-cover rounded-md shadow-md flex-shrink-0 group-hover/item:scale-105 transition-transform duration-200"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-9 h-12 rounded-md bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover/item:border-white/20 transition-colors">
                          <Film className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200 group-hover/item:text-white truncate transition-colors">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            {item.slug ? "Direct play" : "Search title"}
                          </span>
                        </div>
                      </div>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-white/5 group-hover/item:bg-[var(--theme-primary)] text-slate-400 group-hover/item:text-white transition-all duration-150 flex-shrink-0">
                        <Play className="w-3 h-3 ml-0.5 fill-current" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Surprise Me (Random Pick) */}
          <button
            onClick={onSurpriseMe}
            title="Surprise Me (Random Title)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-500 text-xs font-semibold text-white transition-all hover:scale-105 active:scale-95 group"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform" />
            <span className="hidden sm:inline">Surprise Me</span>
          </button>

          {/* THEME CHOOSER BUTTON & MENU */}
          <div className="relative" ref={themeRef}>
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              title="Change Theme Color"
              className="flex items-center gap-1.5 p-2 rounded-full bg-slate-900/90 border border-slate-700/80 hover:border-slate-500 text-slate-200 transition-all hover:scale-105 active:scale-95"
            >
              <Palette className="w-4 h-4 text-slate-300" />
              <span className={`w-2.5 h-2.5 rounded-full ${activeThemeObj.dot} shadow-sm`} />
            </button>

            {/* Theme Dropdown */}
            {showThemeMenu && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl p-2 z-50 backdrop-blur-xl animate-in fade-in duration-150">
                <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1">
                  Theme Palette
                </div>
                {THEMES.map((theme) => {
                  const isCurrent = currentTheme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => {
                        onSelectTheme(theme.id);
                        setShowThemeMenu(false);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-3.5 h-3.5 rounded-full ${theme.dot} shadow`} />
                        <span>{theme.name}</span>
                      </div>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mobile Watchlist Toggle button */}
          <button
            onClick={() => setActiveTab("watchlist")}
            className="md:hidden relative p-2 rounded-full bg-slate-800 text-slate-300 hover:text-white"
          >
            <Bookmark className="w-4 h-4" />
            {watchlistCount > 0 && (
              <span 
                className="absolute -top-1 -right-1 w-4 h-4 text-white rounded-full text-[9px] font-bold flex items-center justify-center shadow"
                style={{ backgroundColor: "var(--theme-primary)" }}
              >
                {watchlistCount}
              </span>
            )}
          </button>
        </div>

      </div>
    </header>
  );
}
