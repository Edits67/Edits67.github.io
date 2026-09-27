# GIFBOX

Mobile-first Tenor-style GIF browser with a black/green command-line-inspired theme. The app loads `/gifs.json` on startup.

## Files

- index.html
- style.css
- script.js
- gifs.json

## JSON format

You can use either:

```json
[
  {
    "name": "Cat Vibing",
    "url": "https://example.com/cat.gif",
    "tags": ["cat", "funny"]
  }
]
```

or:

```json
{
  "gifs": [
    {
      "name": "Cat Vibing",
      "url": "https://example.com/cat.gif",
      "tags": ["cat", "funny"]
    }
  ]
}
```

## Running it

For local testing, the easiest option is a tiny local server:

- Python: `py -m http.server 8080`
- Then open `http://localhost:8080`

The page also has a local JSON file picker, so you can load JSON even when opened directly.

Remote JSON URLs need CORS permission from the JSON host.
