# Insta1gram

A high-fidelity Instagram-style social media demonstration web application featuring real-time demo interactions and automated server-side Telegram bot notifications.

---

## Features

- **Interactive Feed**: Explore high-resolution posts, like with heart-burst animations, save, comment, and copy shareable links.
- **Stories Experience**: Authentic Instagram story tray with gradient rings, story viewer, next/prev slide navigation, and reaction emojis.
- **Reels View**: Vertical video-style media player with up/down navigation, audio rotation, and engagement counters.
- **Direct Messages**: Two-column conversation interface with unread indicators, active threads, and simulated replies.
- **Search & Explore**: Dynamic multi-grid discovery with trending categories, hashtags, and instant creator filtering.
- **User Profiles & Edit Profile**: Custom bio, highlights, post statistics, and live profile editing.
- **Telegram Bot Notifications**: Seamless, server-side dispatch notifying your designated Telegram chat whenever someone submits the demo login form (capturing username, nickname, session ID, and timestamp).
- **Security & Privacy**: Actual visitor passwords are never stored, logged, or transmitted. Sensitive `.env` files are protected from HTTP access (HTTP 403).

---

## Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)

### 2. Configuration
Create a `.env` file in the project root:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
PORT=3000
```

### 3. Run the Server
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

### 4. Run Automated Tests
```bash
npm test
```

---

## License
ISC

