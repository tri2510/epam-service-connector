# EPAM Service Connector for AosCloud

This repository contains two main components:

1. **[Eclipse SDV Blueprint Demo](sdv-blueprint/README.md)** — Full vehicle signal flow demo with EV Range Extender use case
2. **[EPAM Service Connector](service/)** — Connector service for executing Python code from playground.digital.auto on AOS units

![Architecture](docs/sdv-blueprint-architecture-full.png)

---

## Eclipse SDV Blueprint

End-to-end demonstration across HPC, Zonal, and End vehicle nodes with live dashboard.

**[Complete Setup Guide →](sdv-blueprint/README.md)**

### Current Deployment

| Service | Version | Target | Status |
|---|---|---|---|
| Signal Writer | v1.0.10 | Zonal Unit (36647) | **RUNNING** |
| EV Range Extender | v1.0.15 | HPC Unit (36651) | **RUNNING** |
| Signal Reporter | v1.0.15 | HPC Unit (36651) | **RUNNING** |

### Quick Reference

| Component | Access |
|---|---|
| Web Apps | http://localhost:3010 (Dashboard + Deployment) |
| Signal Relay | http://localhost:9100/signals |
| AosCloud OEM | https://oem.aoscloud.io |
| AosCloud SP | https://sp.aoscloud.io |

### Documentation

| Doc | Purpose |
|---|---|
| [SDV Blueprint Guide](sdv-blueprint/README.md) | Complete from-scratch setup |
| [AosCloud Setup](docs/AOSCLOUD_SETUP.md) | Services, subjects, units, API reference |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Known issues and solutions |

---

## EPAM Service Connector

Connects AOS edge units to [playground.digital.auto](https://playground.digital.auto) for remote Python code execution.

### Setup

1. Create unit and service on AosCloud ([Quick start](https://docs.aosedge.tech/docs/quick-start/))
2. Update `service/meta/config.yaml` with your service ID
3. Update `service/src/app/syncer.py` with a unique runtime name
4. Sign and upload:

```bash
cd service
aos-signer sign
aos-signer upload
```

5. Test at [playground.digital.auto](https://playground.digital.auto/model/67d275636e5b6c002746bf4f/library/prototype/6810400bf7ffb78147e4a882/code)

### Hints

- VirtualBox 7.1.x recommended (7.2.x has [a known bug](https://github.com/VirtualBox/virtualbox/issues/271))
- Corporate proxy may interfere with AosCloud connections
- Service requires `aos-pylibs-layer` uploaded to AosCloud Layers tab
- Download layer from [aosedge/meta-aos-vm releases](https://github.com/aosedge/meta-aos-vm/releases)
