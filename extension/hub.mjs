/**
 * Antigravity Universal AI Bridge — Hub Daemon (v2.7.0)
 * Central Hub process that owns the WebSocket server (Port 4545) and HTTP IPC (Port 4546)
 * Supports multiple concurrent MCP clients (Antigravity IDE, Claude CLI, Cursor)
 * Author: Shohag Rana Suvo (https://github.com/shohagranasuvo)
 */

import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { WebSocketServer } from "ws";
import { exec } from "child_process";

const LOG_FILE = path.join(os.tmpdir(), "gemini-bridge.log");
const WS_PORT = 4545;
const HTTP_PORT = 4546;

function logToFile(msg) {
    try {
        const ts = new Date().toISOString();
        fs.appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`, "utf8");
    } catch (e) {}
}

logToFile(`=== Universal AI Bridge Hub starting (PID ${process.pid}) ===`);

const PROVIDER_URLS = {
    gemini: "https://gemini.google.com/app",
    chatgpt: "https://chatgpt.com/",
    claude: "https://claude.ai/new",
    deepseek: "https://chat.deepseek.com/"
};

const wss = new WebSocketServer({ port: WS_PORT });
let browserSocket = null;
let bgSocket = null;
let tabWaiters = [];
let pendingPromptResolve = null;

let sessionState = {
    initializedProjects: new Set(),
    sentFileHashes: new Map(),
    lastChatKey: null,
    activeProvider: null,
    activeModel: null,
    isProcessingPrompt: false
};

function resetSessionMemory() {
    sessionState.initializedProjects.clear();
    sessionState.sentFileHashes.clear();
}

function notifyTabWaiters(ws) {
    while (tabWaiters.length > 0) {
        const waiter = tabWaiters.shift();
        try { waiter(ws); } catch (e) {}
    }
}

wss.on("connection", (ws) => {
    ws.isBgWorker = false;

    ws.on("message", (data) => {
        try {
            const parsed = JSON.parse(data.toString());

            if (parsed.type === "register_bg") {
                ws.isBgWorker = true;
                bgSocket = ws;
                logToFile(`[HUB] Background worker connected (v${parsed.version})`);
                return;
            }

            if (parsed.type === "bg_log") {
                logToFile(`[BG] ${parsed.msg}`);
                return;
            }

            if (parsed.type === "log") {
                logToFile(`[BROWSER] ${parsed.msg}`);
                return;
            }

            if (parsed.type === "register_tab") {
                ws.isTab = true;
                ws.provider = parsed.provider || "unknown";
                ws.providerName = parsed.providerName || "Web AI";
                ws.currentModel = parsed.currentModel || "Default";
                logToFile(`[HUB] Tab auto-registered: ${ws.providerName} (${parsed.url}) model=${ws.currentModel}`);

                if (browserSocket && browserSocket !== ws && browserSocket.readyState === 1) {
                    if (sessionState.isProcessingPrompt) {
                        logToFile(`[HUB] Ignoring incoming connection from ${ws.providerName} because ${sessionState.activeProvider} is busy.`);
                        return;
                    }
                    try {
                        browserSocket.send(JSON.stringify({ type: "replaced" }));
                        browserSocket.close();
                    } catch (e) {}
                }
                browserSocket = ws;
                sessionState.activeProvider = ws.provider;
                sessionState.activeModel = ws.currentModel;
                resetSessionMemory();
                notifyTabWaiters(ws);
                return;
            }

            if (parsed.reply !== undefined && pendingPromptResolve) {
                logToFile(`[HUB] Received reply from browser (${parsed.reply.length} chars, rateLimited=${parsed.rateLimited})`);
                const resolve = pendingPromptResolve;
                pendingPromptResolve = null;
                sessionState.isProcessingPrompt = false;
                resolve({
                    reply: parsed.reply,
                    rateLimited: Boolean(parsed.rateLimited),
                    provider: parsed.provider || sessionState.activeProvider
                });
                return;
            }
        } catch (e) {}
    });

    ws.on("close", () => {
        if (ws === bgSocket) {
            logToFile("[HUB] Background worker disconnected.");
            bgSocket = null;
        }
        if (ws === browserSocket) {
            logToFile("[HUB] Active browser tab disconnected.");
            browserSocket = null;
            if (pendingPromptResolve) {
                const resolve = pendingPromptResolve;
                pendingPromptResolve = null;
                sessionState.isProcessingPrompt = false;
                resolve({
                    reply: "Error: Browser tab disconnected while generating response.",
                    rateLimited: false,
                    disconnected: true
                });
            }
        }
    });
});

function openUrlInOSBrowser(url) {
    logToFile(`[HUB] Launching URL via OS fallback: ${url}`);
    const platform = process.platform;
    let cmd = `xdg-open "${url}"`;
    if (platform === "win32") cmd = `start "" "${url}"`;
    else if (platform === "darwin") cmd = `open "${url}"`;
    exec(cmd, (err) => {
        if (err) logToFile(`[HUB] OS browser launch error: ${err.message}`);
    });
}

async function ensureConnectedTab({ preferredProvider = null, excludeProviders = [], forceSwitch = false, timeoutMs = 35000 } = {}) {
    if (!forceSwitch && browserSocket && browserSocket.readyState === 1) {
        if (!excludeProviders.includes(browserSocket.provider)) {
            return browserSocket;
        }
    }

    logToFile(`[HUB] Requesting auto-connect tab (preferred=${preferredProvider}, exclude=${excludeProviders.join(",")})`);

    const waitPromise = new Promise((resolve) => {
        const timer = setTimeout(() => {
            const idx = tabWaiters.indexOf(onReady);
            if (idx !== -1) tabWaiters.splice(idx, 1);
            resolve(browserSocket && browserSocket.readyState === 1 ? browserSocket : null);
        }, timeoutMs);

        function onReady(ws) {
            clearTimeout(timer);
            resolve(ws);
        }

        tabWaiters.push(onReady);
    });

    if (bgSocket && bgSocket.readyState === 1) {
        bgSocket.send(JSON.stringify({
            type: forceSwitch ? "switch_provider" : "ensure_tab",
            preferredProvider,
            targetProvider: preferredProvider,
            excludeProviders
        }));
    } else {
        const order = ["gemini", "chatgpt", "claude", "deepseek"];
        const chosen = preferredProvider || order.find(k => !excludeProviders.includes(k)) || "gemini";
        openUrlInOSBrowser(PROVIDER_URLS[chosen] || PROVIDER_URLS.gemini);
    }

    return await waitPromise;
}

async function executePrompt(promptBundle) {
    if (!browserSocket || browserSocket.readyState !== 1) {
        return { reply: "Error: No browser tab connected to execute prompt.", rateLimited: false, disconnected: true };
    }

    sessionState.isProcessingPrompt = true;

    return await new Promise((resolve) => {
        const timeoutTimer = setTimeout(() => {
            sessionState.isProcessingPrompt = false;
            pendingPromptResolve = null;
            logToFile("[HUB] Timed out after 115s waiting for browser reply.");
            resolve({ reply: "Error: Timed out after 115s waiting for browser reply.", rateLimited: false });
        }, 115000);

        pendingPromptResolve = (res) => {
            clearTimeout(timeoutTimer);
            resolve(res);
        };

        browserSocket.send(JSON.stringify({ type: "prompt", prompt: promptBundle }));
    });
}

const httpServer = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && req.url === "/status") {
        res.writeHead(200);
        res.end(JSON.stringify({
            status: browserSocket && browserSocket.readyState === 1 ? "connected" : "idle",
            provider: sessionState.activeProvider,
            model: sessionState.activeModel,
            pid: process.pid
        }));
        return;
    }

    if (req.method === "POST" && req.url === "/execute") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const payload = JSON.parse(body);
                const excludedProviders = payload.excludedProviders || [];
                let activeWs = await ensureConnectedTab({
                    preferredProvider: payload.preferredProvider || null,
                    excludeProviders: excludedProviders,
                    timeoutMs: 35000
                });

                if (!activeWs || activeWs.readyState !== 1) {
                    res.writeHead(500);
                    res.end(JSON.stringify({
                        reply: "Error: Could not auto-connect to a browser tab within 35s. Please ensure Chrome/Brave is open with the extension loaded."
                    }));
                    return;
                }

                let result = await executePrompt(payload.bundle);

                if (result.rateLimited || result.disconnected) {
                    const failedProvider = result.provider || sessionState.activeProvider || "unknown";
                    excludedProviders.push(failedProvider);
                    logToFile(`[HUB] Failover triggered on ${failedProvider}. Switching provider...`);

                    resetSessionMemory();
                    activeWs = await ensureConnectedTab({
                        excludeProviders: excludedProviders,
                        forceSwitch: true,
                        timeoutMs: 35000
                    });

                    if (activeWs && activeWs.readyState === 1) {
                        result = await executePrompt(payload.bundle);
                    }
                }

                res.writeHead(200);
                res.end(JSON.stringify(result));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ reply: `Error in hub: ${err.message}` }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
});

httpServer.listen(HTTP_PORT, "127.0.0.1", () => {
    logToFile(`[HUB] HTTP IPC listening on http://127.0.0.1:${HTTP_PORT}`);
});
