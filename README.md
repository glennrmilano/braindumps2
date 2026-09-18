# BrainDumps

**Free your mind, one dump at a time.**

BrainDumps is a Google Apps Script web app based on BrainCatch. It gives each signed-in user a new private Google Sheet. It does not read or import BrainCatch or the older Braindumps app.

## What it does

- **Catch:** save a typed or dictated thought. The original text is retained. AI indexing runs when configured; Catch shows save confirmation and explicit todo candidates for review, without a reflective reply. Raw capture still saves if AI extraction is unavailable.
- **Ask:** use Neutral, Brainstorm, or Coach in a saved conversation. Switch modes between replies. Every new conversation starts Neutral. Replies are grounded in the capture archive; conversation turns are kept separate from the captured-thought evidence. Brainstorm and Coach suggestions have an explicit **Add to todos** action.
- **Todos:** confirm a Catch candidate, add a todo directly, or add an Ask suggestion. Set a due date, mark done, and reopen. Optional daily email includes only open items due today or overdue. Reminders are off until the user opts in.

Voice dictation uses the browser's SpeechRecognition API when available. Typing always works.

## Storage

The app creates a spreadsheet named `BrainDumps - My Brain` on first use and saves its ID in that user's Apps Script user properties. Sheets are `Entries`, `Index`, `State`, `Todos`, `Conversations`, and `Ask Messages`. Entries and Ask messages are stored separately. Each user operates on their own spreadsheet because the web app executes as the accessing user.

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
4. Deploy as a web app with **Execute as: User accessing the web app**. The manifest sets the audience to **Anyone**, so each user must authorize Sheets, external requests, trigger management, mail, and email identity. Use a narrower audience in the deployment settings if desired.
5. Check capture, Ask, todos, and reminder opt-in with test accounts before sharing the URL. Reminders create a trigger under the opting-in user's account and require that user's Google email to be available.

`MarkdownLibraries.html` is bundled locally. Run `npm run build:markdown` after changing the pinned Markdown dependencies.

Source is pushed to its own Apps Script project. A versioned web app deployment exists; use `npx @google/clasp deployments` to inspect it. Pushing source updates the project HEAD, while the versioned web app must be updated separately to receive new changes.
