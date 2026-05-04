# AosCloud Services - Created

Services created in AosCloud for Eclipse SDV Blueprint deployment.

**Created:** May 4, 2026  
**Service Provider:** SP nhan.luongnguyen@vn.bosch.com (ID: 377)  
**Created By:** User 92266

---

## Service 1: Signal Writer - Zonal Domain

**Service Details:**
- **UUID:** `242a46c7-f237-40e3-a37e-40529a39bf85`
- **Service ID:** 67064
- **Title:** Signal Writer - Zonal Domain
- **Description:** Writes vehicle sensor data (Speed, SoC, AmbientTemp) to KUKSA Databroker on Zonal node

**Resource Quotas:**
```json
{
  "cpu_limit": 1000,
  "cpu_dmips_limit": 1000,
  "memory_limit": 10000,
  "storage_disk_limit": 5000,
  "state_disk_limit": 512
}
```

**Target Deployment:**
- **Unit:** Zonal-Unit (36647)
- **Node:** main
- **KUKSA Port:** 55556

**AosCloud URL:**
```
https://sp.aoscloud.io/sp/services/67064
```

---

## Service 2: EV Range Extender - HPC Domain

**Service Details:**
- **UUID:** `bb539aaa-682c-4a35-b492-19abed3118ff`
- **Service ID:** 67065
- **Title:** EV Range Extender - HPC Domain
- **Description:** Battery management, range computation, and power-saving mode control for HPC node

**Resource Quotas:**
```json
{
  "cpu_limit": 1000,
  "cpu_dmips_limit": 1000,
  "memory_limit": 10000,
  "storage_disk_limit": 5000,
  "state_disk_limit": 512
}
```

**Target Deployment:**
- **Unit:** HPC-Unit (36646)
- **Node:** main
- **KUKSA Port:** 55555

**AosCloud URL:**
```
https://sp.aoscloud.io/sp/services/67065
```

---

## Service 3: Signal Reporter - Dashboard Relay

**Service Details:**
- **UUID:** `242dd4d4-7236-432d-88b9-ba9bbb3288f8`
- **Service ID:** 67066
- **Title:** Signal Reporter - Dashboard Relay
- **Description:** Subscribes to all vehicle signals and relays them to dashboard via HTTP

**Resource Quotas:**
```json
{
  "cpu_limit": 1000,
  "cpu_dmips_limit": 1000,
  "memory_limit": 10000,
  "storage_disk_limit": 5000,
  "state_disk_limit": 512
}
```

**Target Deployment:**
- **Unit:** HPC-Unit (36646)
- **Node:** main
- **KUKSA Port:** 55555
- **Relay:** HTTP POST to broadcaster:9100

**AosCloud URL:**
```
https://sp.aoscloud.io/sp/services/67066
```

---

## Quick Reference

| Service Name | UUID | Service ID | Target Unit |
|--------------|------|------------|-------------|
| Signal Writer | 242a46c7-f237-40e3-a37e-40529a39bf85 | 67064 | Zonal-Unit (36647) |
| EV Range Extender | bb539aaa-682c-4a35-b492-19abed3118ff | 67065 | HPC-Unit (36646) |
| Signal Reporter | 242dd4d4-7236-432d-88b9-ba9bbb3288f8 | 67066 | HPC-Unit (36646) |

---

## Update Service Config Files

Update the following files with the service UUIDs:

### 1. Signal Writer Config
**File:** `/sdv-blueprint/presets/signal-writer.yaml`

```yaml
publish:
  url: aoscloud.io
  service_uid: 242a46c7-f237-40e3-a37e-40529a39bf85  # ← UPDATE THIS
  tls_pkcs12: aos-user-sp.p12
  version: "1.0.0"
```

### 2. EV Range Extender Config
**File:** `/sdv-blueprint/presets/ev-range-extender.yaml`

```yaml
publish:
  url: aoscloud.io
  service_uid: bb539aaa-682c-4a35-b492-19abed3118ff  # ← UPDATE THIS
  tls_pkcs12: aos-user-sp.p12
  version: "1.0.0"
```

### 3. Signal Reporter Config
**File:** `/sdv-blueprint/presets/signal-reporter.yaml`

```yaml
publish:
  url: aoscloud.io
  service_uid: 242dd4d4-7236-432d-88b9-ba9bbb3288f8  # ← UPDATE THIS
  tls_pkcs12: aos-user-sp.p12
  version: "1.0.0"
```

---

## Next Steps

### 1. Create Subjects in AosCloud (OEM Portal)

Login to: https://oem.aoscloud.io

**Create HPC Subject:**
```
Name: hpc-subject
Description: HPC computing node for EV Range Extender and Signal Reporter
Services: 
  - EV Range Extender (67065)
  - Signal Reporter (67066)
Units:
  - HPC-Unit (36646)
```

**Create Zonal Subject:**
```
Name: zonal-subject
Description: Zonal controller node for Signal Writer
Services:
  - Signal Writer (67064)
Units:
  - Zonal-Unit (36647)
```

### 2. Deploy Services via Deployment UI

Open: http://localhost:3011/standalone.html

1. Connect to broadcaster: `AET-TOOLCHAIN-001`
2. Select preset: **Signal Writer**
3. Update config with UUID: `242a46c7-f237-40e3-a37e-40529a39bf85`
4. Click **Build & Deploy**
5. Repeat for EV Range Extender and Signal Reporter

---

## Verification

After deployment, verify in AosCloud:

- [ ] Services show version 1.0.0
- [ ] Units show services as "Installed"
- [ ] Service logs are accessible
- [ ] Services status: "ready"

---

*Document created: May 4, 2026*
