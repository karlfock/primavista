# primavista

Note-reading trainer: a random note renders on a grand staff, you play the matching pitch on a connected MIDI keyboard. See `SPEC.md` for the full spec.

## Run locally

Static site, no build step. Serve the directory over HTTP (the Web MIDI API requires a secure context, so opening `index.html` directly via `file://` won't work in Chrome):

```
npm start
```

(runs `npx serve .`; any static file server works, e.g. `python3 -m http.server 8934`). Then open the printed local URL.

## Browser support

Web MIDI is supported in Chrome, Edge, and other Chromium-based browsers. It is **not** supported in Safari or Firefox without flags.

## Deploying to Vercel

It's a static site (`index.html`, `style.css`, `app.js`) — no build command or output directory needed, just deploy the repo root as-is. Vercel serves over HTTPS, which satisfies the secure-context requirement for Web MIDI.
