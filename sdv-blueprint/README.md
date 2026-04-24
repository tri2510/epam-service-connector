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
| Signal Reporter (Python) | `signal-reporter/reporter.py` | Python (gRPC + HTTP) | Standalone process (local demo) |
| KUKSA-to-KUKSA Bridge | `kuksa-sync/kuksa-bridge.py` | Python (gRPC) | Standalone process |
| End ECU Simulator | `end-simulator/simulator.py` | Python (gRPC) | Standalone process |
| Standalone Dashboard | `dashboard/standalone.html` | React/TypeScript | `npm run standalone:dev` on :3012 |
| Deployment UI | `aos-cloud-deployment/standalone.html` | React/TypeScript | `npm run standalone:dev` on :3011 |
| Broadcaster relay | `aos-edge-toolchain/scripts/aos-broadcaster.js` | Node.js | Docker |

## Vehicle Signals

| Signal (VSS path) | Source | Domain |
|---|---|---|
| `Vehicle.Speed` | Signal Writer | Zonal |
| `Vehicle.Powertrain.TractionBattery.StateOfCharge.Current` | Signal Writer | Zonal |
| `Vehicle.Cabin.HVAC.AmbientAirTemperature` | Signal Writer | Zonal |
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

---

## Part A — Local Demo (no edge hardware needed)

Run the full signal pipeline on your dev machine using Docker and Python.
This validates the dashboard, signal flow, and bridge without AosCloud or real units.

### Prerequisites

- Docker running on your dev machine
- Python 3.10+ with `pip install kuksa-client grpcio`

### A1 — Generate merged VSS metadata

The blueprint uses custom signal paths not in stock VSS 5.1. Run once:

```bash
cd sdv-blueprint

# Extract the base VSS JSON from the KUKSA image
docker create --name kuksa-tmp ghcr.io/eclipse-kuksa/kuksa-databroker:latest
docker cp kuksa-tmp:/vss_release_5.1.json /tmp/vss_base.json
docker rm kuksa-tmp

# Merge our custom paths into it
python3 -c "
import json
with open('/tmp/vss_base.json') as f: base = json.load(f)
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

**Verify:** `ls -lh vss-merged.json` should show ~350 KB.

### A2 — Start KUKSA Databrokers

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

**Verify:** `docker logs kuksa-hpc 2>&1 | grep Listening` should show `Listening on 0.0.0.0:55555`.

### A3 — Start the KUKSA bridge + End simulator + Signal Writer

Open three terminals:

```bash
# Terminal 1 — Bridge (syncs Zonal → HPC)
cd sdv-blueprint/kuksa-sync
pip install -r requirements.txt
ZONAL_KUKSA_ADDR=localhost:55556 HPC_KUKSA_ADDR=localhost:55555 python3 kuksa-bridge.py
```

```bash
# Terminal 2 — End ECU simulator (writes TargetTemp, Brightness, VentLevel)
cd sdv-blueprint/end-simulator
pip install -r requirements.txt
KUKSA_ADDR=localhost:55556 python3 simulator.py
```

```bash
# Terminal 3 — Local Signal Writer (writes Speed, SoC, AmbientTemp)
cd sdv-blueprint
pip install kuksa-client grpcio
python3 -c "
import grpc, time, math
from kuksa.val.v1 import val_pb2, val_pb2_grpc, types_pb2
stub = val_pb2_grpc.VALStub(grpc.insecure_channel('localhost:55556'))
t = 0
while True:
    for path, val in [
        ('Vehicle.Speed', 40 + 30 * math.sin(t * 0.1)),
        ('Vehicle.Cabin.HVAC.AmbientAirTemperature', 22 + 5 * math.sin(t * 0.05)),
        ('Vehicle.Powertrain.TractionBattery.StateOfCharge.Current', max(0, 80 - (t*0.1) % 80)),
    ]:
        dp = types_pb2.Datapoint(float=val)
        entry = types_pb2.DataEntry(path=path, value=dp)
        update = val_pb2.EntryUpdate(entry=entry, fields=[types_pb2.FIELD_VALUE])
        stub.Set(val_pb2.SetRequest(updates=[update]), timeout=3)
    t += 1; time.sleep(2)
"
```

**Verify:** Bridge shows `Subscribing to 6 signals on Zonal...`, simulator
shows `[EndSim] t=0`, and the Signal Writer runs without errors.

### A4 — Start the broadcaster

The broadcaster relays signals from KUKSA to the dashboard via Socket.IO.
It requires the `aos-edge-toolchain` Docker image.

```bash
# Build the image (first time only)
cd aos-edge-toolchain
docker build -t aos-edge-toolchain:latest .

# Start the broadcaster with signal relay
docker run -d --network host \
  --name aos-broadcaster \
  --entrypoint "" \
  -v "$(pwd)/scripts/aos-broadcaster.js:/usr/local/bin/aos-broadcaster.js:ro" \
  -e INSTANCE_ID=AET-TOOLCHAIN-001 \
  -e INSTANCE_NAME="AOS Edge Toolchain" \
  -e KIT_MANAGER_URL=https://kit.digitalauto.tech \
  -e SIGNAL_RELAY_PORT=9100 \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  aos-edge-toolchain:latest \
  sh -c "exec node /usr/local/bin/aos-broadcaster.js"
```

If the Docker build fails (network issues), you can volume-mount the script
into an existing `aos-edge-toolchain` image:

```bash
docker run -d --network host \
  --name aos-broadcaster \
  -v "$(pwd)/scripts/aos-broadcaster.js:/usr/local/bin/aos-broadcaster.js:ro" \
  --entrypoint node \
  aos-edge-toolchain:proxy \
  /usr/local/bin/aos-broadcaster.js
```

**Verify:** `docker logs aos-broadcaster 2>&1 | grep -E 'Connected|SignalRelay'`
should show `Connected to Kit Manager` and `SignalRelay HTTP listener on port 9100`.

### A5 — Start the Signal Reporter

The Signal Reporter subscribes to all 9 signals on HPC KUKSA and pushes them
to the broadcaster's relay endpoint, which forwards them to the dashboard.

```bash
cd sdv-blueprint/signal-reporter
pip install -r requirements.txt
HPC_KUKSA_ADDR=localhost:55555 python3 reporter.py
```

**Verify:** Shows `Subscribing to 9 signals...` then `signals=50 ok=50 fail=0`.

### A6 — Open the dashboard

```bash
cd sdv-blueprint/dashboard
npm install
npm run standalone:dev
```

Open http://localhost:3012/standalone.html in your browser.
The broadcaster instance ID `AET-TOOLCHAIN-001` is pre-filled. Click **Connect**.

**Verify:** Green dot shows "Connected". All 6 Zonal/End signal gauges
(Speed, SoC, Ambient Temp, Target Temp, Display, Seat Vent) should show
live values. Range, Lights, and Seat Heat remain "--" because the
EV Range Extender C++ service only runs on real hardware (see Part B).

---

## Part B — Full Deployment via AosCloud

Deploy the C++ services to real edge hardware via AosCloud OTA.

### Prerequisites

- **2 edge units** registered in AosCloud (e.g. Raspberry Pi 5 running AosCore)
  - **HPC unit** — runs KUKSA Databroker on port 55555
  - **Zonal unit** — runs KUKSA Databroker on port 55556
- **AosCloud SP certificate** (`.p12` file) — request from your AosCloud administrator
- **KUKSA bridge** running between the two units (see Part A, Step A3)
- **End Simulator** running against the Zonal unit (see Part A, Step A3)

### B1 — Set up AosCloud units

1. Log in to [AosCloud](https://aoscloud.io)
2. Register two units with their system UIDs:
   - **HPC** unit (the one with KUKSA on :55555)
   - **Zonal** unit (the one with KUKSA on :55556)
3. Create a **subject** (deployment group) and assign both units to it
4. Note the **unit UIDs** and **subject ID** — you'll need them for deployment

### B2 — Start the broadcaster

```bash
cd aos-edge-toolchain
docker build -t aos-edge-toolchain:latest .

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

**Verify:** `docker logs aos-broadcaster 2>&1 | grep Connected` shows
`Connected to Kit Manager` and `SignalRelay HTTP listener on port 9100`.

### B3 — Deploy services via the Deployment UI

```bash
cd aos-cloud-deployment
npm install
npm run standalone:dev    # opens on http://localhost:3011
```

Open http://localhost:3011/standalone.html and deploy three services in order:

1. **Signal Writer → Zonal unit**
   - Select preset: **KUKSA Writer**
   - Click **Build & Deploy**
   - Writes Speed, SoC, AmbientAirTemperature to Zonal KUKSA

2. **EV Range Extender → HPC unit**
   - Select preset: **EV Range Extender**
   - Click **Build & Deploy**
   - Reads SoC, computes Range, actuates Lights and Seat Heating

3. **Signal Reporter → HPC unit**
   - Select preset: **Signal Reporter**
   - Click **Build & Deploy**
   - Subscribes to all 9 signals, pushes to broadcaster relay

**Verify:** In the Deployment UI left panel, select your service from the
AosCloud Service dropdown. The Units panel shows which units have the service
installed and their run state.

### B4 — Watch the demo on the dashboard

Open the SDV Blueprint dashboard:

```bash
cd sdv-blueprint/dashboard
npm install
npm run standalone:dev    # opens on http://localhost:3012
```

Open http://localhost:3012/standalone.html, enter `AET-TOOLCHAIN-001`, click **Connect**.

All 9 signal gauges should show live values:
- Speed, SoC, Ambient Temp — from Signal Writer on Zonal
- Target Temp, Display, Seat Vent — from End Simulator
- Range, Lights, Seat Heat — computed/actuated by EV Range Extender on HPC

When SoC drops below 20%, the EV Range Extender panel switches to
**POWER SAVE** (red), lights dim to 30%, seat heating turns off, and range
drops to degraded efficiency.

---

## Building C++ presets locally

```bash
cd sdv-blueprint
make protos    # download KUKSA proto files
make all       # build signal-writer, ev-range-extender, signal-reporter
```

Requires `protobuf-compiler`, `libgrpc++-dev`, `libprotobuf-dev`.

## File Reference

```
sdv-blueprint/
├── README.md                       ← this file
├── docker-compose.yml              ← one-command local demo (Part A)
├── Dockerfile.python               ← image for Python services
├── Makefile                        ← local C++ build (make protos && make all)
├── vss-overlay.json                ← custom VSS paths for KUKSA Databroker
├── presets/
│   ├── signal-writer.cpp           ← Signal Writer C++ source (→ Zonal)
│   ├── signal-writer.yaml          ← AOS service config
│   ├── ev-range-extender.cpp       ← EV Range Extender C++ source (→ HPC)
│   ├── ev-range-extender.yaml      ← AOS service config
│   ├── signal-reporter.cpp         ← Signal Reporter C++ source (→ HPC)
│   └── signal-reporter.yaml        ← AOS service config
├── dashboard/
│   ├── standalone.html             ← standalone React app entry point
│   ├── package.json                ← npm deps + scripts
│   ├── src/
│   │   ├── standalone.ts           ← mounts Dashboard component
│   │   ├── index.ts                ← widget plugin entry (mount/unmount)
│   │   ├── components/Dashboard.tsx ← main UI (gauges, mode, logs)
│   │   ├── services/signal.service.ts ← Socket.IO connection to broadcaster
│   │   └── types/index.ts          ← signal types, VSS paths
│   ├── index.html                  ← simple file:// version (no build needed)
│   ├── dashboard.js                ← vanilla JS version
│   └── dashboard.css               ← dark theme styling
├── signal-reporter/
│   ├── reporter.py                 ← Python Signal Reporter (local demo)
│   └── requirements.txt
├── end-simulator/
│   ├── simulator.py                ← End ECU sensor simulator
│   └── requirements.txt
└── kuksa-sync/
    ├── kuksa-bridge.py             ← KUKSA Zonal→HPC signal sync
    └── requirements.txt
```
