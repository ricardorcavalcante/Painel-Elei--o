// REPL driver for Painel Eleitoral DF 2026 (Vite + vanilla JS + Google Maps +
// Supabase). Run against the Vite dev server started separately (`npm run dev`).
// Designed for agents: wrap in tmux, send-keys commands, capture-pane output.
import { chromium } from 'playwright';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

let browser = null;
let page = null;
const consoleLog = [];

const COMMANDS = {
  async launch() {
    if (browser) return console.log('already launched');
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    // Contexto com permissão de geolocalização já concedida (fixada no
    // Plano Piloto/DF) — sem isso, navigator.geolocation.getCurrentPosition
    // trava esperando um prompt que o headless nunca mostra, e fluxos
    // como fazerCheckin() (voluntario.js) nunca chamam seu callback.
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      geolocation: { latitude: -15.7801, longitude: -47.9292 },
      permissions: ['geolocation'],
    });
    page = await context.newPage();
    page.on('console', msg => consoleLog.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', e => consoleLog.push(`[pageerror] ${e.message}`));
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('.tab-btn[data-tab="map"]', { timeout: 15_000 });
    console.log('launched.', APP_URL);
  },

  async viewport(args) {
    if (!page) return console.log('ERROR: launch first');
    const [w, h] = args.split(' ').map(Number);
    if (!w || !h) return console.log('ERROR: usage — viewport <width> <height>');
    await page.setViewportSize({ width: w, height: h });
    console.log('viewport →', w + 'x' + h);
  },

  async 'click-xy'(args) {
    if (!page) return console.log('ERROR: launch first');
    const [x, y] = args.split(' ').map(Number);
    try { await page.mouse.click(x, y); console.log('click-xy', x, y, '→ OK'); }
    catch (e) { console.log('click-xy', x, y, '→ ERROR:', e.message.split('\n')[0]); }
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  // DOM click via page.click (plain page, no BrowserView layering issue
  // like Electron — locator.click() is fine here).
  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.click(sel, { timeout: 5000 }); console.log('click', sel, '→ OK'); }
    catch (e) { console.log('click', sel, '→ ERROR:', e.message.split('\n')[0]); }
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(t => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')];
      const el = els.find(e => e.textContent?.trim() === t)
              ?? els.find(e => e.textContent?.includes(t));
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK: ' + el.tagName;
    }, text);
    console.log('click-text', JSON.stringify(text), '→', r);
  },

  async wheel(args) {
    if (!page) return console.log('ERROR: launch first');
    const [dx, dy] = args.split(' ').map(Number);
    try { await page.mouse.wheel(dx || 0, dy || 0); console.log('wheel', dx, dy, '→ OK'); }
    catch (e) { console.log('wheel → ERROR:', e.message.split('\n')[0]); }
  },

  async 'set-offline'(args) {
    if (!page) return console.log('ERROR: launch first');
    const offline = args.trim() !== 'false';
    try { await page.context().setOffline(offline); console.log('set-offline →', offline); }
    catch (e) { console.log('set-offline → ERROR:', e.message.split('\n')[0]); }
  },

  async 'set-files'(args) {
    if (!page) return console.log('ERROR: launch first');
    const sp = args.indexOf(' ');
    const sel = sp === -1 ? args : args.slice(0, sp);
    const paths = sp === -1 ? [] : args.slice(sp + 1).split('|');
    try { await page.setInputFiles(sel, paths); console.log('set-files', sel, '→ OK', paths); }
    catch (e) { console.log('set-files', sel, '→ ERROR:', e.message.split('\n')[0]); }
  },

  async fill(args) {
    if (!page) return console.log('ERROR: launch first');
    const sp = args.indexOf(' ');
    const sel = sp === -1 ? args : args.slice(0, sp);
    const value = sp === -1 ? '' : args.slice(sp + 1);
    try { await page.fill(sel, value, { timeout: 5000 }); console.log('fill', sel, '→ OK'); }
    catch (e) { console.log('fill', sel, '→ ERROR:', e.message.split('\n')[0]); }
  },

  async type(text) { if (page) await page.keyboard.type(text, { delay: 20 }); },
  async press(key) { if (page) await page.keyboard.press(key); },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.waitForSelector(sel, { timeout: 10_000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message.split('\n')[0]); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      s => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null));
  },

  // App-specific: nav tabs are switchTab('map'|'ra'|'dashboard'|'okr'|'agenda'|'checkin'),
  // wired via onclick — calling the function directly is more reliable than
  // clicking the button (works even if the tab bar scrolls off-screen).
  async 'switch-tab'(tab) {
    if (!page) return console.log('ERROR: launch first');
    await page.evaluate(t => window.switchTab(t), tab);
    await page.waitForTimeout(500); // deixa o *initXModule() da aba resolver
    console.log('switch-tab', tab, '→ OK');
  },

  // App-specific: login form lives in the OKR sidebar (#okr-login-email /
  // #okr-login-password + okrSignInEmail()) but the session is shared
  // across all tabs once logged in.
  async login(args) {
    if (!page) return console.log('ERROR: launch first');
    const [email, senha] = args.split(' ');
    await page.evaluate(t => window.switchTab(t), 'okr');
    await page.waitForSelector('#okr-login-email', { timeout: 10_000 }).catch(() => {});
    const hasForm = await page.$('#okr-login-email');
    if (!hasForm) { console.log('login → já logado (ou form ausente)'); return; }
    await page.fill('#okr-login-email', email);
    await page.fill('#okr-login-password', senha);
    await page.click('button:has-text("Entrar")');
    await page.waitForTimeout(1500);
    const status = await page.evaluate(() => document.getElementById('okr-auth-status')?.innerText?.trim());
    console.log('login', email, '→', status);
  },

  'console'(args) {
    if (args === '--errors') {
      const errs = consoleLog.filter(l => l.startsWith('[error]') || l.startsWith('[pageerror]'));
      console.log(errs.length ? errs.join('\n') : '(nenhum erro)');
    } else {
      console.log(consoleLog.slice(-50).join('\n') || '(vazio)');
    }
  },

  async quit() { if (browser) await browser.close().catch(() => {}); browser = null; page = null; },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

// Chromium (ao contrário do Electron) não mexe no stdin do processo Node,
// então dá pra usar process.stdin puro — funciona tanto interativo quanto
// recebendo um heredoc via pipe (`node driver.mjs <<'EOF' ... EOF`).
//
// IMPORTANTE: usa `for await...of rl` (async iterator), não `rl.on('line', async ...)`.
// O evento 'line' dispara pra cada linha imediatamente, sem esperar o handler
// anterior terminar — com um heredoc de várias linhas, todos os comandos
// disparavam em paralelo e corriam na frente do "launch" ainda em andamento.
// O async iterator espera cada `await fn(rest)` terminar antes de puxar a
// próxima linha, serializando de verdade.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function main() {
  console.log('painel-eleitoral driver — "help" for commands, "launch" to start');
  process.stdout.write('driver> ');
  for await (const line of rl) {
    const trimmed = line.trim();
    const sp = trimmed.indexOf(' ');
    const cmd = sp === -1 ? trimmed : trimmed.slice(0, sp);
    const rest = sp === -1 ? '' : trimmed.slice(sp + 1);
    if (cmd) {
      const fn = COMMANDS[cmd];
      if (!fn) console.log('unknown:', cmd, '— try: help');
      else {
        try { await fn(rest); } catch (e) { console.log('ERROR:', e.message); }
        if (cmd === 'quit') break;
      }
    }
    process.stdout.write('driver> ');
  }
  await COMMANDS.quit();
  process.exit(0);
}
main();
