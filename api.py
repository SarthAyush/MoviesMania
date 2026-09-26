import os
import re
import json
import time
import urllib.parse
import httpx
import asyncio
import logging
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware
from typing import Optional
import random

logger = logging.getLogger("moviesbox")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="CineBox Streaming Engine",
    description="High-Speed Reverse-Engineered MovieBox API with In-Memory Cache, Audio Switcher, and Video Relay",
    version="3.3.0"
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type"]
)

BASE_URL = "https://moviebox.ph"
API_BASE = "https://h5-api.aoneroom.com/wefeed-h5api-bff"

_bearer_token: str | None = None
_token_lock = asyncio.Lock()

from collections import OrderedDict

# Bounded High-Speed LRU Cache (max 500 items, 5 min TTL)
_CACHE: OrderedDict[str, tuple[float, any]] = OrderedDict()
CACHE_TTL = 300
MAX_CACHE_SIZE = 500

def get_from_cache(key: str):
    if key in _CACHE:
        ts, data = _CACHE[key]
        if time.time() - ts < CACHE_TTL:
            _CACHE.move_to_end(key)
            return data
        else:
            del _CACHE[key]
    return None

def set_in_cache(key: str, data: any):
    if key in _CACHE:
        _CACHE.move_to_end(key)
    _CACHE[key] = (time.time(), data)
    if len(_CACHE) > MAX_CACHE_SIZE:
        _CACHE.popitem(last=False)

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "Referer": "https://moviebox.ph/",
    "Origin": "https://moviebox.ph",
    "X-Client-Info": '{"timezone":"Asia/Dhaka"}',
    "X-Request-Lang": "en",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "sec-ch-ua": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
}

PLAYER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "X-Client-Info": '{"timezone":"Asia/Dhaka"}',
    "X-Source": "",
    "sec-ch-ua": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
}

async def _get_bearer_token() -> str:
    """Auto-acquire guest JWT token from the upstream API with lock & retry."""
    global _bearer_token
    if _bearer_token:
        return _bearer_token

    async with _token_lock:
        if _bearer_token:
            return _bearer_token

        for attempt in range(3):
            try:
                async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
                    resp = await client.get(f"{API_BASE}/home?host=moviebox.ph", headers=DEFAULT_HEADERS)
                    x_user = resp.headers.get("x-user")
                    if x_user:
                        try:
                            _bearer_token = json.loads(x_user).get("token")
                        except Exception:
                            pass
                    if not _bearer_token:
                        cookie = resp.headers.get("set-cookie", "")
                        m = re.search(r"token=([^;]+)", cookie)
                        if m:
                            _bearer_token = m.group(1)
                    if _bearer_token:
                        break
            except Exception as e:
                await asyncio.sleep(0.5)

    return _bearer_token or ""

async def _make_request(url: str, method: str = "GET", payload: dict = None, custom_headers: dict = None, retries: int = 2) -> dict:
    global _bearer_token
    token = await _get_bearer_token()
    headers = {
        **DEFAULT_HEADERS,
        "Authorization": f"Bearer {token}" if token else "",
        **(custom_headers or {})
    }

    last_error = None
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
                if method == "POST":
                    resp = await client.post(url, headers=headers, json=payload)
                else:
                    resp = await client.get(url, headers=headers)

                x_user = resp.headers.get("x-user")
                if x_user:
                    try:
                        new_token = json.loads(x_user).get("token")
                        if new_token:
                            _bearer_token = new_token
                    except Exception:
                        pass

                if resp.status_code == 200:
                    return resp.json()
                elif resp.status_code in [401, 403]:
                    # Token expired, clear and retry
                    _bearer_token = None
                    token = await _get_bearer_token()
                    headers["Authorization"] = f"Bearer {token}" if token else ""
                    continue
                else:
                    last_error = f"Upstream API error: {resp.status_code}"
        except Exception as e:
            last_error = str(e)
            await asyncio.sleep(0.3)

    raise HTTPException(status_code=502, detail=f"Request failed after retries: {last_error}")

# ==================== HIGH-SPEED VIDEO & SUBTITLE PROXY ====================

_stream_client: httpx.AsyncClient | None = None

def get_stream_client() -> httpx.AsyncClient:
    global _stream_client
    if _stream_client is None or _stream_client.is_closed:
        limits = httpx.Limits(max_keepalive_connections=100, max_connections=200, keepalive_expiry=60.0)
        timeout = httpx.Timeout(connect=5.0, read=60.0, write=10.0, pool=5.0)
        _stream_client = httpx.AsyncClient(limits=limits, timeout=timeout, follow_redirects=True)
    return _stream_client

def extract_proxy_target_url(request: Request, raw_url_param: str) -> str:
    target = raw_url_param
    if "%3A" in target or "%2F" in target:
        target = urllib.parse.unquote(target)
    
    parsed = urllib.parse.urlparse(target)
    extra_params = {k: v for k, v in request.query_params.items() if k != "url"}
    if extra_params:
        existing_query = urllib.parse.parse_qs(parsed.query)
        for k, v in extra_params.items():
            if k not in existing_query:
                separator = "&" if parsed.query else "?"
                target = f"{target}{separator}{k}={urllib.parse.quote(v)}"
                parsed = urllib.parse.urlparse(target)
    return target

@app.get("/api/proxy/stream")
async def proxy_video(request: Request, url: str = Query(...)):
    """Optimized persistent-connection streaming proxy with Range support, dual referer, and 256KB buffer."""
    try:
        target_url = extract_proxy_target_url(request, url)
        
        req_headers = {
            "User-Agent": PLAYER_HEADERS["User-Agent"],
            "Referer": "https://netfilm.world/",
            "Origin": "https://netfilm.world",
            "Accept": "*/*",
        }
        
        range_header = request.headers.get("range")
        if range_header:
            req_headers["Range"] = range_header

        client = get_stream_client()
        req = client.build_request("GET", target_url, headers=req_headers)
        upstream_resp = await client.send(req, stream=True)

        # If 401/403/429 with netfilm.world, retry with moviebox.ph referer
        if upstream_resp.status_code in [401, 403, 429]:
            await upstream_resp.aclose()
            req_headers["Referer"] = "https://moviebox.ph/"
            req_headers["Origin"] = "https://moviebox.ph"
            req = client.build_request("GET", target_url, headers=req_headers)
            upstream_resp = await client.send(req, stream=True)

        async def stream_generator():
            try:
                # 256 KB chunk size for ultra-responsive video buffering
                async for chunk in upstream_resp.aiter_bytes(chunk_size=1024 * 256):
                    yield chunk
            except (asyncio.CancelledError, GeneratorExit):
                pass
            except Exception as exc:
                logger.debug(f"Client disconnected during streaming: {exc}")
            finally:
                await upstream_resp.aclose()

        response_headers = {
            "Accept-Ranges": "bytes",
            "Content-Type": upstream_resp.headers.get("content-type", "video/mp4"),
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
            "Cache-Control": "public, max-age=3600",
        }

        if "content-range" in upstream_resp.headers:
            response_headers["Content-Range"] = upstream_resp.headers["content-range"]
        if "content-length" in upstream_resp.headers:
            response_headers["Content-Length"] = upstream_resp.headers["content-length"]

        return StreamingResponse(
            stream_generator(),
            status_code=upstream_resp.status_code,
            headers=response_headers,
            media_type=response_headers["Content-Type"]
        )
    except Exception as e:
        err_msg = str(e) or repr(e)
        logger.error(f"Stream proxy error: {err_msg}")
        raise HTTPException(status_code=502, detail=f"Proxy error: {err_msg}")

@app.get("/api/proxy/subtitle")
async def proxy_subtitle(url: str = Query(...)):
    """Fetches SRT subtitles and returns browser-native WebVTT format."""
    try:
        decoded_url = urllib.parse.unquote(url)
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(decoded_url, headers=PLAYER_HEADERS)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Failed to fetch subtitle")
            
            raw_text = resp.text
            vtt_content = "WEBVTT\n\n" + re.sub(r"(\d{2}:\d{2}:\d{2}),(\d{3})", r"\1.\2", raw_text)
            
            return Response(
                content=vtt_content,
                media_type="text/vtt; charset=utf-8",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=86400"
                }
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Subtitle proxy error: {str(e)}")

# ==================== DATA API ENDPOINTS ====================

@app.get("/home")
async def get_home():
    cached = get_from_cache("home")
    if cached:
        return cached

    url = f"{API_BASE}/home?host=moviebox.ph"
    data = await _make_request(url)
    sections = []
    for op in data.get("data", {}).get("operatingList", []) or []:
        op_type = op.get("type")
        title = op.get("title", "Featured")
        if op_type == "BANNER":
            items = [{
                "name": item.get("title") or (item.get("subject") or {}).get("title"),
                "poster_url": item.get("image", {}).get("url") or (item.get("subject") or {}).get("cover", {}).get("url"),
                "slug": item.get("detailPath") or (item.get("subject") or {}).get("detailPath"),
                "subject_id": (item.get("subject") or {}).get("subjectId"),
                "badge": (item.get("subject") or {}).get("corner"),
                "rating": (item.get("subject") or {}).get("imdbRatingValue") or "8.5",
                "genre": (item.get("subject") or {}).get("genre", "Trending"),
                "description": (item.get("subject") or {}).get("description", "")
            } for item in op.get("banner", {}).get("items", []) if item.get("title") and "Communities" not in item.get("title")]
            sections.append({"section": "Banner", "count": len(items), "items": items})
        elif op_type in ["SUBJECTS_MOVIE", "SUBJECTS_TV", "SUBJECTS_ANIMATION"]:
            items = [{
                "name": sub.get("title"),
                "poster_url": sub.get("cover", {}).get("url"),
                "slug": sub.get("detailPath"),
                "subject_id": sub.get("subjectId"),
                "badge": sub.get("corner"),
                "rating": sub.get("imdbRatingValue"),
                "genre": sub.get("genre", "Movie"),
                "year": sub.get("releaseDate", "")[:4] if sub.get("releaseDate") else None
            } for sub in op.get("subjects", [])]
            sections.append({"section": title, "count": len(items), "items": items})
            
    res = {"status": "success", "sections": sections}
    set_in_cache("home", res)
    return res

JUNK_KEYWORDS = [
    "mix", "gospel", "song", "songs", "album", "jukebox", "rhymes",
    "nursery", "playlist", "worship", "kesha", "remix", "rnb party", "dj ", "dancehall", "instrumental"
]

def is_clean_cinema_title(title: str, genre: str = "") -> bool:
    t = (title or "").lower()
    g = (genre or "").lower()
    for kw in JUNK_KEYWORDS:
        if kw in t or kw in g:
            return False
    return True

async def _harvest_curated_catalog() -> list[dict]:
    cached = get_from_cache("master_curated_catalog")
    if cached:
        return cached

    collected = []
    seen = set()

    # 1. Harvest from /home
    try:
        home_url = f"{API_BASE}/home?host=moviebox.ph"
        home_data = await _make_request(home_url)
        for op in home_data.get("data", {}).get("operatingList", []) or []:
            for sub in op.get("subjects", []) or []:
                sid = sub.get("subjectId")
                title = sub.get("title")
                poster = sub.get("cover", {}).get("url")
                genre = sub.get("genre", "")
                if sid and sid not in seen and title and poster and is_clean_cinema_title(title, genre):
                    seen.add(sid)
                    collected.append({
                        "name": title,
                        "poster_url": poster,
                        "slug": sub.get("detailPath"),
                        "subject_id": sid,
                        "badge": sub.get("corner"),
                        "rating": sub.get("imdbRatingValue") or "7.5",
                        "genre": genre,
                        "year": sub.get("releaseDate", "")[:4] if sub.get("releaseDate") else "2024",
                        "is_tv": "drama" in genre.lower() or "series" in genre.lower() or "tv" in op.get("title", "").lower()
                    })
    except Exception:
        pass

    # 2. Harvest from tab-operating (movies)
    try:
        tab_url = f"{API_BASE}/tab-operating?tabId=2&host=moviebox.ph"
        tab_data = await _make_request(tab_url)
        for op in tab_data.get("data", {}).get("operatingList", []) or []:
            for sub in op.get("subjects", []) or []:
                sid = sub.get("subjectId")
                title = sub.get("title")
                poster = sub.get("cover", {}).get("url")
                genre = sub.get("genre", "")
                if sid and sid not in seen and title and poster and is_clean_cinema_title(title, genre):
                    seen.add(sid)
                    collected.append({
                        "name": title,
                        "poster_url": poster,
                        "slug": sub.get("detailPath"),
                        "subject_id": sid,
                        "badge": sub.get("corner"),
                        "rating": sub.get("imdbRatingValue") or "7.2",
                        "genre": genre or "Movie",
                        "year": sub.get("releaseDate", "")[:4] if sub.get("releaseDate") else "2024",
                        "is_tv": False
                    })
    except Exception:
        pass

    set_in_cache("master_curated_catalog", collected)
    return collected

async def _get_category_data(
    category_type: str,
    page: int = 1,
    per_page: int = 24,
    sort: str = "RECOMMEND",
    genre: str = "ALL",
    year: str = "ALL"
) -> dict:
    cache_key = f"cat_{category_type}_{page}_{sort}_{genre}_{year}"
    cached = get_from_cache(cache_key)
    if cached:
        return cached

    master_pool = await _harvest_curated_catalog()
    
    # Base filter by category
    candidates = []
    if category_type == "anime":
        candidates = [i for i in master_pool if "anime" in i["genre"].lower() or "animation" in i["genre"].lower()]
    elif category_type == "tv":
        candidates = [i for i in master_pool if i.get("is_tv") or "drama" in i["genre"].lower() or "series" in i["genre"].lower()]
    else:
        candidates = [i for i in master_pool if not i.get("is_tv")]

    # If candidates is small or genre != "ALL", fetch additional verified titles via search
    search_keyword = ""
    if genre != "ALL":
        if category_type == "anime":
            search_keyword = f"{genre} anime"
        elif category_type == "tv":
            search_keyword = f"{genre} series"
        else:
            search_keyword = f"{genre} movie"
    elif len(candidates) < 30:
        if category_type == "anime":
            search_keyword = "Anime"
        elif category_type == "tv":
            search_keyword = "TV Series"
        else:
            search_keyword = "Cinema"

    if search_keyword:
        try:
            url = f"{API_BASE}/subject/search"
            data = await _make_request(url, method="POST", payload={"keyword": search_keyword})
            raw = data.get("data", {}).get("items", []) or []
            for sub in raw:
                title = sub.get("title")
                poster = (sub.get("cover") or {}).get("url")
                sub_genre = sub.get("genre", "")
                sid = sub.get("subjectId")
                if sid and title and poster and is_clean_cinema_title(title, sub_genre):
                    candidates.append({
                        "name": title,
                        "poster_url": poster,
                        "slug": sub.get("detailPath"),
                        "subject_id": sid,
                        "badge": sub.get("corner"),
                        "rating": sub.get("imdbRatingValue") or "7.0",
                        "genre": sub_genre or (genre if genre != "ALL" else "Feature"),
                        "year": sub.get("releaseDate", "")[:4] if sub.get("releaseDate") else "2024",
                        "is_tv": category_type == "tv"
                    })
        except Exception:
            pass

    # Deduplicate & Filter
    seen_ids = set()
    filtered = []
    for item in candidates:
        if item["subject_id"] in seen_ids:
            continue
        seen_ids.add(item["subject_id"])

        # Genre filter
        if genre != "ALL":
            g_low = genre.lower()
            item_g = (item.get("genre") or "").lower()
            item_name = (item.get("name") or "").lower()
            if g_low not in item_g and g_low not in item_name:
                continue

        # Year filter
        if year != "ALL":
            item_y = str(item.get("year") or "")
            if item_y != str(year):
                continue

        filtered.append(item)

    # Sort
    if sort == "RATING":
        filtered.sort(key=lambda x: float(x.get("rating") or 0), reverse=True)
    elif sort == "LATEST":
        filtered.sort(key=lambda x: str(x.get("year") or ""), reverse=True)
    else:
        filtered.sort(key=lambda x: (float(x.get("rating") or 0) >= 6.5, str(x.get("year") or "")), reverse=True)

    total = len(filtered)
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated_items = filtered[start_idx:end_idx]

    result = {
        "page": page,
        "per_page": per_page,
        "total": total,
        "items": paginated_items
    }
    set_in_cache(cache_key, result)
    return result

@app.get("/movies")
async def get_movies(page: int = 1, sort: str = "RECOMMEND", genre: str = "ALL", year: str = "ALL"):
    return await _get_category_data(category_type="movies", page=page, sort=sort, genre=genre, year=year)

@app.get("/tv-series")
async def get_tv_series(page: int = 1, sort: str = "RECOMMEND", genre: str = "ALL", year: str = "ALL"):
    return await _get_category_data(category_type="tv", page=page, sort=sort, genre=genre, year=year)

@app.get("/animation")
async def get_animation(page: int = 1, sort: str = "RECOMMEND", genre: str = "ALL", year: str = "ALL"):
    return await _get_category_data(category_type="anime", page=page, sort=sort, genre=genre, year=year)

@app.get("/search/suggest")
async def get_search_suggestions(q: str = Query(..., min_length=1)):
    url = f"{API_BASE}/subject/search-suggest"
    data = await _make_request(url, method="POST", payload={"keyword": q, "perPage": 10})
    inner = data.get("data", {})
    raw = inner.get("items", inner.get("list", []))
    suggestions = []
    for item in raw:
        sub = item.get("subject") or {}
        title = sub.get("title") or item.get("word") or item.get("title")
        if title:
            suggestions.append({
                "title": title,
                "slug": sub.get("detailPath") or item.get("detailPath"),
                "subject_id": sub.get("subjectId") or item.get("subjectId"),
                "poster_url": (sub.get("cover") or {}).get("url")
            })
    return {"suggestions": suggestions}

@app.get("/search")
async def search(q: str = Query(..., min_length=1), page: int = 1):
    url = f"{API_BASE}/subject/search"
    data = await _make_request(url, method="POST", payload={"keyword": q})
    inner = data.get("data", {})
    raw = inner.get("items", inner.get("list", []))
    items = [{
        "name": sub.get("title"),
        "poster_url": sub.get("cover", {}).get("url"),
        "slug": sub.get("detailPath"),
        "subject_id": sub.get("subjectId"),
        "rating": sub.get("imdbRatingValue"),
        "badge": sub.get("corner"),
        "year": sub.get("releaseDate", "")[:4] if sub.get("releaseDate") else None
    } for sub in raw]
    pager = inner.get("pager", {})
    total = pager.get("totalCount") or inner.get("total") or len(items)
    return {"query": q, "page": page, "total": total, "items": items}

@app.get("/detail/{slug}")
async def get_movie_detail(slug: str, subject_id: Optional[str] = None):
    cache_key = f"detail_{slug}_{subject_id or ''}"
    cached = get_from_cache(cache_key)
    if cached:
        return cached

    # If slug is numeric, query by subjectId directly
    if slug.isdigit():
        try:
            url = f"{API_BASE}/detail?subjectId={slug}"
            data = await _make_request(url)
            set_in_cache(cache_key, data)
            return data
        except Exception:
            pass

    # Standard detailPath query
    try:
        url = f"{API_BASE}/detail?detailPath={slug}"
        data = await _make_request(url)
        set_in_cache(cache_key, data)
        return data
    except Exception as e:
        # Fallback to subject_id if available
        if subject_id:
            try:
                url = f"{API_BASE}/detail?subjectId={subject_id}"
                data = await _make_request(url)
                set_in_cache(cache_key, data)
                return data
            except Exception:
                pass
        raise e

async def _fetch_stream_from_upstream(subject_id: str, detail_path: str, se: int, ep: int):
    global _bearer_token
    token = await _get_bearer_token()
    player_referer = (
        f"https://netfilm.world/spa/videoPlayPage/movies/{detail_path}"
        f"?id={subject_id}&type=/movie/detail&detailSe={se}&detailEp={ep}&lang=en"
    )
    headers = {
        **PLAYER_HEADERS,
        "Authorization": f"Bearer {token}" if token else "",
        "Referer": player_referer
    }

    urls_to_try = [
        f"{API_BASE}/subject/play?subjectId={subject_id}&se={se}&ep={ep}&detailPath={detail_path}",
        f"https://netfilm.world/wefeed-h5api-bff/subject/play?subjectId={subject_id}&se={se}&ep={ep}&detailPath={detail_path}",
        f"https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/play?subjectId={subject_id}&se={se}&ep={ep}&detailPath={detail_path}&host=moviebox.ph"
    ]

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        for play_url in urls_to_try:
            try:
                resp = await client.get(play_url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json().get("data", {})
                    if data.get("streams") or data.get("hasResource") or data.get("vipLocked"):
                        return data
                elif resp.status_code in [401, 403]:
                    _bearer_token = None
                    token = await _get_bearer_token()
                    headers["Authorization"] = f"Bearer {token}" if token else ""
                    retry_resp = await client.get(play_url, headers=headers)
                    if retry_resp.status_code == 200:
                        data = retry_resp.json().get("data", {})
                        if data.get("streams") or data.get("hasResource"):
                            return data
            except Exception:
                continue

    return {}

def extract_valid_streams(data: dict) -> list[dict]:
    valid = []
    for s in (data.get("streams", []) or []):
        raw_url = s.get("url", "")
        if raw_url and raw_url.startswith("http"):
            valid.append(s)
    return valid

@app.get("/api/stream/{subject_id}")
async def get_stream_sources(subject_id: str, detail_path: Optional[str] = "", se: int = 0, ep: int = 0):
    effective_detail_path = (detail_path or "").strip()
    if not effective_detail_path or effective_detail_path in ["null", "undefined"]:
        try:
            det = await get_movie_detail(subject_id, subject_id)
            sub = det.get("data", {}).get("subject", {})
            effective_detail_path = sub.get("detailPath") or subject_id
        except Exception:
            effective_detail_path = subject_id

    cache_key = f"stream_{subject_id}_{effective_detail_path}_{se}_{ep}"
    cached = get_from_cache(cache_key)
    if cached:
        return cached

    # 1. Primary upstream fetch
    data = await _fetch_stream_from_upstream(subject_id, effective_detail_path, se, ep)
    valid_raw_streams = extract_valid_streams(data)
    effective_se = se
    effective_ep = ep
    effective_sid = subject_id
    effective_slug = effective_detail_path
    stream_note = None
    det_data = None

    # 2. Season / Episode Fallback if primary returned no playable stream
    if not valid_raw_streams:
        se_ep_candidates = []
        if se == 0 and ep == 0:
            se_ep_candidates.append((1, 1))
        elif se == 1 and ep == 1:
            se_ep_candidates.append((0, 0))

        try:
            det_data = await get_movie_detail(effective_detail_path, subject_id)
            seasons = det_data.get("data", {}).get("resource", {}).get("seasons", [])
            for s in seasons:
                s_se = s.get("se", 0)
                if (s_se, 1) not in se_ep_candidates:
                    se_ep_candidates.append((s_se, 1))
        except Exception:
            pass

        for fb_se, fb_ep in se_ep_candidates:
            fb_data = await _fetch_stream_from_upstream(subject_id, effective_detail_path, fb_se, fb_ep)
            fb_valid = extract_valid_streams(fb_data)
            if fb_valid:
                data = fb_data
                valid_raw_streams = fb_valid
                effective_se = fb_se
                effective_ep = fb_ep
                break

    # 3. Dubs & Language Fallback (e.g. Inception, Regional Dubs)
    if not valid_raw_streams:
        if not det_data:
            try:
                det_data = await get_movie_detail(effective_detail_path, subject_id)
            except Exception:
                det_data = {}

        dubs = det_data.get("data", {}).get("subject", {}).get("dubs", []) or []
        for dub in dubs:
            d_sid = dub.get("subjectId")
            d_slug = dub.get("detailPath")
            d_name = dub.get("lanName") or dub.get("lanCode") or "Alternate Audio"
            if d_sid and d_slug and str(d_sid) != str(subject_id):
                dub_data = await _fetch_stream_from_upstream(d_sid, d_slug, effective_se, effective_ep)
                dub_valid = extract_valid_streams(dub_data)
                if not dub_valid and (effective_se != 0 or effective_ep != 0):
                    dub_data = await _fetch_stream_from_upstream(d_sid, d_slug, 0, 0)
                    dub_valid = extract_valid_streams(dub_data)
                if dub_valid:
                    data = dub_data
                    valid_raw_streams = dub_valid
                    effective_sid = d_sid
                    effective_slug = d_slug
                    stream_note = f"Playing {d_name} (Auto-Switched Source)"
                    break

    # 4. Sibling Search Fallback (by clean title e.g. Oppenheimer Hindi -> Oppenheimer original)
    if not valid_raw_streams:
        raw_title = det_data.get("data", {}).get("subject", {}).get("title") if det_data else ""
        if not raw_title:
            raw_title = effective_detail_path.split("-")[0]
        clean_title = re.sub(r"\[.*?\]|\(.*?\)|S\d+.*", "", raw_title).strip()
        if clean_title and len(clean_title) >= 3:
            try:
                search_res = await search(clean_title)
                for item in search_res.get("items", []):
                    i_sid = item.get("subject_id")
                    i_slug = item.get("slug")
                    if i_sid and i_slug and str(i_sid) != str(subject_id):
                        sib_data = await _fetch_stream_from_upstream(i_sid, i_slug, effective_se, effective_ep)
                        sib_valid = extract_valid_streams(sib_data)
                        if not sib_valid and (effective_se != 0 or effective_ep != 0):
                            sib_data = await _fetch_stream_from_upstream(i_sid, i_slug, 0, 0)
                            sib_valid = extract_valid_streams(sib_data)
                        if sib_valid:
                            data = sib_data
                            valid_raw_streams = sib_valid
                            effective_sid = i_sid
                            effective_slug = i_slug
                            stream_note = f"Playing {item.get('name')} (Free Stream)"
                            break
            except Exception:
                pass

    streams = []
    for s in valid_raw_streams:
        raw_url = s.get("url", "")
        if not raw_url:
            continue
        proxy_url = f"/api/proxy/stream?url={urllib.parse.quote(raw_url, safe='')}"
        res_label = f"{s.get('resolutions')}p" if s.get('resolutions') else "HD"
        streams.append({
            "resolution": res_label,
            "format": s.get("format", "MP4"),
            "url": raw_url,
            "proxy_url": proxy_url,
            "size": s.get("size"),
            "duration": s.get("duration"),
            "codec": s.get("codecName")
        })

    has_playable = len(streams) > 0
    note_msg = stream_note
    if not has_playable:
        if data.get("vipLocked"):
            note_msg = "This title is VIP-locked upstream with no alternative free streams available."
        else:
            note_msg = "No playable free stream available for this selection."

    res = {
        "subject_id": effective_sid,
        "detail_path": effective_slug,
        "se": effective_se,
        "ep": effective_ep,
        "has_resource": has_playable,
        "sources": streams,
        "hls": data.get("hls", []),
        "dash": data.get("dash", []),
        "free_episodes": data.get("freeNum"),
        "limited": data.get("limited", False),
        "vip_locked": data.get("vipLocked", False) and not has_playable,
        "note": note_msg
    }
    if has_playable:
        set_in_cache(cache_key, res)
    return res

@app.get("/api/stream/{subject_id}/captions")
async def get_captions(subject_id: str, detail_path: Optional[str] = "", se: int = 0, ep: int = 0):
    effective_detail_path = (detail_path or "").strip()
    if not effective_detail_path or effective_detail_path in ["null", "undefined"]:
        try:
            det = await get_movie_detail(subject_id, subject_id)
            sub = det.get("data", {}).get("subject", {})
            effective_detail_path = sub.get("detailPath") or subject_id
        except Exception:
            effective_detail_path = subject_id

    cache_key = f"caps_{subject_id}_{effective_detail_path}_{se}_{ep}"
    cached = get_from_cache(cache_key)
    if cached:
        return cached

    data = await _fetch_stream_from_upstream(subject_id, effective_detail_path, se, ep)
    if not data.get("hasResource") and not data.get("streams"):
        fallback_se = 1 if se == 0 else 0
        fallback_ep = 1 if ep == 0 else 0
        fb_data = await _fetch_stream_from_upstream(subject_id, effective_detail_path, fallback_se, fallback_ep)
        if fb_data.get("hasResource") or fb_data.get("streams"):
            data = fb_data
            se = fallback_se
            ep = fallback_ep

    streams = data.get("streams", [])
    dash = data.get("dash", [])

    stream_id = None
    stream_format = None
    if streams:
        stream_id = streams[0].get("id")
        stream_format = streams[0].get("format", "MP4")
    elif dash:
        stream_id = dash[0].get("id")
        stream_format = dash[0].get("format", "DASH")

    if not stream_id:
        return {"subject_id": subject_id, "se": se, "ep": ep, "count": 0, "captions": []}

    cap_url = (
        f"{API_BASE}/subject/caption"
        f"?format={stream_format}&id={stream_id}&subjectId={subject_id}&detailPath={effective_detail_path}"
    )
    cap_data = await _make_request(cap_url)
    inner = cap_data.get("data", {})
    raw_captions = inner.get("captions", []) if isinstance(inner, dict) else inner
    
    formatted_captions = []
    for c in raw_captions:
        raw_cap_url = c.get("url", "")
        formatted_captions.append({
            "id": c.get("id"),
            "language": c.get("lan"),
            "label": c.get("lanName") or c.get("lan", "Subtitle"),
            "url": raw_cap_url,
            "vtt_proxy_url": f"/api/proxy/subtitle?url={urllib.parse.quote(raw_cap_url, safe='')}" if raw_cap_url else None
        })

    result = {"subject_id": subject_id, "se": se, "ep": ep, "count": len(formatted_captions), "captions": formatted_captions}
    set_in_cache(cache_key, result)
    return result

@app.get("/api/random")
async def get_random_title():
    """Returns a random featured title from home catalog for 'Surprise Me'."""
    home_data = await get_home()
    candidates = []
    for s in home_data.get("sections", []):
        for item in s.get("items", []):
            if item.get("slug") and item.get("poster_url") and float(item.get("rating") or 0) >= 7.0:
                candidates.append(item)
    if not candidates:
        for s in home_data.get("sections", []):
            candidates.extend(s.get("items", []))
    if candidates:
        return random.choice(candidates)
    raise HTTPException(status_code=404, detail="No titles found")

# Serve Vite build if client/dist exists, else fallback to API dashboard
client_dist = os.path.join(os.path.dirname(__file__), "client", "dist")
if os.path.exists(client_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(client_dist, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(client_dist, full_path)
        if os.path.isfile(file_path):
            from fastapi.responses import FileResponse
            return FileResponse(file_path)
        index_file = os.path.join(client_dist, "index.html")
        from fastapi.responses import FileResponse
        return FileResponse(index_file)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
