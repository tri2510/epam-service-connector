# AOS Cloud Deployment Plugin

Web UI for building and deploying AOS (Autonomous Operating System) C++ applications to edge devices.

Runs in two modes:
- **Plugin mode** — embedded inside the [digital.auto](https://digitalauto.tech) platform
- **Standalone mode** — runs independently in any browser for local testing

---

## Quick Start (Standalone)

```bash
# 1. Install dependencies
npm install

# 2. Build and open in browser
npm run standalone
# then open standalone.html in your browser

# Or use the dev server (auto-rebuild on changes)
npm run standalone:dev
# open http://localhost:3011/standalone.html
```

---

## Quick Start (Docker Toolchain)

The plugin talks to the AOS Edge Toolchain Docker container via Kit Manager.
Start the broadcaster so the UI can discover and send build commands to it.

```bash
# 1. Copy and edit the env file in the toolchain directory
cp ../aos-edge-toolchain/.env.example ../aos-edge-toolchain/.env

# 2. Start the broadcaster
docker run -d --network host \
  --env-file ../aos-edge-toolchain/.env \
  -v ~/.aos/security/aos-user-sp.p12:/certs/aos-user-sp.p12:ro \
  --name aos-broadcaster \
  --entrypoint "node" \
  aos-edge-toolchain:proxy /usr/local/bin/aos-broadcaster.js

# 3. View logs
docker logs -f aos-broadcaster
```

Or without `--env-file` (build-only, no certificate):

```bash
docker run -d --network host \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e INSTANCE_ID=AET-TOOLCHAIN-001 \
  --name aos-broadcaster \
  --entrypoint "node" \
  aos-edge-toolchain:proxy /usr/local/bin/aos-broadcaster.js
```

---

## Certificate Setup

A `.p12` certificate is required for signing, uploading, and AosCloud API calls.
Three ways to provide it, checked in this order:

| Method | When to use |
|--------|------------|
| `CERT_FILE` env var | You have a local `.p12` file |
| UI upload | Quick testing from the browser |
| `AZURE_KEY_VAULT_NAME` env var | Production with Azure Managed Identity |

### Option 1: Local file (CERT_FILE)

Mount the file into the container and set `CERT_FILE`:

```bash
docker run -d --network host \
  -e CERT_FILE=/certs/aos-user-sp.p12 \
  -v /path/to/aos-user-sp.p12:/certs/aos-user-sp.p12:ro \
  -e INSTANCE_ID=AET-TOOLCHAIN-001 \
  --name aos-broadcaster \
  --entrypoint "node" \
  aos-edge-toolchain:proxy /usr/local/bin/aos-broadcaster.js
```

### Option 2: Upload from UI

1. Open the standalone UI or plugin
2. Find the **Certificate** panel in the left column
3. Click **Upload .p12 file** and select your certificate
4. Status indicator turns green when loaded

### Option 3: Azure Key Vault (production)

```bash
docker run -d --network host \
  -e AZURE_KEY_VAULT_NAME=my-vault-name \
  -e INSTANCE_ID=AET-TOOLCHAIN-001 \
  --name aos-broadcaster \
  --entrypoint "node" \
  aos-edge-toolchain:proxy /usr/local/bin/aos-broadcaster.js
```

Requires Azure Managed Identity with Key Vault Secrets User role.

---

## npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `npm run build` | Build the plugin for digital.auto (`index.js`, React external) |
| `dev` | `npm run dev` | Watch mode plugin build |
| `standalone` | `npm run standalone` | Build standalone version (`standalone.js`, React bundled) |
| `standalone:dev` | `npm run standalone:dev` | Dev server with watch at `http://localhost:3011` |

### Plugin vs Standalone builds

| | Plugin (`build`) | Standalone (`standalone`) |
|---|---|---|
| Entry | `src/index.ts` | `src/standalone.ts` |
| Output | `index.js` (155 KB) | `standalone.js` (1.2 MB) |
| React | External (host provides) | Bundled |
| Usage | Loaded by digital.auto | Open `standalone.html` in browser |

---

## Architecture

```
Browser (Plugin or Standalone)
   │
   │  Socket.IO
   ▼
Kit Manager (kit.digitalauto.tech)
   │
   │  Socket.IO
   ▼
AOS Edge Toolchain (Docker)
   │  aos-broadcaster.js
   │  aos-toolkit.sh (build/sign/upload)
   │
   │  REST + TLS client cert
   ▼
AosCloud (aoscloud.io:10000)
   │
   ▼
Edge Unit (RPi5 / VM)
```

---

## UI Panels

| Panel | Location | Description |
|-------|----------|-------------|
| **Docker Instances** | Left | Lists AET-* toolchain instances, online/offline filter |
| **AosCloud Deployment Status** | Left | Service version, unit status from AosCloud API |
| **Certificate** | Left | Upload/check signing certificate status |
| **main.cpp** | Center | C++ source code editor |
| **config.yaml** | Center | Service manifest editor |
| **Build & Deploy** | Center | One-click build + sign + upload |
| **Build Status** | Right | Current build progress |
| **Deployed Apps** | Right | List of deployed apps with start/stop |
| **Build Logs** | Right | Timestamped log output |

---

## Docker Environment Variables

### Broadcaster

| Variable | Default | Description |
|----------|---------|-------------|
| `INSTANCE_ID` | Auto-generated | Unique instance ID (e.g. `AET-TOOLCHAIN-001`) |
| `INSTANCE_NAME` | `AOS Edge Toolchain` | Display name shown in UI |
| `KIT_MANAGER_URL` | `https://kit.digitalauto.tech` | Kit Manager WebSocket URL |
| `BROADCAST_INTERVAL` | `30000` | Status heartbeat interval (ms) |

### Certificate

| Variable | Default | Description |
|----------|---------|-------------|
| `CERT_FILE` | _(unset)_ | Path to a mounted `.p12` file |
| `AZURE_KEY_VAULT_NAME` | _(unset)_ | Azure Key Vault name (production) |
| `CERT_NAME` | `aos-user-sp` | Certificate name in Key Vault |

### Network / Proxy

| Variable | Default | Description |
|----------|---------|-------------|
| `https_proxy` | _(unset)_ | HTTPS proxy URL (e.g. `http://127.0.0.1:3128`) |
| `http_proxy` | _(unset)_ | HTTP proxy URL |
| `NODE_TLS_REJECT_UNAUTHORIZED` | `1` | Set to `0` for corporate proxy TLS interception |

---

## File Structure

```
aos-cloud-deployment/
├── src/
│   ├── index.ts            # Plugin entry (registers on window.DAPlugins)
│   ├── standalone.ts       # Standalone entry (bundles React, mounts directly)
│   ├── setup-react.ts      # Sets globalThis.React for standalone mode
│   ├── components/
│   │   └── Page.tsx        # Main UI component
│   ├── services/
│   │   └── aos.service.ts  # Socket.IO client for Kit Manager
│   ├── types/
│   │   └── index.ts        # TypeScript type definitions
│   └── presets/
│       ├── index.ts        # Preset loader
│       ├── config.yaml     # Example AOS config
│       └── hello-aos.cpp   # Example C++ source
├── standalone.html         # HTML shell for standalone mode
├── build.sh                # Plugin build script (esbuild)
├── package.json
└── tsconfig.json
```

---

## Common Operations

### Restart broadcaster

```bash
docker rm -f aos-broadcaster
docker run -d --network host \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e INSTANCE_ID=AET-TOOLCHAIN-001 \
  --name aos-broadcaster \
  --entrypoint "node" \
  aos-edge-toolchain:proxy /usr/local/bin/aos-broadcaster.js
```

### Build Docker image (if modified)

```bash
# Direct
docker build -t aos-edge-toolchain .

# Behind proxy
docker build \
  --build-arg https_proxy=http://127.0.0.1:3128 \
  --build-arg http_proxy=http://127.0.0.1:3128 \
  --network host \
  -t aos-edge-toolchain:proxy .
```

### Develop with live-mounted broadcaster script

Mount the script so changes apply without rebuilding the Docker image:

```bash
docker run -d --network host \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e INSTANCE_ID=AET-TOOLCHAIN-001 \
  -v $(pwd)/../aos-edge-toolchain/scripts/aos-broadcaster.js:/usr/local/bin/aos-broadcaster.js:ro \
  --name aos-broadcaster \
  --entrypoint "node" \
  aos-edge-toolchain:proxy /usr/local/bin/aos-broadcaster.js
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Blank page in standalone | React not on `globalThis` before Page loads | Make sure `setup-react.ts` is imported first in `standalone.ts` |
| `xhr poll error` in broadcaster | TLS verification fails (corporate proxy) | Add `-e NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `getaddrinfo ENOTFOUND` | DNS doesn't resolve inside container | Use `--network host` + proxy env vars; the proxy handles DNS |
| Build succeeds but sign fails | No certificate loaded | Use `CERT_FILE`, UI upload, or `AZURE_KEY_VAULT_NAME` |
| Package too small after sign | Binary not in `src/` directory | `aos-toolkit.sh deploy` handles this automatically |
| UI shows "No Prototype Selected" | Running plugin mode without host data | Use standalone mode (`npm run standalone`) for testing |
