# 🚀 Antigravity Universal Web AI Bridge (v2.6.0 — Zero-Click Auto-Connect & Failover Edition)

[![Version](https://img.shields.io/badge/version-2.6.0-brightgreen.svg)](https://github.com/shohagranasuvo/antigravity-universal-ai-bridge/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Maintained By](https://img.shields.io/badge/Fixed%20%26%20Enhanced%20By-Shohag%20Rana%20Suvo-orange)](https://github.com/shohagranasuvo)

**Use your existing Web AI accounts (Gemini Web, ChatGPT, Claude.ai, DeepSeek) directly inside Google Antigravity IDE & CLI (`agy`) with ZERO manual tab clicking, automatic browser tab launching, and automatic rate-limit model/provider switching!**

---

## ✨ Author & Credits

* **Fixed, Enhanced & Maintained by:** **[Shohag Rana Suvo](https://github.com/shohagranasuvo)**
* **Original Concept & Repository Credit:** **[Eyad (Trignod.ai)](https://github.com/Eyad-Eladawy/antigravity-universal-ai-bridge)**

---

## 🔥 What's New in v2.6.0 (Zero-Intervention Automation)

1. **Zero-Click Auto-Connect (`isTabDedicated = true`)**:
   * Simply load the extension once—no need to manually click the floating pill button on every page load! Any open chat tab automatically connects to Antigravity MCP immediately.
2. **Automatic Browser Tab Launcher (`background.js` + OS Fallback)**:
   * When Antigravity calls `consult_gemini_web_pro`, if you don't even have a chat tab open in your browser, the Background Service Worker (or OS fallback) **automatically opens and connects a tab for you** (`Gemini` → `ChatGPT` → `Claude` → `DeepSeek`).
3. **ChatGPT ProseMirror & Streaming Fix**:
   * Fixed ChatGPT's modern `#prompt-textarea` ProseMirror editor input injection using simulated `ClipboardEvent` paste + paragraph fallback so the Send button reliably enables and triggers.
   * Added leaf-node filtering and `stop-button` streaming detection so ChatGPT responses never time out prematurely at 45s.
4. **Automatic Model & Provider Failover on Rate Limits**:
   * Detects quota/rate-limit banners across Gemini, ChatGPT, Claude, and DeepSeek.
   * **Step 1 (In-Tab Model Switch)**: Automatically opens the model picker dropdown in the UI, retrieves available models, switches to an unused available model, and retries the prompt.
   * **Step 2 (Cross-Provider Failover)**: If all models on the current provider are rate-limited, `bridge.mjs` automatically switches to or opens the next available AI provider tab.
5. **Token-Efficient Architecture**:
   * Compact prompt headers (`CONTEXT` / `DELTA` / `FILES` / `TASK`), MD5 file-hash deduplication, ultra-concise output instructions, and direct IDE handling for simple syntax questions.

---

## 📦 Installation (Load Once & Forget!)

### Step 1: Load the Browser Extension (Chrome / Brave / Edge)
1. Open `chrome://extensions` (or `brave://extensions`).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the **`extension`** folder:
   ```text
   gemini-bridge/extension
   ```

### Step 2: Link the MCP Server in Antigravity (`mcp_config.json`)
```json
{
  "mcpServers": {
    "gemini-web-pro": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-bridge/extension/bridge.mjs"]
    }
  }
}
```

### Step 3: Done!
Just type your coding task in Antigravity IDE or CLI. The bridge will automatically find an open AI tab (or launch one for you), connect, execute the prompt, switch models if rate-limited, and apply the code!

---

## 📄 License
Licensed under the **GPL-3.0-or-later** License.
* Copyright © **Shohag Rana Suvo** — [github.com/shohagranasuvo](https://github.com/shohagranasuvo)
* Original work Copyright © **Eyad (Trignod.ai)** — [Eyad-Eladawy/antigravity-universal-ai-bridge](https://github.com/Eyad-Eladawy/antigravity-universal-ai-bridge)
