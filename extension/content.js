const BRIDGE_VERSION = "2.4";

const PROVIDERS = {
    "gemini.google.com": {
        name: "Gemini",
        input: 'div.ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"], rich-textarea div[contenteditable="true"], textarea',
        sendBtn: 'button.send-button, button[aria-label*="Send" i]',
        response: 'message-content, .model-response-text',
        userExclude: 'user-query, .user-query, [class*="user-query"], [data-message-author-role="user"]'
    },
    "claude.ai": {
        name: "Claude",
        input: 'div.ProseMirror[contenteditable="true"], fieldset div[contenteditable="true"], div[contenteditable="true"][role="textbox"], textarea',
        sendBtn: 'button[aria-label*="Send" i], button[data-testid*="send" i]',
        response: 'div[data-is-streaming], .font-claude-message, .font-claude-response, [class*="font-claude"], [data-testid="chat-message-content"], .standard-markdown, .progressive-markdown',
        userExclude: '[data-testid="user-message"], .font-user-message, [class*="user-message"]'
    },
    "chatgpt.com": {
        name: "ChatGPT",
        input: '#prompt-textarea, div[contenteditable="true"]#prompt-textarea, [contenteditable="true"][role="textbox"], div[contenteditable="true"], textarea',
        sendBtn: 'button[data-testid="send-button"], button[aria-label*="Send" i], button[aria-label*="Submit" i]',
        response: 'div[data-message-author-role="assistant"], [data-message-author-role="assistant"], article [data-message-author-role="assistant"]',
        userExclude: '[data-message-author-role="user"]'
    },
    "chat.deepseek.com": {
        name: "DeepSeek",
        input: 'textarea#chat-input, textarea',
        sendBtn: 'div[role="button"][aria-disabled="false"], button[type="submit"]',
        response: '.ds-markdown',
        userExclude: '.user-message'
    }
};

const currentHost = Object.keys(PROVIDERS).find(host => window.location.hostname.includes(host));
const provider = PROVIDERS[currentHost] || {
    name: window.location.hostname,
    input: 'div[contenteditable="true"], textarea',
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    response: '.markdown, message-content',
    userExclude: '[data-message-author-role="user"]'
};

let ws = null;
let isTabDedicated = false;
let retryTimer = null;

function sendDebugLog(msg) {
    console.log(`[GeminiBridge v${BRIDGE_VERSION}] ${msg}`);
    try {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "log", msg }));
        }
    } catch (e) {}
}

const statusBtn = document.createElement('div');
statusBtn.id = 'antigravity-bridge-status-btn';
statusBtn.style.cssText = `
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999999;
  padding: 7px 18px;
  border-radius: 22px;
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
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.2px;
`;

const watermarkLabel = document.createElement('div');
watermarkLabel.innerText = `By Shohag Rana Suvo • Credit: Trignod.ai (v${BRIDGE_VERSION})`;
watermarkLabel.style.cssText = `
  font-size: 10px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.65);
  letter-spacing: 0.4px;
`;

statusBtn.appendChild(statusLabel);
statusBtn.appendChild(watermarkLabel);
updateUI('standby');
document.body.appendChild(statusBtn);

function updateUI(state) {
    if (state === 'standby') {
        statusLabel.innerText = `⚪ Click to dedicate (${provider.name}) to Antigravity`;
        statusBtn.style.background = '#242424';
        statusBtn.style.borderColor = '#555';
    } else if (state === 'connecting') {
        statusLabel.innerText = `🟡 Connecting (${provider.name}) to Antigravity MCP...`;
        statusBtn.style.background = '#4d3800';
        statusBtn.style.borderColor = '#f5b000';
    } else if (state === 'connected') {
        statusLabel.innerText = `🟢 (${provider.name}) Connected to Antigravity (v${BRIDGE_VERSION})`;
        statusBtn.style.background = '#0d3b1e';
        statusBtn.style.borderColor = '#2ea043';
    } else if (state === 'working') {
        statusLabel.innerText = `🔵 (${provider.name}) Processing Antigravity Task...`;
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
    // Strip accessibility header on Gemini
    t = t.replace(/^Gemini said\s*/i, "").trim();
    if (/^( Gemini said|Thinking\.{0,3}|Show thinking)$/i.test(t)) {
        return "";
    }
    return t;
}

function connectBridge() {
    if (!isTabDedicated) return;
    updateUI('connecting');

    ws = new WebSocket('ws://localhost:4545');

    ws.onopen = () => {
        updateUI('connected');
        sendDebugLog(`Connected from ${window.location.href} (v${BRIDGE_VERSION})`);
    };

    ws.onmessage = async(event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'replaced') {
                isTabDedicated = false;
                clearTimeout(retryTimer);
                updateUI('standby');
                return;
            }

            if (data.type === 'check_session') {
                const existingResponses = getValidResponseNodes().length;
                ws.send(JSON.stringify({
                    isEmptyChat: existingResponses === 0,
                    chatKey: window.location.origin + window.location.pathname,
                    version: BRIDGE_VERSION,
                    existingResponses
                }));
                return;
            }

            updateUI('working');
            const reply = await askWebProvider(data.prompt);
            ws.send(JSON.stringify({ reply }));
            updateUI('connected');
        } catch (err) {
            sendDebugLog(`Error in onmessage: ${err.message}`);
            try {
                ws.send(JSON.stringify({ reply: `Error in browser extension: ${err.message}` }));
            } catch (e) {}
            updateUI('connected');
        }
    };

    ws.onclose = () => {
        if (isTabDedicated) {
            updateUI('connecting');
            retryTimer = setTimeout(connectBridge, 3000);
        }
    };

    ws.onerror = () => {
        if (ws) ws.close();
    };
}

function fillInputBox(editor, text) {
    editor.focus();

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
    } else {
        // Fast path for large prompts (>1000 chars) so Quill/ProseMirror doesn't freeze for 25s
        if (text.length > 1000) {
            editor.textContent = text;
            editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
            return;
        }
        document.execCommand('selectAll', false, null);
        const inserted = document.execCommand('insertText', false, text);
        if (!inserted || (editor.innerText || '').trim().length === 0) {
            editor.textContent = text;
            editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
        }
    }
}

async function askWebProvider(text) {
    const editor = document.querySelector(provider.input);
    if (!editor) {
        sendDebugLog(`Input box not found with selector: ${provider.input}`);
        return `Error: Input box not found on ${provider.name}. Please open a fresh chat session.`;
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

            const block = target.closest('message-content, .model-response-text, [data-is-streaming], .font-claude-message, .font-claude-response, [class*="font-claude"], .standard-markdown, .progressive-markdown, .markdown, [data-message-author-role="assistant"], .prose');
            if (block && !preSet.has(block) && !block.closest(UI_CHROME_EXCLUDE)) {
                mutatedContainers.add(block);
            }
        }
    });

    fillInputBox(editor, text);
    await new Promise(r => setTimeout(r, 500));

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    let clicked = false;
    for (let i = 0; i < 8; i++) {
        const sendBtn = document.querySelector(provider.sendBtn);
        if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
            const label = sendBtn.getAttribute('aria-label') || sendBtn.getAttribute('data-testid') || sendBtn.tagName;
            sendBtn.click();
            clicked = true;
            sendDebugLog(`Clicked send button (${label}) on attempt ${i + 1}`);
            break;
        }
        await new Promise(r => setTimeout(r, 200));
    }

    if (!clicked) {
        sendDebugLog(`Send button not found/enabled, dispatching Enter key on editor`);
        editor.focus();
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
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

            // Engine 1: Strictly inspect ONLY newly created response nodes (not in preSet)
            for (let i = responses.length - 1; i >= 0; i--) {
                const el = responses[i];
                if (preSet.has(el)) continue;
                const candidateText = cleanResponseText(el.innerText || el.textContent || "");
                if (!candidateText) continue;
                if (promptSnippet.length > 15 && candidateText.includes(promptSnippet)) continue;
                latestResponse = candidateText;
                break;
            }

            // Engine 2: Fallback to MutationObserver containers
            if (!latestResponse && mutatedContainers.size > 0) {
                const arr = Array.from(mutatedContainers);
                for (let i = arr.length - 1; i >= 0; i--) {
                    const el = arr[i];
                    if (!document.body.contains(el) || preSet.has(el)) continue;
                    if (el.closest(UI_CHROME_EXCLUDE)) continue;
                    const candidateText = cleanResponseText(el.innerText || el.textContent || "");
                    if (!candidateText) continue;
                    if (promptSnippet.length > 15 && candidateText.includes(promptSnippet)) continue;
                    latestResponse = candidateText;
                    break;
                }
            }

            if (ticks % 4 === 0) {
                sendDebugLog(`Tick ${ticks}: selectorCount=${responses.length} (was ${initialCount}), mutCount=${mutatedContainers.size}, textLen=${latestResponse.length}, stable=${stableCount}`);
            }

            if (!latestResponse) {
                statusLabel.innerText = `🔵 (${provider.name}) Waiting for reply... (${Math.floor(ticks / 2)}s)`;
                if (ticks >= 90) { // 45s wait for thinking models
                    clearInterval(checkInterval);
                    observer.disconnect();
                    sendDebugLog(`Aborted: No response detected within 45s`);
                    resolve(`Error: ${provider.name} did not produce a detectable reply within 45 seconds.`);
                }
                return;
            }

            statusLabel.innerText = `🔵 (${provider.name}) Receiving (${latestResponse.length} chars)...`;

            if (latestResponse === lastText) {
                stableCount++;
                // 5 ticks * 500ms = 2.5 seconds of stable text
                if (stableCount >= 5) {
                    clearInterval(checkInterval);
                    observer.disconnect();
                    sendDebugLog(`Resolved reply! Length=${latestResponse.length}`);
                    resolve(latestResponse);
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
                resolve(latestResponse || `Error: ${provider.name} timed out after 110 seconds.`);
            }
        }, 500);
    });
}
