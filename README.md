# Quantes

A Discord bot for controlling a stock trading account (through [Alpaca](https://alpaca.markets)) from the Discord app on your phone.

- Slash commands for checking your account and placing trades
- Every trade asks you to tap **Confirm** before anything is sent
- You get a DM, which shows up as a push notification on your phone, when an order fills
- Only you can use it: everyone else is refused
- Uses **paper trading** (fake money) unless you explicitly switch it to live

## Commands

| Command | What it does |
| --- | --- |
| `/status` | Account value, today's P&L, cash, and whether the market is open |
| `/positions` | Open positions with profit/loss |
| `/orders` | Orders that haven't filled yet |
| `/price AAPL` | Latest price |
| `/buy AAPL 2` | Market buy (fractional shares OK), confirms first |
| `/sell AAPL 2` | Market sell, confirms first |
| `/close AAPL` | Sell your whole position in one stock |
| `/cancelall` | Cancel every open order |
| `/panic` | Pause trading, cancel all orders and sell everything |
| `/pause` / `/resume` | Block or allow new buys/sells |

Replies are only visible to you, even in a shared channel.

## Safety limits

- `ALPACA_PAPER=true` is the default. Live trading needs `ALPACA_PAPER=false`.
- `MAX_ORDER_VALUE` (default $1,000) refuses any single buy/sell larger than that.
- Market orders placed while the market is closed wait until it opens.

## Setup

You need a computer or server to run the bot, because the bot can't run on the iPhone itself. Your phone is the remote control.

### 1. Create the Discord bot

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → **Reset Token** → copy the token (this is `DISCORD_TOKEN`).
3. **OAuth2 → URL Generator**: tick `bot` and `applications.commands`, then under bot permissions tick `Send Messages`. Open the generated URL to invite the bot to your server. A private server just for you is best.

### 2. Get your Discord IDs

In Discord: **Settings → Advanced → Developer Mode** on. Then:
- Long-press your own name → **Copy User ID** (this is `DISCORD_OWNER_ID`).
- Long-press your server icon → **Copy Server ID** (this is `DISCORD_GUILD_ID`).

Make sure your server lets members send you DMs (server name → Privacy Settings), otherwise fill alerts can't reach you.

### 3. Get Alpaca keys

Sign up at <https://app.alpaca.markets>, switch to your **Paper** account, and generate API keys (`ALPACA_API_KEY`, `ALPACA_SECRET_KEY`).

### 4. Configure and run

```bash
cp .env.example .env        # then fill in .env
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m quantes
```

Or with Docker:

```bash
docker build -t quantes .
docker run -d --restart unless-stopped --env-file .env quantes
```

Never commit `.env`. It's already in `.gitignore`. If a key leaks, regenerate it right away.

### Where to host it

It has to run somewhere that stays on: a small VPS (about $5/month), a Raspberry Pi, a home PC that stays on, or a container host like Railway or Fly.io (set the variables from `.env.example` in their dashboard). Don't use GitHub Actions to run it, because its terms don't allow long-running services like this.

## Development

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```

This is a tool, not financial advice. Test with paper trading before using real money.
