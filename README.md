# BrainDumps

**Free your mind, one dump at a time.**

BrainDumps is a Google Apps Script web app based on BrainCatch. It gives each signed-in user a new private Google Sheet. It does not read or import BrainCatch or the older Braindumps app.

## What it does

- **Respond:** use one text box to share a thought or ask a question, then submit it with **Neutral**, **Brainstorm**, or **Coach**. Every mode saves the original input. Neutral stays factual, Brainstorm develops possibilities, and Coach offers grounded pushback and a practical next move. Clear actions appear as a plain **To-dos** section. Questions use the complete saved archive. Each response independently has a 60% chance of ending with one follow-up question about a real concern or unresolved point. Recent exchanges provide conversational context. Raw input still saves if AI is unavailable.
- **Track:** a small badge beneath **Clear** shows the current number of saved entries and changes color every ten entries.

Voice dictation uses the browser's SpeechRecognition API when available. Typing always works.

## Storage

The app creates a spreadsheet named `BrainDumps - My Brain` on first use and saves its ID in that user's Apps Script user properties. The single input uses `Entries`, `Index`, and `State`. Existing `Conversations`, `Ask Messages`, and `Todos` sheets from earlier versions are left untouched. Questions are marked as questions so they do not rewrite saved state. Each user operates on their own spreadsheet because the web app executes as the accessing user.

## Local checks

```bash
npm ci
npm test
```

The HTML can be opened locally for visual inspection, but data actions need a deployed Apps Script web app.

## Apps Script setup

1. Open the [separate BrainDumps Apps Script project](https://script.google.com/d/1U4iisZP0zy0SxzwOtIhEHuHX0NjFK2drZnaFJRPsmzgNMDAYS9SkJNp4/edit). The local `.clasp.json` is connected to this project and ignored by Git. Do not point it at BrainCatch.
2. After local changes, run `npx @google/clasp push -f` to update this project. The first source push has been completed.
3. Set script property `OPENAI_API_KEY`. `OPENAI_MODEL` is optional; it defaults to `gpt-5.6-luna` and uses `gpt-4o-mini` only for documented compatibility failures.
4. Deploy as a web app with **Execute as: User accessing the web app**. The manifest sets the audience to **Anyone**, so each user must authorize Sheets and external requests. Use a narrower audience in the deployment settings if desired.
5. Check a thought and an archive question with test accounts before sharing the URL.

`MarkdownLibraries.html` is bundled locally. Run `npm run build:markdown` after changing the pinned Markdown dependencies.

Source is pushed to its own Apps Script project. A versioned web app deployment exists; use `npx @google/clasp deployments` to inspect it. Pushing source updates the project HEAD, while the versioned web app must be updated separately to receive new changes.
