# Eclipse SDV Blueprint — Full Working Demo

End-to-end demonstration of the Eclipse SDV Blueprint with EV Range Extender use case.
Signals flow across three simulated vehicle nodes (HPC, Zonal, End), are processed by
the EV Range Extender app, and appear live on a standalone browser dashboard.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLOUD                                       │
│                                                                          │
│  ┌─────────────────────┐        ┌──────────────────────────────────────┐ │
│  │      AosCloud        │        │  Standalone Dashboard (browser)     │ │
│  │  Fleet Mgmt + OTA    │        │  Live signals, architecture view,  │ │
│  └──────┬───────┬───────┘        │  EV Range Extender status          │ │
│         │       │                └──────────────▲─────────────────────┘ │
│         │       │                               │ Socket.IO             │
│   AMQP  │       │ AMQP                          │                       │
└─────────┼───────┼──────────────────────────────┼───────────────────────┘
          │       │                ┌──────────────┴─────────────────────┐
          │       │                │  Broadcaster (Docker, dev machine) │
          │       │                │  + signal relay on port 9100       │
          │       │                └──────────────▲─────────────────────┘
          │       │                               │ HTTP POST (signals)
          ▼       ▼                               │
┌─────────────────────┐  gRPC sync  ┌─────────────────────┐
│    HPC Node (VM1)   │◄────────────│   Zonal Node (VM2)  │
│                     │  kuksa-     │                     │
│  KUKSA Databroker   │  bridge.py  │  KUKSA Databroker   │
│  (port 55555)       │             │  (port 55556)       │
│                     │             │                     │
│  crun containers:   │             │  crun containers:   │
│  ┌───────────────┐  │             │  ┌───────────────┐  │
│  │ EV Range      │  │             │  │ Signal Writer │  │
│  │ Extender      │  │             │  │ (Zonal        │  │
│  │ (reads SoC,   │  │             │  │  sensors)     │  │
│  │  computes     │  │             │  └───────────────┘  │
│  │  Range)       │  │             │                     │
│  ├───────────────┤  │             └──────────▲──────────┘
│  │ Signal        │  │                        │ gRPC
│  │ Reporter      │──┘ pushes signals         │
│  │ (→ dashboard) │    to broadcaster   ┌─────┴──────────┐
│  └───────────────┘                     │ End Simulator   │
│                                        │ (Python, fake   │
└────────────────────────────────────────│  HVAC/Display/  │
                                         │  Seat sensors)  │
                                         └────────────────┘
```

## Components

| Component | Location | Language | Deployed via |
|---|---|---|---|
| Signal Writer | `presets/signal-writer.cpp` | C++ (gRPC) | AosCloud OTA → Zonal VM |
| EV Range Extender | `presets/ev-range-extender.cpp` | C++ (gRPC) | AosCloud OTA → HPC VM |
| Signal Reporter | `presets/signal-reporter.cpp` | C++ (gRPC + HTTP) | AosCloud OTA → HPC VM |
| KUKSA-to-KUKSA Bridge | `kuksa-sync/kuksa-bridge.py` | Python (gRPC) | Standalone process |
| End ECU Simulator | `end-simulator/simulator.py` | Python (gRPC) | Standalone process |
| Standalone Dashboard | `dashboard/index.html` | HTML/JS/CSS | Open in browser |
| Broadcaster relay | Extended in `aos-edge-toolchain/scripts/aos-broadcaster.js` | Node.js | Docker |

## Vehicle Signals

| Signal (VSS path) | Source | Domain |
|---|---|---|
| `Vehicle.Speed` | Zonal Writer | Zonal |
| `Vehicle.Powertrain.TractionBattery.StateOfCharge.Current` | Zonal Writer | Zonal |
| `Vehicle.Cabin.HVAC.AmbientAirTemperature` | Zonal Writer | Zonal |
| `Vehicle.Cabin.HVAC.TargetTemperature` | End Simulator | End |
| `Vehicle.Infotainment.Display.Brightness` | End Simulator | End |
| `Vehicle.Cabin.Seat.VentilationLevel` | End Simulator | End |
| `Vehicle.Powertrain.Range` | EV Range Extender (computed) | HPC |
| `Vehicle.Cabin.Lights.AmbientLight.Intensity` | EV Range Extender (actuated) | HPC |
| `Vehicle.Cabin.Seat.Heating` | EV Range Extender (actuated) | HPC |

## EV Range Extender Logic

```
EVERY 2 seconds:
  Read SoC from KUKSA

  IF SoC < 20%:
    mode = POWER_SAVE
    Set Lights.AmbientLight.Intensity = 30   (dimmed from 100)
    Set Seat.Heating = 0                     (off)
    Range = SoC * 4.0 km                    (degraded efficiency)
  ELSE:
    mode = NORMAL
    Set Lights.AmbientLight.Intensity = 100
    Set Seat.Heating = 1
    Range = SoC * 5.5 km                    (normal efficiency)

  Set Vehicle.Powertrain.Range = Range
  Print status to stdout (visible in AosCloud service logs)
```

## Quick Start (Docker Compose)

The fastest way to launch the demo stack (KUKSA brokers + bridge + simulator):

```bash
cd sdv-blueprint
docker compose up
```

This starts four services: HPC KUKSA (:55555), Zonal KUKSA (:55556),
KUKSA bridge, and End ECU simulator.  The broadcaster is commented out
in `docker-compose.yml` — uncomment it after building the
`aos-edge-toolchain` Docker image and placing your `.p12` certificate.

Then open `dashboard/index.html` in your browser.

### Building C++ presets locally

```bash
cd sdv-blueprint
make protos    # download KUKSA proto files
make all       # build signal-writer, ev-range-extender, signal-reporter
```

Requires `protobuf-compiler`, `libgrpc++-dev`, `libprotobuf-dev`.

## Quick Start (Manual)

### Prerequisites

- Docker running on your dev machine
- Two KUKSA Databroker instances (HPC + Zonal)
- AosCloud account with SP certificate (`.p12` file)
- Python 3.10+ with pip

### Step 1 — Generate merged VSS metadata (one time)

The blueprint uses custom signal paths not in stock VSS 5.1. Run once to
generate the merged metadata file used by both databrokers:

```bash
cd sdv-blueprint
python3 -c "
import json, sys
with open('/tmp/vss_base.json' if __import__('os').path.exists('/tmp/vss_base.json') else 'vss-merged.json') as f: base = json.load(f)
with open('vss-overlay.json') as f: overlay = json.load(f)
def merge(b, o):
    for k, v in o.items():
        if k in b and isinstance(b[k], dict) and isinstance(v, dict): merge(b[k], v)
        else: b[k] = v
merge(base, overlay)
with open('vss-merged.json', 'w') as f: json.dump(base, f)
print('vss-merged.json written')
"
```

Or simply extract the base from the image first:
```bash
docker create --name tmp ghcr.io/eclipse-kuksa/kuksa-databroker:latest
docker cp tmp:/vss_release_5.1.json /tmp/vss_base.json
docker rm tmp
```

### Step 2 — Start two KUKSA Databrokers

```bash
# HPC KUKSA (port 55555)
docker run -d --rm --name kuksa-hpc --network host \
  -v "$(pwd)/vss-merged.json:/vss.json:ro" \
  ghcr.io/eclipse-kuksa/kuksa-databroker:latest --insecure --port 55555 --metadata /vss.json

# Zonal KUKSA (port 55556)
docker run -d --rm --name kuksa-zonal --network host \
  -v "$(pwd)/vss-merged.json:/vss.json:ro" \
  ghcr.io/eclipse-kuksa/kuksa-databroker:latest --insecure --port 55556 --metadata /vss.json
```

### Step 3 — Start the KUKSA-to-KUKSA bridge

```bash
cd sdv-blueprint/kuksa-sync
pip install -r requirements.txt
ZONAL_KUKSA_ADDR=localhost:55556 HPC_KUKSA_ADDR=localhost:55555 python3 kuksa-bridge.py
```

### Step 4 — Start the End ECU simulator

```bash
cd sdv-blueprint/end-simulator
pip install -r requirements.txt
KUKSA_ADDR=localhost:55556 python3 simulator.py
```

### Step 5 — Start the broadcaster with signal relay

```bash
# Build the toolchain Docker image (if not already built)
cd aos-edge-toolchain
docker build -t aos-edge-toolchain:latest .

# Run with signal relay enabled
docker run -d --network host \
  --name aos-broadcaster \
  --entrypoint "" \
  -v ~/.aos/security/aos-user-sp.p12:/certs/aos-user-sp.p12:ro \
  -e INSTANCE_ID=AET-TOOLCHAIN-001 \
  -e INSTANCE_NAME="AOS Edge Toolchain" \
  -e KIT_MANAGER_URL=https://kit.digitalauto.tech \
  -e CERT_FILE=/certs/aos-user-sp.p12 \
  -e AOSCLOUD_URL=https://aoscloud.io:10000 \
  -e SIGNAL_RELAY_PORT=9100 \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  aos-edge-toolchain:latest \
  sh -c "python3 /usr/local/bin/init-certs.py && exec node /usr/local/bin/aos-broadcaster.js"
```

### Step 6 — Open the dashboard

Open `sdv-blueprint/dashboard/index.html` in your browser.
Enter your broadcaster instance ID and click Connect.

### Step 7 — Deploy AOS services

Use the existing standalone UI (`aos-cloud-deployment/standalone.html`) or the
new dashboard to deploy:

1. **Signal Writer** (to Zonal VM) — writes Speed, SoC, Temperature
2. **EV Range Extender** (to HPC VM) — reads SoC, computes Range, actuates
3. **Signal Reporter** (to HPC VM) — subscribes to all signals, pushes to dashboard

### Step 8 — Watch the demo

- Dashboard shows live signals from all three nodes
- When SoC drops below 20%, EV Range Extender switches to POWER_SAVE
- Lights dim, seat heating turns off, range computation changes
- All visible in real-time on the dashboard

## File Reference

```
sdv-blueprint/
├── README.md                       ← this file
├── docker-compose.yml              ← one-command demo launch
├── Dockerfile.python               ← image for Python services
├── Makefile                        ← local C++ build (make protos && make all)
├── vss-overlay.json                ← custom VSS paths (merged into vss-merged.json)
├── presets/
│   ├── signal-writer.cpp           ← Signal Writer C++ source (Zonal)
│   ├── signal-writer.yaml          ← AOS service config
│   ├── ev-range-extender.cpp       ← EV Range Extender C++ source (HPC)
│   ├── ev-range-extender.yaml      ← AOS service config
│   ├── signal-reporter.cpp         ← Signal Reporter C++ source (HPC)
│   └── signal-reporter.yaml        ← AOS service config
├── dashboard/
│   ├── index.html                  ← standalone dashboard (open in browser)
│   ├── dashboard.js                ← signal visualization logic
│   └── dashboard.css               ← styling
├── end-simulator/
│   ├── simulator.py                ← End ECU sensor simulator
│   └── requirements.txt
└── kuksa-sync/
    ├── kuksa-bridge.py             ← KUKSA Zonal→HPC signal sync
    └── requirements.txt
```
