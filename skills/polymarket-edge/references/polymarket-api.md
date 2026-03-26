# Polymarket API Reference

All endpoints are public. No API key required. Rate limits are not published — be polite (0.2–0.5s between calls).

## Gamma API (market data)

Base URL: `https://gamma-api.polymarket.com`

### List active markets
```
GET /markets?active=true&closed=false&limit=200
```
Key response fields per market:
- `id` — market identifier (also `conditionId` on some endpoints)
- `slug` — URL-friendly name, used in `polymarket.com/event/{slug}`
- `question` — human-readable market question
- `outcomePrices` — JSON string like `'["0.72","0.28"]'` → YES/NO probabilities (0–1)
- `outcomes` — JSON string like `'["YES","NO"]'`
- `endDate` / `endDateIso` — when the market closes
- `volume` — total volume traded (USD string)
- `active` — boolean

### Get public profile by wallet
```
GET /public-profile?slug={username}
```
Returns:
- `proxyWallet` — the Gnosis Safe proxy address to use for trade tracking
- `name`, `username`, `bio`

### Get market by condition ID
```
GET /markets?conditionId={id}
```

## Data API (trade history)

Base URL: `https://data-api.polymarket.com`

### Get trades for a wallet
```
GET /trades?user={proxyWalletAddress}&limit=20
```
Returns array of trade objects:
- `id` / `transactionHash` — unique trade ID
- `timestamp` / `createdAt` — ISO timestamp
- `conditionId` — market ID
- `side` — "BUY" or "SELL" (maps to YES/NO direction)
- `outcomeIndex` — 0 = YES, 1 = NO
- `price` / `outcomePrice` — price paid (0–1)
- `size` / `sharesAmount` — number of shares
- `amount` — USD value

**IMPORTANT**: Always use the `proxyWallet` address, never the raw EOA (MetaMask address). Using EOA returns zero results.

### Get user activity
```
GET /activity?user={proxyWalletAddress}
```

### Leaderboards
```
GET /leaderboards
```

## URL patterns

| Type | URL |
|---|---|
| Market page | `https://polymarket.com/event/{slug}` |
| User profile | `https://polymarket.com/profile/{username}` or `/@{username}` |
| Market by condition ID | `https://polymarket.com/event/{conditionId}` |

## Finding proxy wallet for a user

1. Visit `polymarket.com/@{username}` in browser
2. Open DevTools → Network
3. Filter for `public-profile` requests
4. Copy `proxyWallet` from the response JSON

Or programmatically:
```python
import urllib.request, json
resp = urllib.request.urlopen(
    f"https://gamma-api.polymarket.com/public-profile?slug={username}"
)
data = json.loads(resp.read())
proxy = data["proxyWallet"]
```

## outcomePrices format

Polymarket stores prices as a JSON-encoded string:
```json
"outcomePrices": "[\"0.72\",\"0.28\"]"
```
- First value = YES price = implied probability of YES
- Values always sum to ~1.0
- Price of 0.72 means "72¢ per share" = market implies 72% chance of YES

To parse:
```python
import json
prices = json.loads(market["outcomePrices"])  # ["0.72", "0.28"]
yes_prob = float(prices[0])  # 0.72
```
