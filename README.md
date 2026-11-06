# Gettomass lower thirds

Code-rendered lower-third callouts for the [Get To Mass](https://gettomass.com) YouTube channel. Each one is a 7-second, 1920×1080, 30 fps animation exported as **ProRes 4444 with an alpha channel**, so it drops straight onto a Premiere or After Effects timeline over any footage.

**Live preview:** https://nongovkelvin.github.io/gettomass-lower-thirds/

## What it renders

A paper card in the app's brand style, bottom-left in the title-safe area:

- a green spine that grows up from the bottom,
- the card wiping open from the spine,
- a liturgical-colour strip drawing across the top,
- eyebrow, headline and sub-line rising in one after another.

On the way out the text fades first, then the card folds back into the spine and the spine collapses downward.

## What drives the output

- **Time.** `lower-third.html` exposes `setT(seconds)`, which draws one exact frame. Nothing animates on its own while rendering: every property (scale, clip-path inset, opacity, offset) is a pure function of `t`, run through easing curves (out-cubic, out-quart, in-cubic) over staggered time windows.
- **Copy.** The `VARIANTS` object holds the text for each callout (`intro`, `why`, `cta`). Add a key to make a new lower third.
- **URL parameters.** `?v=<variant>` picks the copy, `&d=<seconds>` sets the duration (the exit is timed from the end), `&t=<seconds>` shows a single frame, `&preview` loops it live over a checkerboard.
- **Render settings.** `FPS`, `DURATION` and the variant list are at the top of `render.mjs`, and can be overridden on the command line.

## How it's exported to video

1. `render.mjs` (Node 22, no dependencies) launches one headless Chrome and talks to it over the DevTools protocol. It sets a 1920×1080 viewport and a fully transparent default background, and waits for the font to load.
2. For each frame it calls `setT(frame / fps)` and takes a PNG screenshot, which keeps the alpha channel. That's 210 frames per variant.
3. `encode.swift` reads the PNG sequence and writes it through AVFoundation as ProRes 4444, keeping the alpha. No ffmpeg needed.

```bash
node render.mjs              # all variants -> out/gettomass-lower-third-<variant>.mov
node render.mjs intro cta    # just these
```

Needs macOS with Google Chrome and the Swift toolchain (Xcode Command Line Tools).

## Credits

Typeface: [Outfit](https://github.com/Outfitio/Outfit-Fonts), licensed under the SIL Open Font License 1.1. Code by Nongov Kelvin.
