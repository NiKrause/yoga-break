# Yoga Clips signet

The countdown: an arc for the waiting time that runs out, and a clip in its
middle. Drawn on Le Space Belege's construction and palette (Brand & Style
Guide v1): one accent shape and one ink shape, never rotated, no shadows, no
other colours.

| File | Use |
| --- | --- |
| `mark-light.svg` | on paper `#FAF6EE`: arc amber `#FFB020`, play ink `#0F1B2D` |
| `mark-dark.svg` | on night `#0B0E15`: arc lime `#C6F24E`, play snow `#F4F6FB` |
| `mark-mono.svg` | one colour (`currentColor`), for prints and small sizes |
| `favicon.svg` | browser tab and home screen: snow on an ink tile |
| `avatar-light.svg`, `avatar-dark.svg` | square avatars, 1024 px; `avatar-dark` is the plugin's `.claude-plugin/icon.png` |

The wordmark is set in text, not drawn: "LE SPACE" small with wide tracking
above "yoga clips" in Sora, as Belege's header sets "belege".

Render a PNG with Inkscape:

```bash
inkscape brand/avatar-dark.svg --export-type=png --export-width=1024 --export-filename=.claude-plugin/icon.png
```
