/**
 * Universal Cinema Pro Series & Episode Normalizer
 * Provides bulletproof extraction of seasons and episodes from upstream MovieBox BFF data.
 */

export function isTvSeries(movie, subject = null) {
  if (!movie && !subject) return false;
  
  if (movie?.is_tv === true || movie?.category === "tv" || movie?.category === "anime") {
    return true;
  }
  
  const subType = subject?.subjectType ?? movie?.subjectType;
  if (subType === 2) {
    return true;
  }
  
  const badge = String(movie?.badge || subject?.corner || "").toLowerCase();
  if (badge.includes("tv") || badge.includes("series") || badge.includes("anime") || badge.includes("show")) {
    return true;
  }
  
  const title = String(subject?.title || movie?.name || movie?.title || "");
  if (/\b(season\s*\d+|s\d+|episode|\bep\s*\d+)\b/i.test(title)) {
    return true;
  }
  
  return false;
}

export function parseSeriesData(resourceSeasons, subject, movie) {
  const isExplicitSeries = isTvSeries(movie, subject);
  const rawSeasons = Array.isArray(resourceSeasons) ? resourceSeasons : [];

  const seasons = rawSeasons.map((s, idx) => {
    // Upstream sometimes sends se=0 for Season 1, or se=1,2,3
    const seasonNumber = s.se && s.se > 0 ? s.se : (idx + 1);
    const originalSe = s.se !== undefined ? s.se : seasonNumber;

    // 1. Check allEp string, e.g. "1,2,3,4,5,6"
    let episodes = [];
    if (s.allEp && typeof s.allEp === "string") {
      const parts = s.allEp.split(",").map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        episodes = parts.map((p, i) => {
          const num = parseInt(p, 10);
          return isNaN(num) ? (i + 1) : num;
        });
      }
    }

    // 2. If no allEp, check maxEp & resolutions
    if (episodes.length === 0) {
      let count = s.maxEp || 0;
      // Sanity cap: sometimes upstream sends "1718" for combined episode 17-18
      if (count > 300 || count <= 0) {
        const resCounts = (s.resolutions || []).map(r => r.epNum || 0);
        const maxRes = resCounts.length ? Math.max(...resCounts) : 0;
        count = maxRes > 0 ? maxRes : (count <= 300 && count > 0 ? count : 0);
      }

      if (count > 0) {
        episodes = Array.from({ length: count }, (_, i) => i + 1);
      }
    }

    // Fallback if empty but resolutions exist
    if (episodes.length === 0 && Array.isArray(s.resolutions) && s.resolutions.length > 0) {
      const maxRes = Math.max(0, ...s.resolutions.map(r => r.epNum || 0));
      if (maxRes > 0) {
        episodes = Array.from({ length: Math.min(maxRes, 150) }, (_, i) => i + 1);
      }
    }

    // Fallback if still empty
    if (episodes.length === 0) {
      episodes = [1];
    }

    return {
      se: seasonNumber,
      originalSe: originalSe,
      episodes: episodes,
      totalEpisodes: episodes.length,
      resolutions: s.resolutions || []
    };
  });

  // If this title is known to be a TV series/show, but upstream didn't send a seasons array:
  if (isExplicitSeries && seasons.length === 0) {
    seasons.push({
      se: 1,
      originalSe: 1,
      episodes: [1],
      totalEpisodes: 1,
      resolutions: []
    });
  }

  // Final check: is it a series?
  const hasMultipleSeasons = seasons.length > 1;
  const hasMultipleEpisodes = seasons.length > 0 && seasons[0].episodes.length > 1;
  const isSeries = isExplicitSeries || hasMultipleSeasons || hasMultipleEpisodes;

  return {
    isSeries,
    seasons
  };
}
