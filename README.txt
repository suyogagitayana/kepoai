kepoAI
======
A static dashboard for OpenAI, Claude and Gemini news, official service status,
and archived Codex reset announcements.

Project layout
--------------
assets/js/       Browser code, provider marks and public archive data
assets/css/      Stylesheet
assets/images/   Site icons and wordmark
scripts/         Python build and content collection tools
templates/       HTML source template
tests/           Parser, client and validation tests
.github/         Scheduled collection and GitHub Pages deployment workflow
index.html       Generated page with embedded scripts, styles and images
content.json     Generated public feed for browser refreshes
requirements.txt Python collection dependency

Development commands (Python 3.9+ and Node.js)
---------------------------------------------
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
node tests/test_client.cjs
python scripts/build.py
python -m http.server 8000 --bind 127.0.0.1

Local preview: http://127.0.0.1:8000
Optional content collection: python scripts/refresh_content.py

Publishing and data
-------------------
GitHub Pages uses the GitHub Actions source. The workflow collects public news
and reset records hourly, then publishes index.html and content.json. Browser
pages check the public feed every five minutes and official status feeds every
minute. Failed requests preserve the last available records.

No API keys or login are required. Preferences and reminders stay in memory
until reload. Status providers receive the visitor's IP address with requests.
Google's status feed covers Gemini in Workspace, not Gemini API or AI Studio.
Reset records come from a third-party archive; they do not predict future resets.

Icons: provider marks are embedded in assets/js/brands.js. Site artwork is in
assets/images/. The build regenerates content-security hashes with the page.
