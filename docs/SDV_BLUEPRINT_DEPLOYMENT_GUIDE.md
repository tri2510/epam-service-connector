# Eclipse SDV Blueprint - Real Deployment Guide

Complete guide for deploying Eclipse SDV Blueprint demo on real AosCore VMs instead of Docker containers.

## Date: May 4, 2026
## Setup: 2 AosCore Units with VirtualBox VMs

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│ Dev Machine (localhost)                                    │
│                                                             │
│ ┌─────────────────────┐      ┌──────────────────────────┐ │
│ │ aos-broadcaster     │      │ Deployment UI            │ │
│ │ (Docker)            │      │ (http://localhost:3011)  │ │
│ │ - Build C++ apps    │      │ - Visual deployment UI   │ │
│ │ - Sign with SP cert │      │ - Monitor service status │ │
│ │ - Deploy to AosCloud│      │ - View logs              │ │
│ │ Instance ID:        │      └──────────────────────────┘ │
│ │ AET-TOOLCHAIN-001   │                                    │
│ └─────────┬───────────┘                                    │
└───────────┼────────────────────────────────────────────────┘
            │ HTTPS + TLS cert
            ▼
┌────────────────────────────────────────────────────────────┐
│ AosCloud (https://aoscloud.io)                             │
│ - Fleet Management                                         │
│ - OTA Updates                                              │
│ - Service Registry                                         │
└────────────┬───────────────────────────────────────────────┘
             │ AMQP (OTA updates)
      ┌──────┴──────┐
      ▼             ▼
┌─────────────┐ ┌─────────────┐
│  HPC Unit   │ │ Zonal Unit  │
│  (36646)    │ │  (36647)    │
└─────────────┘ └─────────────┘
```

---

## Infrastructure Setup

### Created Units

#### HPC-Unit (Unit 36646)
- **AosCloud URL:** https://oem.aoscloud.io/oem/units/36646
- **System ID:** `b3af0d6fcd0f406ead68f72b86a78e77`
- **Created:** May 4, 2026
- **Purpose:** High-Performance Computing Node

**VMs:**
- **main VM:**
  - SSH: `localhost:8289`
  - KUKSA Databroker: **port 55555** ✅
  - Status: Running, Provisioned
  
- **secondary-1 VM:**
  - SSH: `localhost:8779`
  - KUKSA Databroker: port 55555 (standby)
  - Status: Running, Provisioned

**Services to Deploy:**
- ✅ KUKSA Databroker (pre-installed)
- 📦 EV Range Extender (via AosCloud OTA)
- 📦 Signal Reporter (via AosCloud OTA)

---

#### Zonal-Unit (Unit 36647)
- **AosCloud URL:** https://oem.aoscloud.io/oem/units/36647
- **System ID:** `97f9e61238654363978a754916d6c9cf`
- **Created:** May 4, 2026
- **Purpose:** Zonal Controller Node

**VMs:**
- **main VM:**
  - SSH: `localhost:8139`
  - KUKSA Databroker: **port 55556** ✅
  - Status: Running, Provisioned
  
- **secondary-1 VM:**
  - SSH: `localhost:8222`
  - KUKSA Databroker: port 55556 (standby)
  - Status: Running, Provisioned

**Services to Deploy:**
- ✅ KUKSA Databroker (pre-installed)
- 📦 Signal Writer (via AosCloud OTA)

---

## Deployment Tools

### 1. aos-broadcaster (Docker Container)

**Container Name:** `aos-broadcaster`  
**Image:** `aos-edge-toolchain:proxy`  
**Status:** ✅ Running

**Configuration:**
```bash
Instance ID: AET-TOOLCHAIN-001
Instance Name: AOS Edge Toolchain
Kit Manager: https://kit.digitalauto.tech
AosCloud URL: https://aoscloud.io:10000
SP Certificate: ~/.aos/security/aos-user-sp.p12 ✅
Signal Relay Port: 9100
```

**Capabilities:**
- ✅ Cross-compile C++ for ARM64
- ✅ Sign service packages
- ✅ Upload to AosCloud
- ✅ Monitor deployment status
- ✅ Retrieve service logs
- ✅ Signal relay for dashboard

**Start Command:**
```bash
docker run -d --network host \
  --name aos-broadcaster \
  -v ~/.aos/security/aos-user-sp.p12:/certs/aos-user-sp.p12:ro \
  -e INSTANCE_ID=AET-TOOLCHAIN-001 \
  -e INSTANCE_NAME="AOS Edge Toolchain" \
  -e KIT_MANAGER_URL=https://kit.digitalauto.tech \
  -e CERT_FILE=/certs/aos-user-sp.p12 \
  -e AOSCLOUD_URL=https://aoscloud.io:10000 \
  -e SIGNAL_RELAY_PORT=9100 \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  --entrypoint sh \
  aos-edge-toolchain:proxy \
  -c "unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY && \
      python3 /usr/local/bin/init-certs.py && \
      exec node /usr/local/bin/aos-broadcaster.js"
```

---

### 2. AosCloud Deployment UI

**URL:** http://localhost:3011/standalone.html  
**Status:** ✅ Running  
**Purpose:** Visual interface for deploying C++ services

**Features:**
- Select preset services (Signal Writer, EV Range Extender, Signal Reporter)
- One-click build & deploy
- Real-time build logs
- Service status monitoring
- Unit assignment
- Service log viewer

**Start Command:**
```bash
cd /home/htr1hc/01_PJNE/20_Jayanta/PR\ review/epam-service-connector/aos-cloud-deployment
npx esbuild src/standalone.ts --bundle --format=iife \
  --platform=browser --jsx=automatic --sourcemap \
  --outfile=standalone.js
python3 -m http.server 3011
```

---

## Service Deployment Plan

### Services Overview

Three C++ services need to be deployed:

#### 1. Signal Writer
- **Target:** Zonal-Unit main VM
- **Source:** `/sdv-blueprint/presets/signal-writer.cpp`
- **Config:** `/sdv-blueprint/presets/signal-writer.yaml`
- **Purpose:** Writes vehicle signals to KUKSA
- **Signals Written:**
  - `Vehicle.Speed` (oscillating 10-70 km/h)
  - `Vehicle.Powertrain.TractionBattery.StateOfCharge.Current` (80% decreasing)
  - `Vehicle.Cabin.HVAC.AmbientAirTemperature` (22°C ±5°C)
- **Update Interval:** 2 seconds
- **KUKSA Connection:** localhost:55556 (Zonal KUKSA)

#### 2. EV Range Extender
- **Target:** HPC-Unit main VM
- **Source:** `/sdv-blueprint/presets/ev-range-extender.cpp`
- **Config:** `/sdv-blueprint/presets/ev-range-extender.yaml`
- **Purpose:** Battery management and range computation
- **Logic:**
  - Reads battery SoC every 2 seconds
  - If SoC < 20%: POWER_SAVE mode (dim lights, disable seat heating)
  - If SoC ≥ 20%: NORMAL mode (full lights, seat heating on)
  - Computes remaining range based on efficiency
- **Signals Read:** `Vehicle.Powertrain.TractionBattery.StateOfCharge.Current`
- **Signals Written:**
  - `Vehicle.Powertrain.Range`
  - `Vehicle.Cabin.Lights.AmbientLight.Intensity`
  - `Vehicle.Cabin.Seat.Heating`
- **KUKSA Connection:** localhost:55555 (HPC KUKSA)

#### 3. Signal Reporter
- **Target:** HPC-Unit main VM
- **Source:** `/sdv-blueprint/presets/signal-reporter.cpp`
- **Config:** `/sdv-blueprint/presets/signal-reporter.yaml`
- **Purpose:** Relay all signals to dashboard
- **Signals Monitored:** All 9 vehicle signals
- **Relay Method:** HTTP POST to broadcaster on port 9100
- **KUKSA Connection:** localhost:55555 (HPC KUKSA)
- **Broadcaster:** Forwards to dashboard via Socket.IO

---

## Credentials & Access

### AosCloud Accounts
- **OEM Account:** nhan.luongnguyen@vn.bosch.com
- **User:** Tri
- **Domain:** aoscloud.io

### Certificates
- **OEM Certificate:** `~/.aos/security/aos-user-oem.p12` ✅
- **SP Certificate:** `~/.aos/security/aos-user-sp.p12` ✅
- **Created:** February 4-12, 2026

### VM Access
- **Default Username:** `root`
- **Default Password:** `Password1`
- **SELinux:** Permissive (set on each boot)
- **DNS:** 8.8.8.8, 1.1.1.1

---

## Signal Flow Architecture

```
┌─────────────────────────────────────────────────────────┐
│ End ECU Simulator (Python - localhost)                 │
│ Simulates: TargetTemp, Display, Seat Ventilation       │
└──────────────────┬──────────────────────────────────────┘
                   │ gRPC
                   ▼
┌─────────────────────────────────────────────────────────┐
│ Zonal Unit - main VM (localhost:8139)                  │
│                                                          │
│ ┌────────────────────┐      ┌──────────────────────┐   │
│ │ KUKSA Databroker   │◄─────│ Signal Writer        │   │
│ │ Port: 55556        │      │ (AOS service)        │   │
│ │                    │      │ Writes: Speed, SoC,  │   │
│ │ Stores signals     │      │ AmbientTemp          │   │
│ └──────┬─────────────┘      └──────────────────────┘   │
└────────┼────────────────────────────────────────────────┘
         │ KUKSA Bridge (Python - syncs signals)
         ▼
┌─────────────────────────────────────────────────────────┐
│ HPC Unit - main VM (localhost:8289)                    │
│                                                          │
│ ┌────────────────────┐      ┌──────────────────────┐   │
│ │ KUKSA Databroker   │◄─────│ EV Range Extender    │   │
│ │ Port: 55555        │      │ (AOS service)        │   │
│ │                    │      │ Reads: SoC           │   │
│ │ All signals        │      │ Writes: Range,       │   │
│ │                    │      │ Lights, SeatHeat     │   │
│ └──────┬─────────────┘      └──────────────────────┘   │
│        │                                                │
│        │                    ┌──────────────────────┐   │
│        └───────────────────►│ Signal Reporter      │   │
│                              │ (AOS service)        │   │
│                              │ Subscribes to all    │   │
│                              │ 9 signals            │   │
│                              └──────┬───────────────┘   │
└─────────────────────────────────────┼───────────────────┘
                                      │ HTTP POST
                                      ▼
                   ┌──────────────────────────────────┐
                   │ aos-broadcaster (localhost:9100) │
                   │ Signal Relay                     │
                   └──────────┬───────────────────────┘
                              │ Socket.IO
                              ▼
                   ┌──────────────────────────────────┐
                   │ Dashboard (localhost:3012)       │
                   │ Live vehicle signal visualization│
                   └──────────────────────────────────┘
```

---

## Vehicle Signals (VSS Paths)

### Zonal Domain Signals
| Signal Path | Source | Update Rate |
|-------------|--------|-------------|
| `Vehicle.Speed` | Signal Writer | 2s |
| `Vehicle.Powertrain.TractionBattery.StateOfCharge.Current` | Signal Writer | 2s |
| `Vehicle.Cabin.HVAC.AmbientAirTemperature` | Signal Writer | 2s |
| `Vehicle.Cabin.HVAC.TargetTemperature` | End Simulator | 5s |
| `Vehicle.Infotainment.Display.Brightness` | End Simulator | 5s |
| `Vehicle.Cabin.Seat.VentilationLevel` | End Simulator | 5s |

### HPC Domain Signals (Computed/Actuated)
| Signal Path | Source | Purpose |
|-------------|--------|---------|
| `Vehicle.Powertrain.Range` | EV Range Extender | Remaining range in km |
| `Vehicle.Cabin.Lights.AmbientLight.Intensity` | EV Range Extender | 30% (low battery) or 100% |
| `Vehicle.Cabin.Seat.Heating` | EV Range Extender | 0 (off) or 1 (on) |

---

## Troubleshooting

### Common Issues

#### 1. VM Clock Reset
**Symptom:** Services fail after reboot, TLS errors  
**Cause:** Raspberry Pi 5 / VMs have no RTC battery  
**Fix:**
```bash
sshpass -p 'Password1' ssh -p <PORT> root@localhost \
  "date -s '2026-05-04 12:00:00' && \
   systemctl restart aos-communicationmanager aos-servicemanager"
```

#### 2. SELinux Blocking Services
**Symptom:** `crun` can't start containers  
**Cause:** SELinux Enforcing mode  
**Fix:**
```bash
sshpass -p 'Password1' ssh -p <PORT> root@localhost \
  "setenforce 0 && echo SELinux=\$(getenforce)"
```
**Note:** Must be run after each VM reboot.

#### 3. DNS Resolution Failed
**Symptom:** Can't download packages, `nslookup` fails  
**Fix:**
```bash
sshpass -p 'Password1' ssh -p <PORT> root@localhost \
  "mount -o remount,rw / && \
   mkdir -p /etc/systemd/resolved.conf.d && \
   printf '[Resolve]\nDNS=8.8.8.8 1.1.1.1\n' > \
     /etc/systemd/resolved.conf.d/public-dns.conf && \
   systemctl restart systemd-resolved"
```

#### 4. KUKSA Connection Refused
**Symptom:** C++ service can't connect to KUKSA  
**Check:**
```bash
sshpass -p 'Password1' ssh -p <PORT> root@localhost \
  "systemctl status kuksa-databroker && \
   netstat -tlnp | grep 5555"
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] Both VMs running (`VBoxManage list runningvms`)
- [ ] Both units provisioned in AosCloud
- [ ] KUKSA running on both main VMs (ports 55555, 55556)
- [ ] aos-broadcaster running with SP certificate
- [ ] Deployment UI accessible (http://localhost:3011)

### Service Creation (AosCloud)
- [ ] Signal Writer service created (SP account)
- [ ] EV Range Extender service created (SP account)
- [ ] Signal Reporter service created (SP account)
- [ ] All services have correct resource quotas

### Subject Assignment (AosCloud)
- [ ] HPC subject created (OEM account)
- [ ] Zonal subject created (OEM account)
- [ ] HPC-Unit assigned to HPC subject
- [ ] Zonal-Unit assigned to Zonal subject
- [ ] Services assigned to appropriate subjects

### Deployment
- [ ] Signal Writer deployed to Zonal-Unit
- [ ] EV Range Extender deployed to HPC-Unit
- [ ] Signal Reporter deployed to HPC-Unit
- [ ] All services status: "ready"
- [ ] Service logs show no errors

### Verification
- [ ] KUKSA bridge syncing signals
- [ ] End simulator publishing data
- [ ] Signal Reporter relaying to broadcaster
- [ ] Dashboard shows live signals
- [ ] EV Range Extender switching modes at 20% SoC

---

## Next Steps

1. **Create Services in AosCloud** (SP account)
   - Define resource quotas
   - Note Service UUIDs

2. **Create Subjects** (OEM account)
   - Create HPC subject
   - Create Zonal subject
   - Assign services to subjects

3. **Assign Units to Subjects**
   - HPC-Unit → HPC subject
   - Zonal-Unit → Zonal subject

4. **Deploy via Deployment UI**
   - Select preset
   - Choose target unit
   - Click "Build & Deploy"
   - Monitor deployment progress

5. **Start Support Services**
   - KUKSA bridge (Python)
   - End simulator (Python)
   - Dashboard (React app on :3012)

6. **Monitor & Test**
   - Check service logs in AosCloud
   - Verify signal flow in dashboard
   - Test EV Range Extender mode switching

---

## References

- AosCloud OEM Portal: https://oem.aoscloud.io
- AosCloud SP Portal: https://sp.aoscloud.io
- AosEdge Documentation: https://docs.aosedge.tech
- KUKSA Databroker: https://github.com/eclipse-kuksa/kuksa-databroker
- Eclipse SDV: https://sdv.eclipse.org

---

## Appendix: Resource Requirements

### Service Resource Quotas

**Signal Writer:**
```yaml
quotas:
  cpu: 1000        # 1 CPU core
  mem: 10MB
  storage: 5MB
  state: 512KB
```

**EV Range Extender:**
```yaml
quotas:
  cpu: 1000        # 1 CPU core
  mem: 10MB
  storage: 5MB
  state: 512KB
```

**Signal Reporter:**
```yaml
quotas:
  cpu: 1000        # 1 CPU core
  mem: 10MB
  storage: 5MB
  state: 512KB
```

### VM Specifications
- **CPU:** 1 vCPU per VM
- **RAM:** ~512MB per VM
- **Disk:** 2GB per VM
- **Network:** NAT Network (VirtualBox)

---

*Document created: May 4, 2026*  
*Last updated: May 4, 2026*  
*Author: Claude Code Assistant*
