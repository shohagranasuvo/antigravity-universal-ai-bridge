# 🚀 Antigravity Universal Web AI Bridge (v2.4.0)

[![Version](https://img.shields.io/badge/version-2.4.0-brightgreen.svg)](https://github.com/shohagranasuvo/antigravity-universal-ai-bridge/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Maintained By](https://img.shields.io/badge/Fixed%20%26%20Enhanced%20By-Shohag%20Rana%20Suvo-orange)](https://github.com/shohagranasuvo)

**Use your existing Web AI accounts (Gemini Web, Claude.ai, ChatGPT, DeepSeek) directly inside Google Antigravity IDE & CLI (`agy`) when your built-in Antigravity quota runs out!**

---

## ✨ Author & Credits

* **Fixed, Enhanced & Maintained by:** **[Shohag Rana Suvo](https://github.com/shohagranasuvo)**
* **Original Concept & Repository Credit:** **[Eyad (Trignod.ai)](https://github.com/Eyad-Eladawy/antigravity-universal-ai-bridge)** — Huge thanks to Eyad for creating the original `antigravity-universal-ai-bridge` architecture!

---

## 🛠️ What Was Fixed in v2.4.0 (By Shohag Rana Suvo)

In the original repository (`v2.1.0`), prompts were sent to the browser quickly and the web AI replied on screen, **but Antigravity hung forever and failed to retrieve the response**.

Version **2.4.0** resolves all of these critical issues:

1. **Fixed Infinite Streaming Lock on Gemini Web (`stopBtn` Bug)**:
   * *Problem*: Gemini Web keeps the `button[aria-label*="Stop"]` element hidden in the DOM (`display: none`) after generation finishes. The original script checked `document.querySelector(provider.stopBtn) !== null`, which stayed `true` forever and blocked response retrieval.
   * *Fix*: Removed the broken DOM-existence lock and implemented strict new-element tracking with text-stability detection (resolves cleanly 2.5s after token streaming finishes) while stripping Gemini's `"Gemini said"` / `"Thinking..."` accessibility placeholders.
2. **Dual-Engine Response Extractor (CSS Selectors + Live DOM `MutationObserver`)**:
   * *Problem*: Frequent CSS class updates on **Claude.ai** (`.font-claude-message`) and **Gemini Web** caused `querySelectorAll` to match `0` elements (`isEmptyChat: true`).
   * *Fix*: Updated selectors for modern 2026 Claude (`div[data-is-streaming]`, `[class*="font-claude"]`, `.standard-markdown`, `.progressive-markdown`) and Gemini (`message-content`, `.model-response-text`), backed by a live `MutationObserver` fallback that captures streamed assistant text even if site class names change.
3. **Fixed Claude.ai `+` Menu Collision on Send**:
   * *Problem*: Broad button selectors matched the left-hand `+` (Add files/tools) button before the right-hand `Send` button in DOM order, opening the attachment popup instead of submitting the prompt.
   * *Fix*: Scoped `sendBtn` strictly to `Send` actions (`button[aria-label*="Send" i]`, `button[data-testid*="send" i]`) and excluded all Radix UI popovers/menus (`[role="menu"]`, `[data-radix-popper-content-wrapper]`).
4. **Fixed 840 KB Home Directory Context Dump (`autoDiscoverProjectContext`)**:
   * *Problem*: Running Antigravity from the user's home directory (`~`) caused `bridge.mjs` to recursively scan `~/.gemini` (540+ internal IDE/CLI logs and schemas, ~840 KB) and paste it into the browser chat box.
   * *Fix*: Added `os.homedir()` protection, excluded internal Antigravity/MCP directories, and capped auto-discovered context at 12 KB.
5. **Instant Large-Prompt Injection**:
   * *Problem*: `document.execCommand('insertText')` took 28+ seconds to type multi-file prompts into Quill/ProseMirror editors.
   * *Fix*: Added a fast-path DOM injection for prompts `> 1,000` characters (completes in `< 10ms`).
6. **Automatic Stale-Tab Detection & Disconnection**:
   * Automatically verifies the extension script version (`v2.4`) on handshake and disconnects stale cached tabs immediately with clear instructions.

---

## 📦 Installation (3 Simple Steps)

### Step 1: Get the Package
Download **`gemini-bridge-v2.4.0.zip`** from the **[Latest Release](https://github.com/shohagranasuvo/antigravity-universal-ai-bridge/releases)** and extract it to a permanent folder:
* **Linux / macOS**: e.g., `/home/your-user/gemini-bridge`
* **Windows**: e.g., `D:/gemini-bridge`

*(The release zip includes `node_modules` pre-bundled, or you can run `npm install` if cloning from source).*

---

### Step 2: Load the Browser Extension (Chrome / Brave / Edge)
1. Open your Chromium browser and go to:
   * Chrome: `chrome://extensions`
   * Brave: `brave://extensions`
   * Edge: `edge://extensions`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** (top-left) and select the **`extension`** folder inside `gemini-bridge`:
   ```text
   gemini-bridge/extension
   ```
4. Ensure **"Antigravity Universal AI Bridge — Fixed by Shohag Rana Suvo"** is enabled.

---

### Step 3: Link the MCP Server in Antigravity

#### Option A: Via Antigravity IDE (`mcp_config.json`)
Open **Manage MCPs → View raw config (`mcp_config.json`)** and add:

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
*(Tip for Linux NVM users: use your full Node path from `which node`, e.g. `/home/user/.nvm/versions/node/v24.22.2/bin/node`).*

#### Option B: Via Antigravity CLI (`agy`)
Run in your terminal:
```bash
agy mcp add gemini-web-pro "$(which node)" "/absolute/path/to/gemini-bridge/extension/bridge.mjs"
```

---

## 🎯 How to Use

1. Open any supported Web AI in your browser:
   * **Gemini Web**: [https://gemini.google.com](https://gemini.google.com)
   * **Claude**: [https://claude.ai](https://claude.ai)
   * **ChatGPT**: [https://chatgpt.com](https://chatgpt.com)
   * **DeepSeek**: [https://chat.deepseek.com](https://chat.deepseek.com)
2. Look at the floating pill button at the top center of the page:
   > **⚪ Click to dedicate (Gemini) to Antigravity**
   > *By Shohag Rana Suvo • Credit: Trignod.ai (v2.4)*
3. Click the floating button so it turns **Green**:
   > **🟢 (Gemini) Connected to Antigravity (v2.4)**
4. In **Antigravity IDE or CLI**, simply ask your agent to perform any task or consult the web bridge:
   * *"Use gemini-web-pro to implement feature X"*
   * *"Consult the web bridge to debug this file"*

---

## 🔒 Security & Privacy Notes
* **Zero Cookie or Token Access**: The extension does **not** request `cookies` or storage permissions. It never reads your session tokens or passwords.
* **100% Local Transport**: Communication happens strictly between your browser tab and local MCP process over `ws://localhost:4545`. No external servers are contacted.

---

## 📄 License
Licensed under the **GPL-3.0-or-later** License.
* Original work Copyright © **Eyad (Trignod.ai)** — [Eyad-Eladawy/antigravity-universal-ai-bridge](https://github.com/Eyad-Eladawy/antigravity-universal-ai-bridge)
* v2.4.0 Bug Fixes & Enhancements Copyright © **Shohag Rana Suvo** — [github.com/shohagranasuvo](https://github.com/shohagranasuvo)
