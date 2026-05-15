# remotion-video

To install dependencies:

```bash
npm install
```

To render the original general video:

```bash
npm run render
```

To render one stakeholder explainer:

```bash
npm run render -- stakeholder-buyer
```

To render all stakeholder explainers:

```bash
npm run render:stakeholders
```

Generated MP4s are written to `dist/`.

Stakeholder explainers are chaptered videos of about 70 seconds each: portal scope,
one scene per module, workflow value chain, and closing call to action.

Available stakeholder compositions:

- `stakeholder-buyer`
- `stakeholder-seller`
- `stakeholder-agent`
- `stakeholder-developer`
- `stakeholder-professional`
- `stakeholder-investor`
- `stakeholder-admin`

On Windows, if Chrome for Testing cannot start, point Remotion at local Chrome:

```powershell
$env:PUPPETEER_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
```
