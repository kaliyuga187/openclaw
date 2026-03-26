#!/usr/bin/env python3
"""
Compare NOAA NWS + Open-Meteo forecast data against Polymarket weather market odds.
Outputs a list of edge opportunities where real-world probability diverges from market price.

Usage:
    python3 fetch_weather_edge.py [--markets-file markets.json] [--threshold 0.05]
"""

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

# Import fetch_markets from same directory
sys.path.insert(0, __import__("os").path.dirname(__file__))
from fetch_markets import fetch_markets, fetch_with_retry

NOAA_API = "https://api.weather.gov"
OPEN_METEO_API = "https://api.open-meteo.com/v1/forecast"
THRESHOLD = float(__import__("os").environ.get("EDGE_THRESHOLD", "0.05"))

# Known US city coordinates for common weather market locations
CITY_COORDS: dict[str, tuple[float, float]] = {
    "new york": (40.7128, -74.0060),
    "nyc": (40.7128, -74.0060),
    "los angeles": (34.0522, -118.2437),
    "la": (34.0522, -118.2437),
    "chicago": (41.8781, -87.6298),
    "houston": (29.7604, -95.3698),
    "phoenix": (33.4484, -112.0740),
    "philadelphia": (39.9526, -75.1652),
    "san antonio": (29.4241, -98.4936),
    "san diego": (32.7157, -117.1611),
    "dallas": (32.7767, -96.7970),
    "san francisco": (37.7749, -122.4194),
    "sf": (37.7749, -122.4194),
    "seattle": (47.6062, -122.3321),
    "denver": (39.7392, -104.9903),
    "boston": (42.3601, -71.0589),
    "miami": (25.7617, -80.1918),
    "atlanta": (33.7490, -84.3880),
    "minneapolis": (44.9778, -93.2650),
    "detroit": (42.3314, -83.0458),
    "portland": (45.5051, -122.6750),
    "las vegas": (36.1699, -115.1398),
    "nashville": (36.1627, -86.7816),
    "memphis": (35.1495, -90.0490),
    "louisville": (38.2527, -85.7585),
    "baltimore": (39.2904, -76.6122),
    "milwaukee": (43.0389, -87.9065),
    "albuquerque": (35.0844, -106.6504),
    "tucson": (32.2226, -110.9747),
    "fresno": (36.7378, -119.7871),
    "sacramento": (38.5816, -121.4944),
    "kansas city": (39.0997, -94.5786),
    "mesa": (33.4152, -111.8315),
    "omaha": (41.2565, -95.9345),
    "raleigh": (35.7796, -78.6382),
    "cleveland": (41.4993, -81.6944),
    "new orleans": (29.9511, -90.0715),
    "tampa": (27.9506, -82.4572),
    "pittsburgh": (40.4406, -79.9959),
    "orlando": (28.5383, -81.3792),
    "cincinnati": (39.1031, -84.5120),
    "oklahoma city": (35.4676, -97.5164),
    "austin": (30.2672, -97.7431),
    "charlotte": (35.2271, -80.8431),
    "indianapolis": (39.7684, -86.1581),
    "columbus": (39.9612, -82.9988),
    "jacksonville": (30.3322, -81.6557),
    "el paso": (31.7619, -106.4850),
    "fort worth": (32.7555, -97.3308),
}


def extract_location(question: str) -> tuple[str, float, float] | None:
    """Extract a city name and its coordinates from a market question."""
    q = question.lower()
    for city, (lat, lon) in CITY_COORDS.items():
        if city in q:
            return city, lat, lon
    return None


def extract_temperature_threshold(question: str) -> float | None:
    """Extract a temperature value from a question like 'above 90°F in NYC'."""
    patterns = [
        r"(\d+)\s*°?\s*[fF]",
        r"(\d+)\s*degrees?\s*[fF]ahrenheit",
        r"(\d+)\s*°?\s*[cC]",
        r"reach\s+(\d+)",
        r"exceed\s+(\d+)",
        r"above\s+(\d+)",
        r"below\s+(\d+)",
        r"over\s+(\d+)",
        r"under\s+(\d+)",
    ]
    for pat in patterns:
        m = re.search(pat, question, re.IGNORECASE)
        if m:
            return float(m.group(1))
    return None


def fetch_noaa_forecast(lat: float, lon: float) -> dict | None:
    """Fetch NOAA NWS gridpoint forecast for a lat/lon."""
    try:
        points_url = f"{NOAA_API}/points/{lat:.4f},{lon:.4f}"
        points = fetch_with_retry(points_url)
        forecast_url = points.get("properties", {}).get("forecast")
        if not forecast_url:
            return None
        return fetch_with_retry(forecast_url)
    except (RuntimeError, KeyError):
        return None


def fetch_open_meteo_forecast(lat: float, lon: float, days: int = 7) -> dict | None:
    """Fetch Open-Meteo hourly forecast for a lat/lon."""
    params = urllib.parse.urlencode({
        "latitude": lat,
        "longitude": lon,
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode",
        "temperature_unit": "fahrenheit",
        "forecast_days": days,
        "timezone": "auto",
    })
    url = f"{OPEN_METEO_API}?{params}"
    try:
        return fetch_with_retry(url)
    except RuntimeError:
        return None


def estimate_rain_probability(noaa: dict | None, open_meteo: dict | None) -> float | None:
    """Estimate probability of rain/precipitation in the next 7 days."""
    probs = []

    if open_meteo:
        daily = open_meteo.get("daily", {})
        precip_probs = daily.get("precipitation_probability_max", [])
        if precip_probs:
            # Mean precipitation probability across forecast window
            valid = [p for p in precip_probs if p is not None]
            if valid:
                probs.append(max(valid) / 100.0)  # Use max (any rain = market resolves YES)

    if noaa:
        periods = noaa.get("properties", {}).get("periods", [])
        rain_keywords = ["rain", "shower", "storm", "precipitation", "drizzle", "wet"]
        rain_periods = sum(
            1 for p in periods
            if any(kw in p.get("shortForecast", "").lower() for kw in rain_keywords)
        )
        if periods:
            probs.append(rain_periods / len(periods))

    if not probs:
        return None
    return round(sum(probs) / len(probs), 4)


def estimate_temperature_probability(
    threshold: float,
    above: bool,
    open_meteo: dict | None,
) -> float | None:
    """Estimate probability that temp exceeds (or stays below) a threshold."""
    if not open_meteo:
        return None
    daily = open_meteo.get("daily", {})
    maxes = daily.get("temperature_2m_max", [])
    mins = daily.get("temperature_2m_min", [])

    if not maxes and not mins:
        return None

    temps = maxes if above else mins
    valid = [t for t in temps if t is not None]
    if not valid:
        return None

    hits = sum(1 for t in valid if (t >= threshold if above else t <= threshold))
    return round(hits / len(valid), 4)


def analyze_weather_market(market: dict) -> dict | None:
    """
    For a single weather Polymarket market, fetch real-world data and calculate edge.
    Returns edge dict or None if we can't compute an edge for this market.
    """
    question = market["question"]
    location = extract_location(question)
    if not location:
        return None

    city, lat, lon = location
    q_lower = question.lower()

    # Fetch forecast data from both sources
    noaa = fetch_noaa_forecast(lat, lon)
    open_meteo = fetch_open_meteo_forecast(lat, lon)

    if not noaa and not open_meteo:
        return None

    real_prob: float | None = None
    method = "unknown"

    # Determine market type and compute real probability
    if any(kw in q_lower for kw in ["rain", "precipitation", "snow", "storm", "hurricane", "flood"]):
        real_prob = estimate_rain_probability(noaa, open_meteo)
        method = "precipitation_probability"

    elif any(kw in q_lower for kw in ["temperature", "degrees", "°", "heat", "hot", "cold", "freeze"]):
        threshold = extract_temperature_threshold(question)
        if threshold is not None:
            above = any(kw in q_lower for kw in ["above", "over", "exceed", "reach", "high"])
            real_prob = estimate_temperature_probability(threshold, above, open_meteo)
            method = f"temperature_{'above' if above else 'below'}_{threshold}F"

    if real_prob is None:
        return None

    market_prob = market["yes_prob"]
    edge = abs(real_prob - market_prob)

    if edge < THRESHOLD:
        return None

    # Determine which side to bet
    if real_prob > market_prob:
        recommended = "YES"
        reasoning = f"Real-world data suggests {real_prob:.0%} chance, market prices YES at {market_prob:.0%}"
    else:
        recommended = "NO"
        reasoning = f"Real-world data suggests {real_prob:.0%} chance, market prices YES at {market_prob:.0%}"

    return {
        "market_id": market["id"],
        "question": question,
        "category": "weather",
        "location": city,
        "market_prob": market_prob,
        "real_prob": real_prob,
        "edge": round(edge, 4),
        "recommended": recommended,
        "reasoning": reasoning,
        "method": method,
        "sources": ["NOAA NWS" if noaa else None, "Open-Meteo" if open_meteo else None],
        "url": market["url"],
        # Fields required by bot.py is_tradeable() and place_trade()
        "clob_token_ids": market.get("clob_token_ids", []),
        "end_date": market.get("end_date", ""),
        "volume": market.get("volume", 0),
    }


def main():
    global THRESHOLD
    import argparse
    parser = argparse.ArgumentParser(description="Find weather market edges on Polymarket")
    parser.add_argument("--threshold", type=float, default=THRESHOLD)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    THRESHOLD = args.threshold

    print("[fetch_weather_edge] Fetching active weather markets...", file=sys.stderr)
    markets = fetch_markets(tag_filter="weather")
    print(f"[fetch_weather_edge] Found {len(markets)} weather markets", file=sys.stderr)

    edges = []
    for i, market in enumerate(markets):
        print(f"[fetch_weather_edge] Analyzing {i+1}/{len(markets)}: {market['question'][:60]}...", file=sys.stderr)
        result = analyze_weather_market(market)
        if result:
            edges.append(result)
        # Respect NOAA rate limits — brief pause between calls
        time.sleep(0.4)

    edges.sort(key=lambda x: x["edge"], reverse=True)
    indent = 2 if args.pretty else None
    print(json.dumps(edges, indent=indent))


if __name__ == "__main__":
    main()
