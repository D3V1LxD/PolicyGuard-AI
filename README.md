# PolicyGuard AI Chrome Extension

PolicyGuard AI is a Chrome Extension (Manifest V3) that detects and summarizes Privacy Policies and Terms & Conditions using an LLM (GitHub-compatible chat completions endpoint).

## Features

- Automatic detection of policy-like pages
- Auto-analysis on sign-in/sign-up pages
- Website-level policy discovery (finds Privacy/Terms links and summarizes)
- Independent ON/OFF switches for:
   - Auto Analyze Every Website
   - Auto Analyze Sign In / Sign Up
- Manual **Analyze Page** button in popup
- Clean policy text extraction from DOM
- Long document handling with chunking (> 3000 words)
- Structured risk output (score, risk level, key points, red flags, categories)
- Privacy Mode (local/mock analysis without API calls)
- Classic popup UI with risk bands and score limits
- Silent skip behavior when readable policy text is not found (no blocking page behavior)

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript
- No external heavy frameworks

## Project Structure

```text
PolicyGuard-AI/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.css
├── popup.js
├── icon.png
└── utils/
    ├── api.js
    ├── chunker.js
    ├── extractor.js
    └── parser.js
```

## Installation (Local)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `PolicyGuard-AI` folder.
5. Pin **PolicyGuard AI** from the extensions toolbar.

## Configuration

### API Key

- The extension uses a GitHub-compatible endpoint by default:
  - `https://models.inference.ai.azure.com/chat/completions`
- Default model:
  - `Meta-Llama-3.1-8B-Instruct`

You can set the API key in the popup input field.

### Privacy Mode

- **ON**: Uses local heuristic analysis (no external API calls)
- **OFF**: Uses LLM API analysis

### Auto Analysis Switches

In popup controls, you can turn each mode ON/OFF independently:

- **Auto Analyze Every Website**
   - ON: attempts website-wide policy discovery and summary on page visit
   - OFF: disables automatic website-level policy summary
- **Auto Analyze Sign In / Sign Up**
   - ON: runs automatic analysis on detected authentication pages
   - OFF: disables auth-page automatic analysis

These preferences are persisted in `chrome.storage.local` and survive popup reload/browser restart.

## How It Works

1. Content script detects policy/sign-in/sign-up context.
2. Background service worker orchestrates extraction/analysis.
3. For website summaries, policy links are discovered and fetched.
4. If policy text is very long, chunk summaries are generated and merged.
5. If no readable policy text is found, auto-analysis flow silently skips.
6. Results are shown in:
   - Extension popup UI
   - In-page auto popup for automatic analysis flows

## Troubleshooting

- **“Could not establish connection. Receiving end does not exist.”**
   - Reload the extension from `chrome://extensions`
   - Refresh the active site tab
   - This usually means the content script was not loaded in the page context yet

- **Preferences reset after reload**
   - Reopen popup and verify switches are ON/OFF as expected
   - Current implementation saves preferences directly to `chrome.storage.local`

- **No auto popup on some sites**
   - Some pages may not expose clear Privacy/Terms links or readable text
   - Manual **Analyze Page** remains available

## Output Format (Structured JSON)

The LLM output is normalized into this schema:

```json
{
  "summary": "short plain-English summary",
  "safety_score": 1,
  "risk_level": "Low",
  "key_points": ["..."],
  "red_flags": ["..."],
  "categories": {
    "data_collection": "Low",
    "third_party_sharing": "Low",
    "tracking": "Low",
    "user_rights": "Strong"
  }
}
```

## Publishing to GitHub

1. Initialize git (if needed):
   - `git init`
2. Add files:
   - `git add .`
3. Commit:
   - `git commit -m "Initial commit: PolicyGuard AI extension"`
4. Create a new GitHub repo and push:
   - `git remote add origin <your-repo-url>`
   - `git branch -M main`
   - `git push -u origin main`

## Disclaimer

This tool provides AI-generated summaries and is **not legal advice**.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
