# Least Count

A multiplayer Least Count card game for 2–6 players. Play against bots or create a private room and invite friends with a link.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/P1107Y/least-count)

## Run locally

```bash
npm install
npm run dev      # client on http://localhost:5173, server on :3001
```

Production build, served by the Node server on one port:

```bash
npm run build
npm start        # http://localhost:3001 (or $PORT)
```

## Tests

```bash
npm test
```

## Hosting

The game needs a long-running Node server (it uses WebSockets), so static hosts like GitHub Pages or Netlify won't work. `render.yaml` deploys it to Render's free tier with the button above.

Game state is kept in server memory, so restarting the server ends any games in progress. On Render's free plan the server sleeps after 15 minutes without visitors and takes about a minute to wake on the next visit.

House rules and full requirements: [least-count-requirements.md](least-count-requirements.md).
