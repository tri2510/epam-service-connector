# AosCloud Services Configuration

Services to create in AosCloud for Eclipse SDV Blueprint deployment.

---

## Service List Summary

| # | Service Name | Target Unit | Node | Purpose |
|---|--------------|-------------|------|---------|
| 1 | **signal-writer** | Zonal-Unit (36647) | main | Write Speed, SoC, Temperature to KUKSA |
| 2 | **ev-range-extender** | HPC-Unit (36646) | main | Compute range, manage power modes |
| 3 | **signal-reporter** | HPC-Unit (36646) | main | Relay signals to dashboard |

---

## 1. Signal Writer Service

### Service Details
- **Service Name:** `signal-writer`
- **Title:** Signal Writer - Zonal Domain
- **Description:** Writes vehicle sensor data (Speed, SoC, AmbientTemp) to KUKSA Databroker
- **Target Unit:** Zonal-Unit (36647)
- **KUKSA Port:** 55556

### Source Files
- **C++ Source:** `/sdv-blueprint/presets/signal-writer.cpp`
- **Config:** `/sdv-blueprint/presets/signal-writer.yaml`

### Resource Quotas
```yaml
quotas:
  cpu: 1000           # 1 CPU core (1000 = 1.0 core)
  mem: 10MB           # 10 megabytes RAM
  storage: 5MB        # 5 megabytes disk
  state: 512KB        # 512 kilobytes state storage
  temp: 128KB         # 128 kilobytes temp storage
```

### Service Configuration (from signal-writer.yaml)
```yaml
publisher:
  author: "Eclipse Foundation"
  company: "Eclipse SDV"

build:
  os: linux
  arch: aarch64
  sign_pkcs12: aos-user-sp.p12
  symlinks: copy

publish:
  url: aoscloud.io
  service_uid: <SERVICE-UUID-FROM-AOSCLOUD>
  tls_pkcs12: aos-user-sp.p12
  version: "1.0.0"

configuration:
  cmd: /signal-writer
  workingDir: /
  state:
    filename: default_state.dat
    required: false
  instances:
    minInstances: 1
    priority: 100
  isResourceLimits: true
  requestedResources:
    cpu: 1000
    ram: 10MB
    storage: 5MB
    state: 512KB
  quotas:
    cpu: 1000
    mem: 10MB
    state: 512KB
    storage: 5MB
    temp: 128KB
```

### Environment Variables
```bash
KUKSA_DATABROKER_ADDR=localhost:55556
UPDATE_INTERVAL=2
```

### Functionality
Writes three signals every 2 seconds:
- `Vehicle.Speed`: Oscillates 10-70 km/h (sine wave)
- `Vehicle.Powertrain.TractionBattery.StateOfCharge.Current`: Decreases from 80%
- `Vehicle.Cabin.HVAC.AmbientAirTemperature`: 22°C ±5°C (sine wave)

---

## 2. EV Range Extender Service

### Service Details
- **Service Name:** `ev-range-extender`
- **Title:** EV Range Extender - HPC Domain
- **Description:** Battery management, range computation, and power-saving mode control
- **Target Unit:** HPC-Unit (36646)
- **KUKSA Port:** 55555

### Source Files
- **C++ Source:** `/sdv-blueprint/presets/ev-range-extender.cpp`
- **Config:** `/sdv-blueprint/presets/ev-range-extender.yaml`

### Resource Quotas
```yaml
quotas:
  cpu: 1000           # 1 CPU core
  mem: 10MB           # 10 megabytes RAM
  storage: 5MB        # 5 megabytes disk
  state: 512KB        # 512 kilobytes state storage
  temp: 128KB         # 128 kilobytes temp storage
```

### Service Configuration (from ev-range-extender.yaml)
```yaml
publisher:
  author: "Eclipse Foundation"
  company: "Eclipse SDV"

build:
  os: linux
  arch: aarch64
  sign_pkcs12: aos-user-sp.p12
  symlinks: copy

publish:
  url: aoscloud.io
  service_uid: <SERVICE-UUID-FROM-AOSCLOUD>
  tls_pkcs12: aos-user-sp.p12
  version: "1.0.0"

configuration:
  cmd: /ev-range-extender
  workingDir: /
  state:
    filename: default_state.dat
    required: false
  instances:
    minInstances: 1
    priority: 100
  isResourceLimits: true
  requestedResources:
    cpu: 1000
    ram: 10MB
    storage: 5MB
    state: 512KB
  quotas:
    cpu: 1000
    mem: 10MB
    state: 512KB
    storage: 5MB
    temp: 128KB
```

### Environment Variables
```bash
KUKSA_DATABROKER_ADDR=localhost:55555
CHECK_INTERVAL=2
```

### Functionality
Every 2 seconds:
1. **Read:** `Vehicle.Powertrain.TractionBattery.StateOfCharge.Current`
2. **Decision Logic:**
   - If SoC < 20%: Enter POWER_SAVE mode
   - If SoC ≥ 20%: Enter NORMAL mode
3. **POWER_SAVE mode:**
   - Set `Vehicle.Cabin.Lights.AmbientLight.Intensity = 30` (dimmed)
   - Set `Vehicle.Cabin.Seat.Heating = 0` (off)
   - Compute `Vehicle.Powertrain.Range = SoC × 4.0` km (degraded efficiency)
4. **NORMAL mode:**
   - Set `Vehicle.Cabin.Lights.AmbientLight.Intensity = 100` (full)
   - Set `Vehicle.Cabin.Seat.Heating = 1` (on)
   - Compute `Vehicle.Powertrain.Range = SoC × 5.5` km (normal efficiency)

---

## 3. Signal Reporter Service

### Service Details
- **Service Name:** `signal-reporter`
- **Title:** Signal Reporter - Dashboard Relay
- **Description:** Subscribes to all vehicle signals and relays them to the dashboard via HTTP
- **Target Unit:** HPC-Unit (36646)
- **KUKSA Port:** 55555
- **Relay Port:** 9100 (aos-broadcaster)

### Source Files
- **C++ Source:** `/sdv-blueprint/presets/signal-reporter.cpp`
- **Config:** `/sdv-blueprint/presets/signal-reporter.yaml`

### Resource Quotas
```yaml
quotas:
  cpu: 1000           # 1 CPU core
  mem: 10MB           # 10 megabytes RAM
  storage: 5MB        # 5 megabytes disk
  state: 512KB        # 512 kilobytes state storage
  temp: 128KB         # 128 kilobytes temp storage
```

### Service Configuration (from signal-reporter.yaml)
```yaml
publisher:
  author: "Eclipse Foundation"
  company: "Eclipse SDV"

build:
  os: linux
  arch: aarch64
  sign_pkcs12: aos-user-sp.p12
  symlinks: copy

publish:
  url: aoscloud.io
  service_uid: <SERVICE-UUID-FROM-AOSCLOUD>
  tls_pkcs12: aos-user-sp.p12
  version: "1.0.0"

configuration:
  cmd: /signal-reporter
  workingDir: /
  state:
    filename: default_state.dat
    required: false
  instances:
    minInstances: 1
    priority: 100
  isResourceLimits: true
  requestedResources:
    cpu: 1000
    ram: 10MB
    storage: 5MB
    state: 512KB
  quotas:
    cpu: 1000
    mem: 10MB
    state: 512KB
    storage: 5MB
    temp: 128KB
```

### Environment Variables
```bash
HPC_KUKSA_ADDR=localhost:55555
RELAY_HOST=<BROADCASTER-IP>
RELAY_PORT=9100
```

**Note:** `RELAY_HOST` should be set to the IP address accessible from the VM. If the broadcaster is on the host machine, you'll need to use the host IP (not `localhost`).

### Functionality
1. **Subscribe** to 9 vehicle signals on HPC KUKSA:
   - Vehicle.Speed
   - Vehicle.Powertrain.TractionBattery.StateOfCharge.Current
   - Vehicle.Cabin.HVAC.AmbientAirTemperature
   - Vehicle.Cabin.HVAC.TargetTemperature
   - Vehicle.Infotainment.Display.Brightness
   - Vehicle.Cabin.Seat.VentilationLevel
   - Vehicle.Powertrain.Range
   - Vehicle.Cabin.Lights.AmbientLight.Intensity
   - Vehicle.Cabin.Seat.Heating

2. **HTTP POST** each signal update to:
   ```
   http://<RELAY_HOST>:9100/signal
   
   Payload:
   {
     "signal": "Vehicle.Speed",
     "value": 45.2,
     "ts": 1777873968851
   }
   ```

3. **Statistics** printed to stdout (visible in AosCloud service logs):
   - Total signals processed
   - Successful relay count
   - Failed relay count

---

## AosCloud Service Creation Steps

### Step 1: Login to AosCloud SP Portal
- URL: https://sp.aoscloud.io
- Use SP credentials

### Step 2: Create Each Service

For each of the 3 services above:

1. Navigate to **Services** → Click **+ (Add Service)**
2. Fill in:
   - **Title:** (from table above)
   - **Description:** (from table above)
   - **OS:** linux
   - **Architecture:** aarch64
3. Set **Resource Quotas:**
   ```
   CPU Limit: 1000 (dmips)
   CPU DMIPS Limit: 1000
   Memory Limit: 10000 KB (10MB)
   Storage Disk Limit: 5000 KB (5MB)
   State Disk Limit: 512 KB
   ```
4. Click **Create**
5. **Copy the Service UUID** (you'll need this for deployment)

### Step 3: Create Subjects (OEM Portal)
- URL: https://oem.aoscloud.io
- Use OEM credentials

1. Navigate to **Subjects** → Click **+ (Add Subject)**
2. Create two subjects:

   **HPC Subject:**
   - Name: `hpc-subject`
   - Services: ev-range-extender, signal-reporter
   - Units: HPC-Unit (36646)

   **Zonal Subject:**
   - Name: `zonal-subject`
   - Services: signal-writer
   - Units: Zonal-Unit (36647)

---

## Service Deployment Matrix

| Service | Subject | Unit | Node | KUKSA Port |
|---------|---------|------|------|------------|
| signal-writer | zonal-subject | Zonal-Unit (36647) | main | 55556 |
| ev-range-extender | hpc-subject | HPC-Unit (36646) | main | 55555 |
| signal-reporter | hpc-subject | HPC-Unit (36646) | main | 55555 |

---

## Verification Checklist

After creating services in AosCloud:

- [ ] 3 services created in SP portal
- [ ] All service UUIDs copied
- [ ] 2 subjects created in OEM portal
- [ ] Services assigned to subjects
- [ ] Units assigned to subjects
- [ ] Ready to deploy via Deployment UI

---

*Document created: May 4, 2026*  
*Last updated: May 4, 2026*
