const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function harness({ model = true, random = 0.99 } = {}) {
  class Sheet {
    constructor(name = 'Sheet1') { this.name = name; this.rows = []; }
    getName() { return this.name; }
    setName(name) { this.name = name; return this; }
    getLastRow() { return this.rows.length; }
    setFrozenRows() {}
    getDataRange() { return { getValues: () => this.rows.length ? this.rows.map(row => row.slice()) : [[]] }; }
    getRange(row, col, count = 1, width = 1) {
      if (typeof row === 'string') return { setNumberFormat() {} };
      return {
        getValues: () => Array.from({ length: count }, (_, i) => Array.from({ length: width }, (_, j) => (this.rows[row - 1 + i] || [])[col - 1 + j] || '')),
        setValues: values => { values.forEach((value, i) => { const index = row - 1 + i; this.rows[index] ||= []; value.forEach((cell, j) => { this.rows[index][col - 1 + j] = cell; }); }); },
        setValue: value => { this.rows[row - 1] ||= []; this.rows[row - 1][col - 1] = value; },
        clearContent: () => { for (let i = 0; i < count; i++) for (let j = 0; j < width; j++) { this.rows[row - 1 + i] ||= []; this.rows[row - 1 + i][col - 1 + j] = ''; } },
      };
    }
    appendRow(row) { this.rows.push(row.slice()); }
  }
  class Book {
    constructor() { this.id = 'book-1'; this.sheets = [new Sheet()]; }
    getId() { return this.id; }
    getUrl() { return 'https://sheet.example/book-1'; }
    getSheets() { return this.sheets; }
    getSheetByName(name) { return this.sheets.find(sheet => sheet.name === name) || null; }
    insertSheet(name) { const sheet = new Sheet(name); this.sheets.push(sheet); return sheet; }
    getSpreadsheetTimeZone() { return 'UTC'; }
  }
  const book = new Book();
  const user = new Map();
  const script = new Map(model ? [['OPENAI_API_KEY', 'test-key']] : []);
  const triggers = [];
  const mail = [];
  const requests = [];
  let seq = 0;
  const propertyStore = map => ({ getProperty: key => map.get(key) || '', setProperty: (key, value) => map.set(key, value), deleteProperty: key => map.delete(key), getProperties: () => Object.fromEntries(map) });
  const context = vm.createContext({
    Math: Object.assign(Object.create(Math), { random: () => Array.isArray(random) ? random.shift() : random }),
    SpreadsheetApp: { create: () => book, openById: id => { if (id !== book.id) throw new Error('not found'); return book; } },
    PropertiesService: { getUserProperties: () => propertyStore(user), getScriptProperties: () => propertyStore(script) },
    LockService: { getUserLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    ScriptApp: { getProjectTriggers: () => triggers, newTrigger: handler => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create: () => triggers.push({ getHandlerFunction: () => handler }) }) }) }) }), deleteTrigger: trigger => triggers.splice(triggers.indexOf(trigger), 1) },
    MailApp: { sendEmail: (...args) => mail.push(args) },
    Utilities: { getUuid: () => String(++seq), formatDate: date => date.toISOString().slice(0, 10), DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_, text) => Array.from(crypto.createHash('sha256').update(text).digest()) },
    UrlFetchApp: { fetch: (_, options) => {
      const payload = JSON.parse(options.payload);
      requests.push(payload);
      const name = payload.response_format.json_schema.name;
      const question = name === 'brain_capture' && payload.messages[1].content.includes('What did I say?');
      const output = name === 'brain_capture' ? {
        entry: { type: question ? 'question' : 'mixed', title: 'Call Sam', gist: 'Call Sam', topics: [], entities: [], active_threads: [], stated_goals: [], facts_added: [], contradicts: [], retrieval_keywords: [], extracted_markdown: 'Call Sam' },
        state: { current_summary: 'Call Sam', goals: [], open_threads: [], watch_list: [] },
        response_markdown: question ? 'You said you planned to call Sam.' : payload.messages[1].content.includes('I will call Sam') ? 'You plan to speak with Sam tomorrow.\n\n### To-dos\n- Call Sam' : 'You shared a thought worth keeping.', relevant_entry_ids: []
      } : name === 'brain_dump_ask' ? {
        answer_markdown: payload.messages[1].content.includes('What did I say?') ? 'You said you planned to call Sam.' : 'A grounded answer', relevant_entry_ids: []
      } : { summary_markdown: 'Summary', relevant_entry_ids: [] };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }) };
    } },
  });
  vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), context);
  vm.runInContext(fs.readFileSync('BrainDump.gs', 'utf8'), context);
  return { context, book, mail, triggers, user, requests };
}

test('Catch saves original text and returns an organized response with inline to-dos', () => {
  const { context, book } = harness();
  assert.equal(context.getAppConfig().entryCount, 0);
  const result = context.saveBrainDump('I will call Sam tomorrow.');
  assert.equal(result.entryCount, 1);
  assert.equal(context.getAppConfig().entryCount, 1);
  assert.match(result.responseMarkdown, /You plan to speak with Sam tomorrow/);
  assert.match(result.responseMarkdown, /### To-dos\n- Call Sam/);
  assert.equal(book.getSheetByName('Entries').rows[1][12], 'I will call Sam tomorrow.');
  assert.equal(book.getSheetByName('Entries').rows[1][14], result.responseMarkdown);
  assert.equal(book.getSheetByName('Todos'), null);
  assert.match(context.buildCaptureSystemPrompt_(), /To-dos/);
});

test('Catch still saves raw thoughts if AI extraction is unavailable', () => {
  const { context, book } = harness({ model: false });
  const result = context.saveBrainDump('A thought worth keeping.');
  assert.match(result.warning, /Saved the original thought/);
  assert.match(result.responseMarkdown, /organized response is unavailable/);
  assert.equal(book.getSheetByName('Entries').rows[1][12], 'A thought worth keeping.');
});

test('Catch response omits To-dos for a thought without an explicit action', () => {
  const { context } = harness();
  const result = context.saveBrainDump('A thought worth keeping.');
  assert.doesNotMatch(result.responseMarkdown, /To-dos/);
});

test('a response can be explicitly marked as saved on its entry row', () => {
  const { context, book } = harness();
  const result = context.saveBrainDump('A thought worth keeping.');
  const saved = context.saveResponse(result.entryId);
  const entries = book.getSheetByName('Entries');
  assert.equal(entries.rows[0][15], 'response_saved_at');
  assert.equal(entries.rows[1][15], saved.savedAt);
  assert.match(saved.savedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('each response button applies its mode while preserving the same capture flow', () => {
  for (const [mode, phrase] of [
    ['neutral', 'Respond directly and factually'],
    ['brainstorm', 'offer a few distinct possibilities'],
    ['coach', 'offer candid but constructive pushback']
  ]) {
    const { context, requests } = harness();
    const result = context.saveBrainDump('A thought worth keeping.', mode);
    assert.equal(result.mode, mode);
    assert.match(requests[0].messages[0].content, new RegExp(phrase));
  }
});

test('follow-up choice is made independently for every Dump at a 60% threshold', () => {
  const turns = harness({ random: [0.59, 0.6] });
  turns.context.saveBrainDump('A thought worth keeping.');
  turns.context.saveBrainDump('Another thought worth keeping.');
  assert.match(turns.requests[0].messages[0].content, /End the response with one concise, open-ended follow-up question/);
  assert.match(turns.requests[1].messages[0].content, /Do not add a follow-up question/);
  const question = harness({ random: 0.59 });
  question.context.saveBrainDump('What did I say?');
  assert.match(question.requests.at(-1).messages[0].content, /End the response with one concise, open-ended follow-up question/);
});

test('a reply can use the previous exchange without treating the AI response as a fact', () => {
  const { context, requests } = harness();
  context.saveBrainDump('I will call Sam tomorrow.');
  context.saveBrainDump('That part makes me nervous.');
  const second = requests.filter(request => request.response_format.json_schema.name === 'brain_capture')[1];
  assert.match(second.messages[1].content, /You plan to speak with Sam tomorrow/);
  assert.match(second.messages[0].content, /Earlier AI replies are not facts/);
});

test('a question reviews the archive without rewriting saved state', () => {
  const { context, book, requests } = harness();
  context.saveBrainDump('I will call Sam tomorrow.');
  const before = context.getAppConfig().stateMarkdown;
  const result = context.saveBrainDump('What did I say?');
  assert.match(result.responseMarkdown, /planned to call Sam/);
  assert.equal(book.getSheetByName('Entries').rows[2][2], 'question');
  assert.equal(context.getAppConfig().stateMarkdown, before);
  assert.equal(requests.at(-1).response_format.json_schema.name, 'brain_dump_ask');
  assert.match(requests.at(-1).messages[1].content, /I will call Sam tomorrow/);
  assert.match(requests.at(-1).messages[0].content, /Do not add a follow-up question/);
});

test('an inaccessible existing archive is preserved instead of replaced', () => {
  const { context, user } = harness();
  user.set('BRAIN_DUMP_SPREADSHEET_ID', 'inaccessible-book');
  assert.throws(() => context.getAppConfig(), /no new archive was created/);
  assert.equal(user.get('BRAIN_DUMP_SPREADSHEET_ID'), 'inaccessible-book');
});

test('formula-like thoughts stay text in Sheets and read back unchanged', () => {
  const { context, book } = harness();
  const result = context.saveBrainDump('=SUM(1,2) is what the note says');
  assert.match(book.getSheetByName('Entries').rows[1][12], /^'/);
  assert.equal(context.readAskHistory_(book.getSheetByName('Entries'))[0].raw_entry, '=SUM(1,2) is what the note says');
});

test('Ask persists switched modes and keeps archive unchanged', () => {
  const { context } = harness();
  context.saveBrainDump('I will call Sam tomorrow.');
  const neutral = context.sendAskMessage('', 'neutral', 'What did I say?');
  const coach = context.sendAskMessage(neutral.conversationId, 'coach', 'What should I consider?');
  const conversation = context.getConversation(neutral.conversationId);
  assert.equal(conversation.messages.length, 4);
  assert.equal(conversation.messages[0].mode, 'neutral');
  assert.equal(conversation.messages[2].mode, 'coach');
  assert.equal(context.getAppConfig().entryCount, 1);
  assert.equal(context.getConversations().length, 1);
});

test('legacy todo reminder triggers cannot send email', () => {
  const { context, mail, user } = harness({ model: false });
  user.set('BRAIN_DUMP_REMINDER_ENABLED', 'true');
  context.sendDailyTodoReminder();
  assert.equal(mail.length, 0);
});

test('UI has one input and three response buttons without navigation tabs', () => {
  const html = fs.readFileSync('Index.html', 'utf8');
  assert.match(html, /class="brand">BrainDumps<\/div>.*class="sub">Free your mind, one dump at a time\./);
  assert.match(html, /id="catchResponse"/);
  assert.match(html, /id="entryCount"/);
  assert.match(html, /id="saveResponse"[^>]*>Save response<\/button>/);
  assert.match(html, /Math\.floor\(count\/10\)%6/);
  assert.equal((html.match(/<textarea /g) || []).length, 1);
  for (const mode of ['neutral', 'brainstorm', 'coach']) assert.match(html, new RegExp('data-dump-mode="' + mode + '"'));
  assert.doesNotMatch(html, /id="saveCatch"[^>]*>Dump<\/button>/);
  assert.doesNotMatch(html, /id="catchTab"|id="askTab"|Catch saves your thought|data-mode=/);
});
