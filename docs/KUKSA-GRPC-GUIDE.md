# KUKSA gRPC Vehicle App — Full Stack Guide

Build, deploy, and run a C++ vehicle app that reads KUKSA vehicle signals directly via gRPC on an AosEdge RPi 5 device.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Dev Machine                                    │
│                                                 │
│  ┌─────────────────────────────────────┐        │
│  │ SDV Runtime (Docker)                │        │
│  │  ├─ KUKSA Databroker (port 55555)   │        │
│  │  ├─ Mock Signal Provider            │        │
│  │  ├─ Kit Manager (port 3090)         │        │
│  │  └─ VSS 4.0                         │        │
│  └─────────────────────────────────────┘        │
│                                                 │
│  ┌─────────────────────────────────────┐        │
│  │ AOS Edge Toolchain (Docker)         │        │
│  │  ├─ Conan 2 + CMake                 │        │
│  │  ├─ gRPC/protobuf (aarch64)         │        │
│  │  ├─ KUKSA proto files               │        │
│  │  ├─ aos-signer                      │        │
│  │  └─ aos-broadcaster.js              │        │
│  └─────────────────────────────────────┘        │
│                                                 │
│  Standalone Web UI (port 3011)                  │
│    └─ Build & Deploy to AosCloud                │
└────────────────────┬────────────────────────────┘
                     │ gRPC (port 55555)
                     │
┌────────────────────▼────────────────────────────┐
│  AosEdge RPi 5 (DomD)                           │
│                                                 │
│  ┌─────────────────────────────┐                │
│  │ crun container              │                │
│  │  └─ kuksa-grpc-app          │── gRPC ──▶ Dev │
│  │     (ARM64 binary)          │   Machine      │
│  └─────────────────────────────┘   :55555       │
│                                                 │
│  KUKSA Databroker (built-in, port 55555)        │
│  AOS Service Manager                            │
│  AOS Communication Manager                      │
└─────────────────────────────────────────────────┘
```

## Prerequisites

| Component | Requirement |
|-----------|------------|
| Dev machine | Linux (Ubuntu), Docker, Python 3, Node.js |
| RPi 5 | AosEdge image (meta-aos-rpi v1.1.3+), 8 GB RAM |
| Network | Dev machine and RPi on same network (Ethernet) |
| Certificate | `.p12` file at `~/.aos/security/aos-user-sp.p12` |
| AosCloud | Account at [aoscloud.io](https://aoscloud.io), provisioned unit |

## Step 1: Start SDV Runtime (KUKSA + signals)

```bash
cd kuksa-docker
./start-sdv-runtime.sh MyRuntimeName
```

This starts the [eclipse-autowrx/sdv-runtime](https://github.com/eclipse-autowrx/sdv-runtime) container with KUKSA Databroker on port 55555 and mock signal provider auto-feeding vehicle data.

Verify:

```bash
curl http://localhost:8888/api/v1/signals/Vehicle.Speed
# Or directly via the feeder:
# python3 kuksa-docker/feeder.py  (if using standalone mode)
```

## Step 2: Build the Toolchain Docker Image

```bash
cd aos-edge-toolchain
docker build -t aos-edge-toolchain:grpc .
```

This image includes:
- ARM64 cross-compiler (`aarch64-linux-gnu-g++`)
- Conan 2 package manager
- gRPC + protobuf cross-compiled for aarch64 (cached via Conan)
- KUKSA proto files (`kuksa.val.v1`)
- `aos-signer` for signing and uploading to AosCloud

First build takes ~20 minutes (Conan compiles gRPC from source). Subsequent builds use cache.

## Step 3: Start the Broadcaster

```bash
docker run -d \
  --name aos-broadcaster \
  --network host \
  --entrypoint "" \
  -v ~/.aos/security/aos-user-sp.p12:/certs/aos-user-sp.p12:ro \
  -e INSTANCE_ID=AET-TOOLCHAIN-001 \
  -e INSTANCE_NAME="AOS Edge Toolchain" \
  -e KIT_MANAGER_URL=https://kit.digitalauto.tech \
  -e BROADCAST_INTERVAL=30000 \
  -e CERT_FILE=/certs/aos-user-sp.p12 \
  -e AOSCLOUD_URL=https://aoscloud.io:10000 \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  --entrypoint "" \
  aos-edge-toolchain:grpc \
  sh -c "python3 /usr/local/bin/init-certs.py && exec node /usr/local/bin/aos-broadcaster.js"
```

Verify:

```bash
docker logs aos-broadcaster | tail -3
# Should show: [Broadcaster] Connected to Kit Manager
```

## Step 4: Start the Standalone Web UI

```bash
cd aos-cloud-deployment
npm install
npx esbuild src/standalone.ts --bundle --format=iife --platform=browser \
  --jsx=automatic --sourcemap --outfile=standalone.js \
  --servedir=. --serve=3011 --watch=forever
```

Open **http://localhost:3011/standalone.html**

## Step 5: Build & Deploy the KUKSA gRPC App

1. In the standalone UI, select **"KUKSA gRPC App (Direct)"** from the preset dropdown
2. The C++ code connects to KUKSA via gRPC — edit `target` address if needed (default: `localhost:55555`)
3. Set the version in the config.yaml editor (e.g., `1.3.0`)
4. Set `cmd` to include the external KUKSA address: `/kuksa-grpc-app <DEV_MACHINE_IP>:55555 3`
5. Click **Build & Deploy**

The toolchain will:
- Detect gRPC includes → auto-generate `CMakeLists.txt` + `conanfile.txt`
- Run Conan to install gRPC/protobuf for aarch64
- Generate C++ from KUKSA proto files
- Cross-compile to ARM64
- Sign with your `.p12` certificate
- Upload to AosCloud

## Step 6: Prepare the RPi 5

### Set the clock (required on every boot without RTC battery)

Connect via serial console or SSH:

```bash
# Serial console
sudo minicom -b 115200 -D /dev/ttyUSB0
# Switch to DomD: press Ctrl+a three times

# Set clock (replace with current UTC time)
sudo date -s "2026-04-10 08:30:00"
```

### Network setup

The dev machine and RPi must be on the same network:

```bash
# On dev machine — add RPi's subnet to Ethernet interface
sudo ip addr add 10.0.0.1/24 dev <ETH_INTERFACE>

# Verify
ssh pi@10.0.0.100
# Password: (your configured password)
```

### Open firewall for KUKSA port

```bash
# On dev machine
sudo iptables -I INPUT -p tcp --dport 55555 -j ACCEPT
```

### Switch on-device databroker to insecure mode (one-time)

The on-device KUKSA uses TLS by default. For the gRPC app to connect to the external databroker, the external one must accept insecure connections (SDV Runtime does by default). If connecting to the on-device databroker instead:

```bash
# On RPi (serial console)
sudo mount -o remount,rw /
echo 'EXTRA_ARGS="--vss /usr/share/vss/vss.json --address=0.0.0.0 --insecure"' | sudo tee /etc/default/kuksa-databroker
sudo systemctl restart kuksa-databroker
```

## Step 7: Verify on the Device

After AosCloud deploys the app to the RPi:

```bash
# SSH into the device
ssh pi@10.0.0.100

# List running containers
sudo crun list

# View live output (runs a second instance for 15 seconds)
sudo timeout 15 crun exec <CONTAINER_ID> /kuksa-grpc-app <DEV_MACHINE_IP>:55555 3
```

Expected output:

```
========================================
  KUKSA Vehicle Signal App (gRPC)
  Version:    1.2.16
  Databroker: 10.0.0.1:55555
  Interval:   3s
  Direct gRPC - no bridge needed!
========================================
[KUKSA] Connected to databroker 0.4.4

--- Cycle 1 ---
  Vehicle.Speed = 68.500000
  Vehicle.Cabin.HVAC.AmbientAirTemperature = 18.299999
  Vehicle.Powertrain.TractionBattery.StateOfCharge.Current = 0.000000

--- Cycle 2 ---
  Vehicle.Speed = 62.500000
  Vehicle.Cabin.HVAC.AmbientAirTemperature = 17.600000
```

## Quick Reference Commands

| Task | Command |
|------|---------|
| Start SDV Runtime | `cd kuksa-docker && ./start-sdv-runtime.sh MyRuntime` |
| Stop SDV Runtime | `cd kuksa-docker && ./stop-sdv-runtime.sh` |
| Start broadcaster | See Step 3 above |
| Start web UI | `cd aos-cloud-deployment && npm run standalone:dev` |
| Connect serial console | `sudo minicom -b 115200 -D /dev/ttyUSB0` |
| SSH to RPi | `ssh pi@10.0.0.100` |
| Set RPi clock | `sudo date -s "YYYY-MM-DD HH:MM:SS"` |
| List containers on RPi | `sudo crun list` |
| View app output | `sudo timeout 15 crun exec <ID> /kuksa-grpc-app <IP>:55555 3` |
| Check signal (quick) | `sudo crun exec <ID> wget -q -O - http://<IP>:8888/api/v1/signals/Vehicle.Speed` |
| Fix firewall after reboot | `sudo systemctl restart aos-provfirewall` |

## Troubleshooting

See [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) for common issues including:

- **Clock resets** — RPi 5 without RTC battery loses time on every reboot. Set clock before AOS services start.
- **"bridge plugin" error** — Usually caused by wrong clock. Fix clock, then `sudo systemctl restart aos-provfirewall`.
- **Build quota exceeded** — Increase `storage_disk_limit` on AosCloud service (gRPC binary is ~19 MB).
- **gRPC connection refused** — Check firewall (`sudo iptables -I INPUT -p tcp --dport 55555 -j ACCEPT`) and that SDV Runtime is running.
- **Container can't reach host** — Inside the crun container, use the bridge gateway IP (e.g., `172.28.0.2`) not `localhost`.

## Project Structure

```
epam-service-connector/
├── aos-cloud-deployment/          # Standalone web UI
│   └── src/presets/index.ts       # KUKSA gRPC App preset
├── aos-edge-toolchain/            # Docker toolchain
│   ├── Dockerfile                 # With Conan 2 + gRPC support
│   ├── proto/kuksa/val/v1/        # KUKSA proto files (Apache-2.0)
│   ├── conan-profiles/            # aarch64 cross-compile profile
│   ├── example-kuksa/             # CMake example project
│   └── scripts/
│       ├── aos-broadcaster.js     # Kit Manager + build orchestrator
│       └── aos-toolkit.sh         # Build/sign/upload CLI
├── kuksa-docker/                  # KUKSA test environment
│   ├── start-sdv-runtime.sh       # SDV Runtime mode
│   ├── start-kuksa.sh             # Standalone mode
│   ├── bridge.py                  # REST bridge (for non-gRPC apps)
│   └── feeder.py                  # Signal simulator
├── TROUBLESHOOTING.md
└── docs/KUKSA-GRPC-GUIDE.md       # This file
```
