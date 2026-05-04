# KUKSA Bridge Status

**Date:** May 4, 2026  
**Status:** ✅ Running

---

## VM Connection Details

### HPC Unit
- **SSH Port Forward:** localhost:8289 → 10.0.0.100:22
- **VM IP:** 10.0.0.100 (on aos-network-hpc-unit)
- **KUKSA Port:** 55555
- **Port Forward:** localhost:55555 → 10.0.0.100:55555
- **Credentials:** root / Password1

### Zonal Unit
- **SSH Port Forward:** localhost:8139 → 10.0.0.100:22
- **VM IP:** 10.0.0.100 (on aos-network-zonal-unit)  
- **KUKSA Port:** 55556
- **Port Forward:** localhost:55556 → 10.0.0.100:55556
- **Credentials:** root / Password1

---

## KUKSA Bridge

**Process:** Running (PID 137157)

**Configuration:**
```bash
ZONAL_KUKSA_ADDR=localhost:55556
HPC_KUKSA_ADDR=localhost:55555
python3 kuksa-bridge.py
```

**Signals Bridged:**
1. Vehicle.Speed
2. Vehicle.Powertrain.TractionBattery.StateOfCharge.Current
3. Vehicle.Cabin.HVAC.AmbientAirTemperature
4. Vehicle.Cabin.HVAC.TargetTemperature
5. Vehicle.Infotainment.Display.Brightness
6. Vehicle.Cabin.Seat.VentilationLevel

**Port Connectivity:**
- ✅ localhost:55555 (HPC KUKSA) - Reachable
- ✅ localhost:55556 (Zonal KUKSA) - Reachable

---

## Next Steps

### 1. Verify Services Deployed to VMs

Check in AosCloud OEM Portal:
- **Units** → **HPC-Unit** → Services tab
  - Expected: EV Range Extender (67065) - Status: Running
  - Expected: Signal Reporter (67066) - Status: Running

- **Units** → **Zonal-Unit** → Services tab
  - Expected: Signal Writer (67064) - Status: Running

### 2. Check Service Logs (once deployed)

Via AosCloud OEM Portal:
- Navigate to Unit → Services → Select service → View Logs

Or via SSH:
```bash
# HPC Unit
ssh -p 8289 root@localhost
journalctl -u aos-servicemanager --no-pager | tail -50

# Zonal Unit
ssh -p 8139 root@localhost
journalctl -u aos-servicemanager --no-pager | tail -50
```

### 3. Start End Simulator (after services are running)

```bash
cd /home/htr1hc/01_PJNE/20_Jayanta/PR\ review/epam-service-connector/sdv-blueprint/end-simulator
python3 simulator.py --kuksa localhost:55556
```

### 4. Start Dashboard

```bash
cd /home/htr1hc/01_PJNE/20_Jayanta/PR\ review/epam-service-connector/sdv-blueprint/dashboard
npm install
npm run standalone:dev
```

Open: http://localhost:3012

---

## Troubleshooting

### Stop/Restart Bridge

```bash
# Stop
kill $(cat /tmp/kuksa-bridge.pid)

# Start
cd /home/htr1hc/01_PJNE/20_Jayanta/PR\ review/epam-service-connector/sdv-blueprint/kuksa-sync
ZONAL_KUKSA_ADDR=localhost:55556 HPC_KUKSA_ADDR=localhost:55555 python3 kuksa-bridge.py &
```

### Check Bridge Activity

```bash
ps aux | grep kuksa-bridge
netstat -tulpn | grep -E "55555|55556"
```

---

**Bridge Started:** May 4, 2026 14:37 UTC
