# Chaturmasik Chovihar 2026 — Photo Frame Web App

A single-page web app for the VSDHAM app to link to after a child registers
for the Chaturmasik Chovihar Scheme 2026. Lets the child/parent add a photo,
fit it into the garden-themed frame, add the child's name, and download/share
the final image — with a confetti celebration on generation.

## Files
- `index.html` — the page
- `app.js` — all logic (photo picker, drag/pinch-zoom, canvas compositing, confetti, share)
- `template-overlay.png` — the decorative frame artwork with a transparent oval
  cut-out where the child's photo shows through
- `template-full.png` — the same artwork with the oval filled in black, used
  only for the landing-screen preview before a photo is chosen

## Hosting
Static files — drop all four into any web server / CDN / S3 bucket /
Firebase Hosting folder, no build step, no server-side code required.
Keep all four files in the same folder (relative paths are used).

Must be served over **http(s)**, not opened directly as a local file
(`file://...`), for two reasons:
1. The camera/gallery picker and Web Share API need it on real devices.
2. ⚠️ **Important**: browsers treat images loaded via `file://` as
   cross-origin and will block the canvas from exporting ("tainted canvas"
   security error) — so **Generate** will silently fail to produce an image
   if you just double-click `index.html` to test it. This is a `file://`
   quirk only; it will not happen once hosted on an actual domain. To test
   locally before deploying, run a tiny local server from this folder, e.g.:
   `python3 -m http.server 8080`, then open `http://localhost:8080/`.

   `standalone-preview.html` (single self-contained file, images inlined as
   base64) does not have this restriction and can be opened directly by
   double-clicking — use it for quick visual previews/sharing with
   stakeholders, but use the multi-file `index.html` + `app.js` for the
   actual production hosting (much smaller initial download, images are
   cacheable separately).

HTTPS specifically (not just HTTP) is required for camera access on most
mobile browsers, so use HTTPS for the real deployment.

## Linking from the VSDHAM app
Open this URL in an in-app browser / WebView after registration completes:

```
https://your-domain.com/path/index.html?name=Aarav%20Shah
```

The optional `?name=` query parameter pre-fills the name field (URL-encode
spaces as `%20` or `+`). The user can still edit it before generating. If
omitted, the field just starts empty.

## How the photo step works
- Tapping "Add Your Photo" opens the device's native picker. On iOS/Android
  this already shows both **Camera** and **Photo Gallery** as options — no
  custom UI was needed for that choice.
- The chosen photo is shown behind the frame artwork, auto-scaled to fully
  cover the oval opening (cover-fit), centered by default.
- The user can **drag** to reposition and **pinch** (or use the zoom slider)
  to scale, exactly like adjusting a profile photo on Instagram/WhatsApp.
- A dimmed mask with a dashed oval outline shows exactly what will be visible.

## Generating the final image
On "Generate My Card", everything is composited onto an HTML canvas at the
template's native resolution (941×1672 px):
1. The user's photo, clipped to the oval, at the exact pan/zoom they set.
2. The frame artwork on top (oval area is transparent in this layer).
3. The child's name, rendered onto a wooden-sign graphic drawn with canvas
   (matches the "Have you registered?" plank style already in the artwork).

The result is a single flattened PNG — no transparency, no app fonts
required by the viewer, safe to share anywhere.

## Confetti
A lightweight canvas-based particle burst (no external library) fires the
moment the final card is ready, similar to a like/reaction "popper" effect.
Pure CSS/canvas, ~100 lines, no dependencies.

## Download / Share
- **Download** uses a plain `<a download>` link with the canvas data URL —
  works everywhere.
- **Share** uses the native Web Share API (`navigator.share` with a file)
  when the browser/OS supports sharing images directly to WhatsApp etc.;
  falls back to triggering the same download if not supported.

## Known constraints / things to revisit
- The oval position is hard-coded in template pixel-space
  (`OVAL = {cx, cy, rx, ry}` near the top of `app.js`). If the artwork is
  ever redesigned and the oval moves, update those four numbers (and the
  name-sign position, which is calculated relative to the oval).
- This is the draft/near-final template per your note — happy to adjust
  copy, colors, or the name-sign placement once you've had a look.
- Tested at common mobile widths (375–420px) and scales to desktop too
  (capped at 560px wide so it doesn't look stretched on large screens).
