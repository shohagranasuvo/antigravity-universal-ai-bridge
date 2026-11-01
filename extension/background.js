/**
 * Antigravity Universal AI Bridge — Background Service Worker (v2.6.0)
 * Zero-Click Auto-Connect, Tab Launcher & Model/Provider Failover Orchestrator
 * Author: Shohag Rana Suvo (https://github.com/shohagranasuvo)
 */

const BRIDGE_VERSION = "2.6";
const WS_URL = "ws://localhost:4545";

const PROVIDER_URLS = {
    gemini: "https://gemini.google.com/app",
    chatgpt: "https://chatgpt.com/",
    claude: "https://claude.ai/new",
    deepseek: "https://chat.deepseek.com/"
};

const PROVIDER_PATTERNS = [
    { key: "gemini", host: "gemini.google.com", url: PROVIDER_URLS.gemini },
    { key: "chatgpt", host: "chatgpt.com", url: PROVIDER_URLS.chatgpt },
    { key: "claude", host: "claude.ai", url: PROVIDER_URLS.claude },
    { key: "deepseek", host: "chat.deepseek.com", url: PROVIDER_URLS.deepseek }
];

let controlSocket = null;
let reconnectTimer = null;

function logBg(msg) {
    console.log(`[BridgeBG v${BRIDGE_VERSION}] ${msg}`);
    try {
        if (controlSocket && controlSocket.readyState === WebSocket.OPEN) {
            controlSocket.send(JSON.stringify({ type: "bg_log", msg }));
        }
    } catch (e) {}
}

function getHostname(urlStr) {
    try {
        return new URL(urlStr).hostname.toLowerCase();
    } catch (e) {
        return "";
    }
}

function connectControlSocket() {
    if (controlSocket && (controlSocket.readyState === WebSocket.OPEN || controlSocket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    try {
        controlSocket = new WebSocket(WS_URL);

        controlSocket.onopen = () => {
            logBg("Background Service Worker connected to bridge.mjs");
            controlSocket.send(JSON.stringify({
                type: "register_bg",
                version: BRIDGE_VERSION
            }));
            // Immediately scan and wake up any existing AI tab so it auto-connects
            ensureActiveTab({ preferredProvider: null, excludeProviders: [], openIfMissing: false });
        };

        controlSocket.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "ensure_tab") {
                    await ensureActiveTab({
                        preferredProvider: data.preferredProvider || null,
                        excludeProviders: data.excludeProviders || [],
                        openIfMissing: true
                    });
                } else if (data.type === "switch_provider") {
                    await ensureActiveTab({
                        preferredProvider: data.targetProvider || null,
                        excludeProviders: data.excludeProviders || [],
                        openIfMissing: true,
                        forceSwitch: true
                    });
                }
            } catch (e) {
                logBg("Error handling bg message: " + e.message);
            }
        };

        controlSocket.onclose = () => {
            controlSocket = null;
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connectControlSocket, 3000);
        };

        controlSocket.onerror = () => {
            try {
                if (controlSocket) controlSocket.close();
            } catch (e) {}
        };
    } catch (e) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectControlSocket, 3000);
    }
}

async function ensureActiveTab({ preferredProvider = null, excludeProviders = [], openIfMissing = true, forceSwitch = false }) {
    try {
        const excludedSet = new Set((excludeProviders || []).map(p => p.toLowerCase()));
        const allTabs = await chrome.tabs.query({});

        // Strictly check actual hostname so ?utm_source=chatgpt.com on github.com is NEVER matched!
        const matchingTabs = [];
        for (const tab of allTabs) {
            const url = tab.url || "";
            const hostname = getHostname(url);
            if (!hostname) continue;

            for (const p of PROVIDER_PATTERNS) {
                if ((hostname === p.host || hostname.endsWith("." + p.host)) && !excludedSet.has(p.key)) {
                    // Skip non-chat pages on Gemini like /usage or /extensions
                    if (p.key === "gemini" && /\/(usage|extensions|updates|saved-info|gems)/i.test(url)) {
                        continue;
                    }
                    matchingTabs.push({ tab, providerKey: p.key });
                }
            }
        }

        // Prioritize preferredProvider if specified, else active tab, else Gemini -> ChatGPT -> Claude -> DeepSeek
        if (preferredProvider && !excludedSet.has(preferredProvider)) {
            matchingTabs.sort((a, b) => (a.providerKey === preferredProvider ? -1 : b.providerKey === preferredProvider ? 1 : 0));
        } else {
            matchingTabs.sort((a, b) => (b.tab.active ? 1 : 0) - (a.tab.active ? 1 : 0));
        }

        if (matchingTabs.length > 0) {
            const chosen = matchingTabs[0];
            logBg(`Waking existing ${chosen.providerKey} tab (id=${chosen.tab.id}, url=${chosen.tab.url})`);
            try {
                await chrome.tabs.sendMessage(chosen.tab.id, {
                    type: "force_connect",
                    forceSwitch
                });
                return;
            } catch (err) {
                logBg(`Injecting v2.6 content.js into tab ${chosen.tab.id} (${chosen.providerKey})...`);
                try {
                    if (chrome.scripting) {
                        await chrome.scripting.executeScript({
                            target: { tabId: chosen.tab.id },
                            files: ["content.js"]
                        });
                        return;
                    }
                } catch (injectErr) {
                    logBg(`executeScript fallback to reload: ${injectErr.message}`);
                }
                await chrome.tabs.reload(chosen.tab.id);
                return;
            }
        }

        if (!openIfMissing) return;

        // Choose which provider URL to open automatically
        const order = ["gemini", "chatgpt", "claude", "deepseek"];
        let targetKey = preferredProvider && !excludedSet.has(preferredProvider) ? preferredProvider : null;
        if (!targetKey) {
            targetKey = order.find(k => !excludedSet.has(k)) || "gemini";
        }

        const targetUrl = PROVIDER_URLS[targetKey] || PROVIDER_URLS.gemini;
        logBg(`No open AI tab found for [${targetKey}]. Auto-creating tab: ${targetUrl}`);
        await chrome.tabs.create({ url: targetUrl, active: true });
    } catch (e) {
        logBg(`ensureActiveTab error: ${e.message}`);
    }
}

// Keep service worker alive with periodic alarm
chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepAlive") {
        connectControlSocket();
    }
});

chrome.runtime.onInstalled.addListener(() => {
    connectControlSocket();
});

chrome.runtime.onStartup.addListener(() => {
    connectControlSocket();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
        const hostname = getHostname(tab.url);
        for (const p of PROVIDER_PATTERNS) {
            if (hostname === p.host || hostname.endsWith("." + p.host)) {
                connectControlSocket();
                break;
            }
        }
    }
});

connectControlSocket();
