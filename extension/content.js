/**
 * Antigravity Universal AI Bridge — Content Script (v2.6.0)
 * Zero-Click Auto-Connect, ChatGPT ProseMirror & Streaming Fix,
 * Available Model Retrieval & Automatic Rate-Limit Model Switching
 * Author: Shohag Rana Suvo (https://github.com/shohagranasuvo)
 */

(() => {
if (window.__ANTIGRAVITY_BRIDGE_LOADED__) {
    console.log("[AntigravityBridge] Already loaded in this tab. Skipping duplicate initialization.");
    return;
}
window.__ANTIGRAVITY_BRIDGE_LOADED__ = true;

const BRIDGE_VERSION = "2.6";

// Ignore non-chat subpages (like Gemini usage/settings pages)
const isNonChatPage = /\/(usage|extensions|updates|saved-info|gems|settings)/i.test(window.location.pathname);

const PROVIDERS = {
    "gemini.google.com": {
        key: "gemini",
        name: "Gemini",
        input: 'div.ql-editor[contenteditable="true"], rich-textarea div[contenteditable="true"], div[contenteditable="true"][role="textbox"], textarea',
        sendBtn: 'button.send-button, button[aria-label*="Send message" i], button[aria-label*="Send" i]',
        stopBtn: 'button[aria-label*="Stop" i]',
        response: 'message-content, .model-response-text, [data-message-author-role="model"]',
        userExclude: 'user-query, .user-query, [class*="user-query"], [data-message-author-role="user"]',
        modelBtn: 'button[data-test-id*="bard-mode-menu-button" i], [data-test-id*="model" i] button, [class*="model-picker"] button, button[aria-label*="Switch model" i], .input-area-switch',
        modelItem: '[role="menuitem"], [role="option"], .mat-mdc-menu-item',
        rateLimitRegex: /you['’]?ve reached your.*limit|quota exceeded|try again later|too many requests|upgrade to gemini advanced/i
    },
    "chatgpt.com": {
        key: "chatgpt",
        name: "ChatGPT",
        input: '#prompt-textarea, div.ProseMirror[contenteditable="true"], [contenteditable="true"][translate="no"], textarea[name="prompt-textarea"], textarea',
        sendBtn: 'button[data-testid="send-button"], button[aria-label*="Send prompt" i], button[aria-label*="Send" i], form button[type="submit"]',
        stopBtn: 'button[data-testid="stop-button"], button[aria-label*="Stop streaming" i], button[aria-label*="Stop" i]',
        response: '[data-message-author-role="assistant"], [data-testid^="conversation-turn-"] [data-message-author-role="assistant"], div.agent-turn, .markdown.prose, [data-message-author-role="assistant"] .markdown',
        userExclude: '[data-message-author-role="user"], .user-turn',
        modelBtn: 'button[data-testid="model-switcher-dropdown-button"], button[aria-label*="Model selector" i], [aria-haspopup="menu"][id*="radix-"]',
        modelItem: '[role="menuitem"], [role="option"], [data-testid*="model-switcher-"]',
        rateLimitRegex: /you['’]?ve reached your.*limit|you['’]?ve hit the.*limit|too many requests|usage cap|responses will use another model until|upgrade to plus/i
    },
    "claude.ai": {
        key: "claude",
        name: "Claude",
        input: 'div.ProseMirror[contenteditable="true"], fieldset div[contenteditable="true"], div[contenteditable="true"][role="textbox"], textarea',
        sendBtn: 'button[aria-label*="Send Message" i], button[aria-label*="Send" i], button[data-testid*="send" i]',
        stopBtn: 'button[aria-label*="Stop" i]',
        response: 'div[data-is-streaming], .font-claude-message, .font-claude-response, [class*="font-claude"], [data-testid="chat-message-content"], .standard-markdown, .progressive-markdown',
        userExclude: '[data-testid="user-message"], .font-user-message, [class*="user-message"]',
        modelBtn: 'button[data-testid*="model-selector" i], button[aria-label*="Model" i]',
        modelItem: '[role="menuitem"], [role="option"]',
        rateLimitRegex: /out of free messages|message limit|reached your.*limit|too many requests|try again at/i
    },
    "chat.deepseek.com": {
        key: "deepseek",
        name: "DeepSeek",
        input: 'textarea#chat-input, textarea, div[contenteditable="true"]',
        sendBtn: 'div[role="button"][aria-disabled="false"], button[type="submit"]',
        stopBtn: 'div[role="button"][aria-label*="Stop" i]',
        response: '.ds-markdown, .markdown-body',
        userExclude: '.user-message, .fa-user',
        modelBtn: '[class*="model-select"], button',
        modelItem: '[role="menuitem"], [role="option"]',
        rateLimitRegex: /server is busy|rate limit|too many requests|try again later/i
    }
};

const currentHost = Object.keys(PROVIDERS).find(host => window.location.hostname.includes(host));
const provider = PROVIDERS[currentHost] || {
    key: "unknown",
    name: window.location.hostname,
    input: 'div[contenteditable="true"], textarea',
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    response: '.markdown, message-content, [data-message-author-role="assistant"]',
    userExclude: '[data-message-author-role="user"]',
    modelBtn: 'button[aria-haspopup="menu"]',
    modelItem: '[role="menuitem"]',
    rateLimitRegex: /rate limit|quota exceeded|too many requests/i
};

let ws = null;
// Zero-click auto-dedicate by default on valid chat pages!
let isTabDedicated = !isNonChatPage;
let retryTimer = null;
let switchedModelsHistory = new Set();

function sendDebugLog(msg) {
    console.log(`[GeminiBridge v${BRIDGE_VERSION}] ${msg}`);
    try {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "log", msg }));
        }
    } catch (e) {}
}

// Listen for background worker wake-up messages
try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.type === "force_connect") {
            isTabDedicated = true;
            if (!ws || ws.readyState !== WebSocket.OPEN || msg.forceSwitch) {
                if (ws) {
                    try { ws.close(); } catch (e) {}
                    ws = null;
                }
                connectBridge();
            }
            sendResponse({ ok: true, provider: provider.key });
        }
        return true;
    });
} catch (e) {}

const oldBtn = document.getElementById('antigravity-bridge-status-btn');
if (oldBtn) {
    try { oldBtn.remove(); } catch (e) {}
}
const statusBtn = document.createElement('div');
statusBtn.id = 'antigravity-bridge-status-btn';
statusBtn.style.cssText = `
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999999;
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid #444;
  background: #1e1e1e;
  color: #fff;
  font-family: system-ui, -apple-system, sans-serif;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,0.45);
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  user-select: none;
`;

const statusLabel = document.createElement('div');
statusLabel.style.cssText = `
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
`;

const watermarkLabel = document.createElement('div');
watermarkLabel.innerText = `Auto-Connect • Shohag Rana Suvo • v${BRIDGE_VERSION}`;
watermarkLabel.style.cssText = `
  font-size: 9.5px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.68);
  letter-spacing: 0.3px;
`;

statusBtn.appendChild(statusLabel);
statusBtn.appendChild(watermarkLabel);
updateUI(isTabDedicated ? 'connecting' : 'standby');
if (document.body) {
    document.body.appendChild(statusBtn);
} else {
    window.addEventListener('DOMContentLoaded', () => document.body.appendChild(statusBtn));
}

function updateUI(state, extra = "") {
    const suffix = extra ? ` — ${extra}` : "";
    if (state === 'standby') {
        statusLabel.innerText = `⚪ Paused (${provider.name}) — Click to Resume`;
        statusBtn.style.background = '#242424';
        statusBtn.style.borderColor = '#555';
    } else if (state === 'connecting') {
        statusLabel.innerText = `🟡 Auto-Connecting (${provider.name})...`;
        statusBtn.style.background = '#4d3800';
        statusBtn.style.borderColor = '#f5b000';
    } else if (state === 'connected') {
        statusLabel.innerText = `🟢 (${provider.name}) Auto-Connected (v${BRIDGE_VERSION})${suffix}`;
        statusBtn.style.background = '#0d3b1e';
        statusBtn.style.borderColor = '#2ea043';
    } else if (state === 'working') {
        statusLabel.innerText = `🔵 (${provider.name}) Processing Task...${suffix}`;
        statusBtn.style.background = '#0a2d4d';
        statusBtn.style.borderColor = '#388bfd';
    }
}

statusBtn.addEventListener('click', () => {
    isTabDedicated = !isTabDedicated;
    if (isTabDedicated) {
        connectBridge();
    } else {
        clearTimeout(retryTimer);
        if (ws) ws.close();
        ws = null;
        updateUI('standby');
    }
});

const UI_CHROME_EXCLUDE = '[contenteditable="true"], fieldset, form, nav, header, footer, [role="menu"], [role="dialog"], [role="listbox"], [role="tooltip"], [data-radix-popper-content-wrapper]';

function getValidResponseNodes() {
    const raw = Array.from(document.querySelectorAll(provider.response));
    return raw.filter(el => {
        if (statusBtn.contains(el)) return false;
        if (el.closest(UI_CHROME_EXCLUDE)) return false;
        if (provider.userExclude && el.closest(provider.userExclude)) return false;
        return true;
    });
}

function cleanResponseText(rawText) {
    if (!rawText) return "";
    let t = rawText.trim();
    t = t.replace(/^(Gemini said|ChatGPT said:?)\s*/i, "").trim();
    if (/^(Gemini said|ChatGPT said|Thinking\.{0,3}|Show thinking|Thought for \d+.*|Reasoning\.{0,3})$/i.test(t)) {
        return "";
    }
    return t;
}

function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function isProviderStreaming() {
    if (!provider.stopBtn) return false;
    const btns = Array.from(document.querySelectorAll(provider.stopBtn));
    return btns.some(b => isElementVisible(b) && !b.disabled);
}

/**
 * Retrieve currently selected model & available models from the page UI
 */
async function getAvailableModelsInfo(openMenu = false) {
    let currentModel = "Default";
    const available = [];

    try {
        const btn = document.querySelector(provider.modelBtn);
        if (btn) {
            currentModel = (btn.innerText || btn.getAttribute('aria-label') || "Default").replace(/\s+/g, " ").trim();
            if (openMenu) {
                btn.click();
                await new Promise(r => setTimeout(r, 350));
                const items = Array.from(document.querySelectorAll(provider.modelItem));
                for (const item of items) {
                    if (!isElementVisible(item)) continue;
                    const txt = (item.innerText || "").replace(/\s+/g, " ").trim();
                    if (txt && txt.length < 80) {
                        available.push({ text: txt, element: item });
                    }
                }
                // Close menu by pressing Escape if we only wanted to inspect
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }
        }
    } catch (e) {}

    return { currentModel, available: available.map(a => a.text) };
}

/**
 * Attempt to switch to another available model in the same provider UI when rate-limited
 */
async function trySwitchModelInUI() {
    try {
        const btn = document.querySelector(provider.modelBtn);
        if (!btn) {
            sendDebugLog(`Model switcher button not found on ${provider.name}`);
            return null;
        }

        const currentLabel = (btn.innerText || "").replace(/\s+/g, " ").trim();
        switchedModelsHistory.add(currentLabel);

        btn.click();
        await new Promise(r => setTimeout(r, 400));

        const items = Array.from(document.querySelectorAll(provider.modelItem)).filter(isElementVisible);
        for (const item of items) {
            const txt = (item.innerText || "").replace(/\s+/g, " ").trim();
            if (!txt) continue;
            // Skip upgrade/plus upsell buttons or disabled options
            if (/upgrade|plus|pro plan|subscribe|more models/i.test(txt)) continue;
            if (item.getAttribute('aria-disabled') === 'true' || item.disabled) continue;

            // Check if this model hasn't been used yet
            const alreadyUsed = Array.from(switchedModelsHistory).some(used => used && txt.includes(used));
            if (!alreadyUsed && txt !== currentLabel) {
                sendDebugLog(`Switching model on ${provider.name} from "${currentLabel}" to "${txt}"`);
                item.click();
                switchedModelsHistory.add(txt);
                await new Promise(r => setTimeout(r, 500));
                return txt;
            }
        }

        // Close menu if no alternative found
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    } catch (e) {
        sendDebugLog(`Error in trySwitchModelInUI: ${e.message}`);
    }
    return null;
}

/**
 * Detect if the page or latest response shows a rate limit / quota exhaustion banner
 */
function detectRateLimit(responseText = "") {
    if (provider.rateLimitRegex && provider.rateLimitRegex.test(responseText)) {
        return true;
    }
    // Check visible alert/toast banners on the page
    const alerts = Array.from(document.querySelectorAll('[role="alert"], .toast, [class*="banner"], [class*="error"], [data-testid*="limit"]'));
    for (const el of alerts) {
        if (!isElementVisible(el)) continue;
        const txt = (el.innerText || "").trim();
        if (provider.rateLimitRegex && provider.rateLimitRegex.test(txt)) {
            return true;
        }
    }
    return false;
}

function connectBridge() {
    if (!isTabDedicated || isNonChatPage) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    updateUI('connecting');
    ws = new WebSocket('ws://localhost:4545');

    ws.onopen = async () => {
        const modelInfo = await getAvailableModelsInfo(false);
        updateUI('connected', modelInfo.currentModel);
        ws.send(JSON.stringify({
            type: "register_tab",
            provider: provider.key,
            providerName: provider.name,
            version: BRIDGE_VERSION,
            url: window.location.href,
            currentModel: modelInfo.currentModel
        }));
        sendDebugLog(`Auto-Connected from ${window.location.href} (v${BRIDGE_VERSION}, model=${modelInfo.currentModel})`);
    };

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'replaced') {
                // Another tab became active; go into standby and DO NOT reconnect automatically in a loop!
                isTabDedicated = false;
                clearTimeout(retryTimer);
                if (ws) {
                    try { ws.close(); } catch (e) {}
                    ws = null;
                }
                updateUI('standby');
                return;
            }

            if (data.type === 'check_session') {
                const existingResponses = getValidResponseNodes().length;
                const modelInfo = await getAvailableModelsInfo(false);
                ws.send(JSON.stringify({
                    isEmptyChat: existingResponses === 0,
                    chatKey: window.location.origin + window.location.pathname,
                    provider: provider.key,
                    providerName: provider.name,
                    currentModel: modelInfo.currentModel,
                    version: BRIDGE_VERSION,
                    existingResponses
                }));
                return;
            }

            if (data.type === 'get_models') {
                const modelInfo = await getAvailableModelsInfo(true);
                ws.send(JSON.stringify({
                    type: 'models_list',
                    provider: provider.key,
                    currentModel: modelInfo.currentModel,
                    available: modelInfo.available
                }));
                return;
            }

            if (data.type === 'prompt') {
                updateUI('working');
                let result = await askWebProvider(data.prompt);

                // If rate limit detected, automatically try switching models in the UI and retry once!
                if (result.rateLimited) {
                    sendDebugLog(`Rate limit detected on ${provider.name}. Attempting automatic model switch...`);
                    const newModel = await trySwitchModelInUI();
                    if (newModel) {
                        updateUI('working', `Switched to ${newModel}`);
                        result = await askWebProvider(data.prompt);
                    }
                }

                ws.send(JSON.stringify({
                    reply: result.reply,
                    rateLimited: Boolean(result.rateLimited),
                    provider: provider.key
                }));
                updateUI('connected');
            }
        } catch (err) {
            sendDebugLog(`Error in onmessage: ${err.message}`);
            try {
                ws.send(JSON.stringify({ reply: `Error in browser extension: ${err.message}` }));
            } catch (e) {}
            updateUI('connected');
        }
    };

    ws.onclose = () => {
        ws = null;
        if (isTabDedicated) {
            updateUI('connecting');
            clearTimeout(retryTimer);
            retryTimer = setTimeout(connectBridge, 2500);
        }
    };

    ws.onerror = () => {
        try { if (ws) ws.close(); } catch (e) {}
    };
}

/**
 * Robust input injection supporting ChatGPT ProseMirror (<p> structure),
 * Quill (Gemini), Claude ProseMirror, and standard textareas
 */
async function fillInputBox(editor, text) {
    editor.focus();
    editor.click();

    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
        const proto = editor.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) {
            setter.call(editor, text);
        } else {
            editor.value = text;
        }
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        return;
    }

    // ContentEditable (ChatGPT #prompt-textarea ProseMirror, Claude, Gemini)
    try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('delete', false, null);
    } catch (e) {}

    // 1. Try simulated ClipboardEvent paste (Works best for ChatGPT & Claude ProseMirror!)
    try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true
        });
        editor.dispatchEvent(pasteEvent);
        await new Promise(r => setTimeout(r, 80));
    } catch (e) {}

    // 2. Verify if text was inserted by paste; if not, use execCommand / paragraph injection
    const currentLen = (editor.innerText || editor.textContent || '').trim().length;
    if (currentLen < Math.min(text.trim().length, 10)) {
        if (text.length <= 1200) {
            document.execCommand('insertText', false, text);
        } else {
            // Fast paragraph injection for ProseMirror/Quill
            const escaped = text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            editor.innerHTML = `<p>${escaped}</p>`;
            editor.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertFromPaste',
                data: text
            }));
        }
    } else {
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
}

async function waitForEditor(maxWaitMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const ed = document.querySelector(provider.input);
        if (ed && isElementVisible(ed)) return ed;
        await new Promise(r => setTimeout(r, 250));
    }
    return document.querySelector(provider.input);
}

async function askWebProvider(text) {
    const editor = await waitForEditor(8000);
    if (!editor) {
        sendDebugLog(`Input box not found with selector: ${provider.input}`);
        return {
            reply: `Error: Input box not found on ${provider.name}. Please ensure you are logged in.`,
            rateLimited: false
        };
    }

    const preElements = getValidResponseNodes();
    const preSet = new Set(preElements);
    const initialCount = preElements.length;
    const promptSnippet = text.slice(0, 60).trim();

    sendDebugLog(`Starting askWebProvider on ${provider.name}: promptLen=${text.length}, initialCount=${initialCount}`);

    let mutatedContainers = new Set();
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            let target = m.target.nodeType === Node.TEXT_NODE ? m.target.parentElement : m.target;
            if (!target || !(target instanceof HTMLElement)) continue;
            if (statusBtn.contains(target)) continue;
            if (editor.contains(target) || target.closest(UI_CHROME_EXCLUDE)) continue;
            if (provider.userExclude && target.closest(provider.userExclude)) continue;

            const block = target.closest(
                'message-content, .model-response-text, [data-is-streaming], .font-claude-message, .font-claude-response, [class*="font-claude"], .standard-markdown, .progressive-markdown, .markdown, [data-message-author-role="assistant"], [data-testid^="conversation-turn-"], .agent-turn, .ds-markdown, .prose'
            );
            if (block && !preSet.has(block) && !block.closest(UI_CHROME_EXCLUDE)) {
                mutatedContainers.add(block);
            }
        }
    });

    await fillInputBox(editor, text);
    await new Promise(r => setTimeout(r, 350));

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    let clicked = false;
    for (let i = 0; i < 12; i++) {
        const sendBtns = Array.from(document.querySelectorAll(provider.sendBtn));
        const sendBtn = sendBtns.find(b => isElementVisible(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true');
        if (sendBtn) {
            const label = sendBtn.getAttribute('aria-label') || sendBtn.getAttribute('data-testid') || sendBtn.tagName;
            sendBtn.click();
            clicked = true;
            sendDebugLog(`Clicked send button (${label}) on attempt ${i + 1}`);
            break;
        }
        await new Promise(r => setTimeout(r, 200));
    }

    if (!clicked) {
        sendDebugLog(`Send button not enabled, submitting via Enter key`);
        editor.focus();
        const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
        const parentForm = editor.closest('form');
        if (parentForm) {
            try { parentForm.requestSubmit(); } catch (e) {}
        }
    }

    return new Promise((resolve) => {
        let lastText = "";
        let stableCount = 0;
        let ticks = 0;
        const maxTicks = 220; // 110 seconds at 500ms intervals

        const checkInterval = setInterval(() => {
            ticks++;
            const responses = getValidResponseNodes();
            let latestResponse = "";

            // Engine 1: Inspect newly created response nodes
            for (let i = responses.length - 1; i >= 0; i--) {
                const el = responses[i];
                if (preSet.has(el)) continue;
                const candidateText = cleanResponseText(el.innerText || el.textContent || "");
                if (!candidateText) continue;
                if (promptSnippet.length > 15 && candidateText.includes(promptSnippet)) continue;
                latestResponse = candidateText;
                break;
            }

            if (!latestResponse) {
                // Engine 3: Emergency query across all conversation turns excluding user
                const turns = Array.from(document.querySelectorAll('article[data-testid^="conversation-turn-"], [data-message-author-role="assistant"]'));
                for (let i = turns.length - 1; i >= 0; i--) {
                    const turn = turns[i];
                    if (preSet.has(turn) || turn.closest(provider.userExclude)) continue;
                    const txt = cleanResponseText(turn.innerText || "");
                    if (txt && (!promptSnippet || !txt.includes(promptSnippet))) {
                        latestResponse = txt;
                        break;
                    }
                }
            }

            const streaming = isProviderStreaming();

            // Check for immediate rate-limit banner even if no response text
            if (ticks >= 4 && detectRateLimit(latestResponse)) {
                clearInterval(checkInterval);
                observer.disconnect();
                sendDebugLog(`Rate limit detected on ${provider.name}!`);
                resolve({
                    reply: `Error: Rate limit reached on ${provider.name}.`,
                    rateLimited: true
                });
                return;
            }

            if (ticks % 4 === 0) {
                sendDebugLog(`Tick ${ticks}: selectorCount=${responses.length} (was ${initialCount}), mutCount=${mutatedContainers.size}, streaming=${streaming}, textLen=${latestResponse.length}, stable=${stableCount}`);
            }

            if (!latestResponse) {
                statusLabel.innerText = `🔵 (${provider.name}) Waiting for reply... (${Math.floor(ticks / 2)}s)`;
                // If not streaming and 50s elapsed, abort
                const waitLimit = streaming ? 160 : 100;
                if (ticks >= waitLimit) {
                    clearInterval(checkInterval);
                    observer.disconnect();
                    sendDebugLog(`Aborted: No response detected within ${waitLimit / 2}s`);
                    resolve({
                        reply: `Error: ${provider.name} did not produce a detectable reply within ${waitLimit / 2} seconds.`,
                        rateLimited: detectRateLimit("")
                    });
                }
                return;
            }

            statusLabel.innerText = `🔵 (${provider.name}) Receiving (${latestResponse.length} chars)...`;

            if (latestResponse === lastText && !streaming) {
                stableCount++;
                // 4 ticks * 500ms = 2.0 seconds of stable text & not streaming
                if (stableCount >= 4) {
                    clearInterval(checkInterval);
                    observer.disconnect();
                    sendDebugLog(`Resolved reply! Length=${latestResponse.length}`);
                    resolve({
                        reply: latestResponse,
                        rateLimited: detectRateLimit(latestResponse)
                    });
                    return;
                }
            } else if (latestResponse === lastText && streaming) {
                // Fallback if stop button stays visible after completion (e.g. 9 ticks = 4.5s unchanged)
                stableCount++;
                if (stableCount >= 9) {
                    clearInterval(checkInterval);
                    observer.disconnect();
                    sendDebugLog(`Resolved reply (stream-idle)! Length=${latestResponse.length}`);
                    resolve({
                        reply: latestResponse,
                        rateLimited: detectRateLimit(latestResponse)
                    });
                    return;
                }
            } else {
                lastText = latestResponse;
                stableCount = 0;
            }

            if (ticks >= maxTicks) {
                clearInterval(checkInterval);
                observer.disconnect();
                sendDebugLog(`Max ticks reached, resolving with text (${latestResponse.length} chars)`);
                resolve({
                    reply: latestResponse || `Error: ${provider.name} timed out after 110 seconds.`,
                    rateLimited: detectRateLimit(latestResponse)
                });
            }
        }, 500);
    });
}

// Auto-connect immediately upon page load!
if (isTabDedicated) {
    connectBridge();
}

})();
