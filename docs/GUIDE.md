# AOS Cloud Deployment — Complete Setup Guide

Deploy C++ applications to AosEdge devices from a browser UI.
This guide takes you from a clean machine to a running KUKSA gRPC app on an
AosEdge VM, reading live vehicle signals.

## What you will set up

```
┌──────────────┐     ┌──────────────┐     ┌────────────┐     ┌────────────────┐
│  Standalone   │────▶│  Broadcaster │────▶│  AosCloud   │────▶│  AosEdge VM    │
│  Browser UI   │ WS  │  (Docker)    │ TLS │             │AMQP│  (VirtualBox)  │
│               │     │  compile     │     │  stores     │    │  crun container│
│  Edit C++     │     │  sign        │     │  service    │    │  runs gRPC app │
│  Click Deploy │     │  upload      │     │  versions   │    │  reads signals │
└──────────────┘     └──────────────┘     └────────────┘     └────────────────┘
```

---

## Part 1: Host Setup

### 1.1 System packages

Ubuntu 20.04 / 22.04 / 24.04.

```bash
sudo apt update && sudo apt install -y \
  libnss3-tools ca-certificates python3 python3-venv \
  docker.io sshpass
```

### 1.2 Aos CLI tools

```bash
python3 -m venv ~/.aos/venv
~/.aos/venv/bin/python3 -m pip install --upgrade aos-keys aos-signer aos-prov
~/.aos/venv/bin/python3 -m aos_keys install-root
sudo ~/.aos/scripts/install_aos_root_ca.sh
```

### 1.3 Register on AosEdge

1. Go to https://aosedge.tech/en/sign-up
2. Register as **OEM** — you receive a welcome email with a token
3. Register as **Service Provider (SP)** — separate email with a separate token

Generate certificates:

```bash
# OEM certificate (from OEM welcome email)
~/.aos/venv/bin/python3 -m aos_keys new-user -d aoscloud.io -t <OEM_TOKEN> --oem

# SP certificate (from SP welcome email)
~/.aos/venv/bin/python3 -m aos_keys new-user -d aoscloud.io -t <SP_TOKEN> --sp
```

Verify:

```bash
~/.aos/venv/bin/python3 -m aos_keys info --oem
~/.aos/venv/bin/python3 -m aos_keys info --sp
ls ~/.aos/security/aos-user-oem.p12 ~/.aos/security/aos-user-sp.p12
```

### 1.4 Install VirtualBox

Download from https://www.virtualbox.org/wiki/Downloads or:

```bash
sudo apt install -y virtualbox
```

---

## Part 2: AosEdge VM

### 2.1 Download VM image

```bash
~/.aos/venv/bin/python3 -m aos_prov download
```

### 2.2 Create and start the VM

```bash
~/.aos/venv/bin/python3 -m aos_prov vm-new --name my-aosedge-unit
```

Save the output — you need the **provisioning port** and **SSH port**:

```
Forwarding provisioning port...   8325      <-- PROV_PORT
Forwarding ssh port to main...    8125      <-- SSH_PORT
```

Start with GUI (to see the console):

```bash
VBoxManage startvm main --type gui
VBoxManage startvm secondary-1 --type gui
```

Or headless:

```bash
VBoxManage startvm main --type headless
VBoxManage startvm secondary-1 --type headless
```

Wait ~40 seconds for boot.

### 2.3 Fix DNS

VirtualBox NAT Network DNS doesn't forward external queries. Fix it:

```bash
sshpass -p 'Password1' ssh -p <SSH_PORT> -o StrictHostKeyChecking=no root@localhost \
  "mount -o remount,rw / && \
   mkdir -p /etc/systemd/resolved.conf.d && \
   printf '[Resolve]\nDNS=8.8.8.8 1.1.1.1\n' > /etc/systemd/resolved.conf.d/public-dns.conf && \
   systemctl restart systemd-resolved && \
   nslookup aoscloud.io && echo DNS_OK"
```

### 2.4 Fix SELinux

AosCore VMs ship with SELinux Enforcing, which blocks crun from running
deployed service binaries:

```bash
sshpass -p 'Password1' ssh -p <SSH_PORT> -o StrictHostKeyChecking=no root@localhost \
  "setenforce 0 && echo SELinux=\$(getenforce)"
```

### 2.5 Provision

```bash
~/.aos/venv/bin/python3 -m aos_prov provision \
  -u localhost:<PROV_PORT> --nodes 2 -w 60
```

After provisioning, the unit appears on AosCloud with a URL like
`https://oem.aoscloud.io/oem/units/XXXXX`.

### 2.6 Verify VM is online

```bash
sshpass -p 'Password1' ssh -p <SSH_PORT> -o StrictHostKeyChecking=no root@localhost \
  "journalctl -u aos-communicationmanager --no-pager -n 5"
```

Look for `Start AMQP sender` — this means the VM is connected to AosCloud.

---

## Part 3: AosCloud Setup

Do this on the AosCloud web UI.

### 3.1 Create a service

1. Log in as **SP** at https://sp.aoscloud.io
2. Go to **Services** → click **+**
3. Fill in title (e.g. `my-kuksa-service`), set CPU/RAM/Storage limits
4. Copy the **Service UUID**

### 3.2 Create a subject

1. Log in as **OEM** at https://oem.aoscloud.io
2. Go to **Subjects** → click **+**
3. Enter a label (e.g. `my-subject`)
4. Add the service you created in 3.1

### 3.3 Create a unit-set

1. Go to **Unit-sets** → click **+**
2. Enter a title, set update strategy to **MinimizeRestarts**
3. Enable **Validation set** (auto-deploys new versions)

### 3.4 Assign unit-set and subject to the VM

1. Go to **Units** → find your VM (shows **Online**)
2. Click **manage unit-sets** → select your unit-set → Save
3. Click **assign subject** → select your subject → Save

After this, any service version uploaded to AosCloud will auto-deploy to the VM.

---

## Part 4: Docker Toolchain

### 4.1 Build the Docker image

```bash
cd aos-edge-toolchain
docker build -t aos-edge-toolchain:latest .
```

If behind a corporate proxy:

```bash
docker build \
  --build-arg https_proxy=http://127.0.0.1:3128 \
  --build-arg http_proxy=http://127.0.0.1:3128 \
  --network host \
  -t aos-edge-toolchain:latest .
```

### 4.2 Start the broadcaster

```bash
docker run -d --network host \
  -e INSTANCE_ID=AET-TOOLCHAIN-001 \
  -e INSTANCE_NAME="AOS Edge Toolchain" \
  -e KIT_MANAGER_URL=https://kit.digitalauto.tech \
  -e CERT_FILE=/certs/aos-user-sp.p12 \
  -e AOSCLOUD_URL=https://aoscloud.io:10000 \
  -v ~/.aos/security/aos-user-sp.p12:/certs/aos-user-sp.p12:ro \
  --name aos-broadcaster \
  --entrypoint "node" \
  aos-edge-toolchain:latest /usr/local/bin/aos-broadcaster.js
```

Verify:

```bash
docker logs aos-broadcaster
# Should show: [Broadcaster] Connected to Kit Manager
```

---

## Part 5: Standalone UI

### 5.1 Build and serve

```bash
cd aos-cloud-deployment
npm install
npm run standalone
python3 -m http.server 3011
```

### 5.2 Open and deploy

1. Open **http://localhost:3011/standalone.html**
2. Select **AET-TOOLCHAIN-001** from Docker Instances (left panel)
3. Pick a preset from the dropdown:
   - **Hello AOS** — simple static binary, prints a message every 10s
   - **KUKSA gRPC App** — reads vehicle signals via gRPC from KUKSA Databroker
4. Edit the C++ code or YAML config as needed
5. Click **Build & Deploy**
6. Watch the Build Logs panel (right side)

The broadcaster compiles for the correct architecture (auto-detected from
`config.yaml`), signs with your SP certificate, and uploads to AosCloud.
The VM automatically pulls and runs the new version.

### 5.3 Verify on VM

```bash
sshpass -p 'Password1' ssh -p <SSH_PORT> -o StrictHostKeyChecking=no root@localhost \
  "journalctl -f | grep crun"
```

For Hello AOS you should see:

```
crun[1234]: [1] Hello from AosEdge! v1.0.0
crun[1234]: [2] Hello from AosEdge! v1.0.0
```

---

## Part 6: KUKSA Databroker (vehicle signal testing)

The AosEdge VM comes with a KUKSA Databroker pre-installed at `/usr/bin/databroker`.
The default instance (port 55555) requires TLS. For testing, start a second
insecure instance — one SSH command, no modifications to the VM.

### 6.1 Start insecure databroker on the VM

```bash
sshpass -p 'Password1' ssh -p <SSH_PORT> -o StrictHostKeyChecking=no root@localhost \
  "/usr/bin/databroker --insecure --port 55556 --address 0.0.0.0 --vss /usr/share/vss/vss.json &"
```

### 6.2 Deploy KUKSA gRPC app

In the standalone UI:

1. Select **KUKSA gRPC App** preset
2. The default target is `10.0.0.100:55556` — this reaches the VM's databroker
   from inside the crun container
3. Set a new version number in `config.yaml`
4. Click **Build & Deploy**

### 6.3 Verify gRPC communication

```bash
sshpass -p 'Password1' ssh -p <SSH_PORT> -o StrictHostKeyChecking=no root@localhost \
  "journalctl -f | grep crun"
```

With no signal feeder running, the app shows `N/A` — this confirms gRPC
send/receive works (connected, requests sent, empty responses received):

```
crun[1865]: --- Cycle 5 ---
crun[1865]:   Vehicle.Speed = N/A
crun[1865]:   Vehicle.Cabin.HVAC.AmbientAirTemperature = N/A
crun[1865]:   Vehicle.Powertrain.TractionBattery.StateOfCharge.Current = N/A
```

### 6.4 (Optional) Feed simulated signals from the host

To see real signal values, run a feeder on the host that writes to the VM's
databroker through an SSH tunnel:

```bash
# SSH tunnel: host:55556 → VM:55556
sshpass -p 'Password1' ssh -p <SSH_PORT> -o StrictHostKeyChecking=no \
  -L 55556:127.0.0.1:55556 -f -N root@localhost

# Start feeder (Docker)
docker run -d --name kuksa-feeder --network host \
  -v $(pwd)/kuksa-docker/feeder.py:/feeder.py:ro \
  -e KUKSA_DATABROKER_HOST=127.0.0.1 \
  -e KUKSA_DATABROKER_PORT=55556 \
  -e PYTHONUNBUFFERED=1 \
  python:3.11-slim bash -c "pip install -q kuksa-client && python3 /feeder.py"
```

Now the app shows live values:

```
crun[1865]:   Vehicle.Speed = 41.900002
crun[1865]:   Vehicle.Cabin.HVAC.AmbientAirTemperature = 27.500000
crun[1865]:   Vehicle.Powertrain.TractionBattery.StateOfCharge.Current = 77.400002
```

### Architecture

```
Host (optional)                   VM (VirtualBox)
┌─────────────────┐               ┌──────────────────┐
│ kuksa-feeder    │──SSH tunnel──▶│ databroker:55556  │
│ (Docker)        │  port 55556   │ (pre-installed,   │
│ optional: feeds │               │  started insecure)│
│ simulated data  │               │                    │
└─────────────────┘               │    ┌────────────┐  │
                                  │    │ crun       │  │
                                  │    │ gRPC app   │──┘
                                  │    │ deployed   │   10.0.0.100:55556
                                  │    │ via UI     │
                                  │    └────────────┘
                                  └──────────────────┘
```

---

## VM Management

```bash
# Stop VMs
VBoxManage controlvm main poweroff
VBoxManage controlvm secondary-1 poweroff

# Start VMs
VBoxManage startvm main --type headless
VBoxManage startvm secondary-1 --type headless

# SSH into VM (default: root / Password1)
sshpass -p 'Password1' ssh -p <SSH_PORT> -o StrictHostKeyChecking=no root@localhost

# Delete VM
VBoxManage controlvm main poweroff 2>/dev/null
VBoxManage controlvm secondary-1 poweroff 2>/dev/null
~/.aos/venv/bin/python3 -m aos_prov vm-remove --name my-aosedge-unit

# Full reset (delete + download + create + provision)
~/.aos/venv/bin/python3 -m aos_prov vm-remove --name my-aosedge-unit
~/.aos/venv/bin/python3 -m aos_prov download -f
~/.aos/venv/bin/python3 -m aos_prov vm-new --name my-aosedge-unit
VBoxManage startvm main --type headless && VBoxManage startvm secondary-1 --type headless
# wait 40s, fix DNS + SELinux, then provision
```

## Broadcaster Management

```bash
# View logs
docker logs -f aos-broadcaster

# Restart
docker restart aos-broadcaster

# Stop and remove
docker rm -f aos-broadcaster

# Develop with live-mounted script (no image rebuild needed)
docker run -d --network host \
  -e INSTANCE_ID=AET-TOOLCHAIN-001 \
  -e CERT_FILE=/certs/aos-user-sp.p12 \
  -v ~/.aos/security/aos-user-sp.p12:/certs/aos-user-sp.p12:ro \
  -v $(pwd)/aos-edge-toolchain/scripts/aos-broadcaster.js:/usr/local/bin/aos-broadcaster.js:ro \
  --name aos-broadcaster --entrypoint "node" \
  aos-edge-toolchain:latest /usr/local/bin/aos-broadcaster.js
```

---

## Troubleshooting

### VM won't come online

| Symptom | Cause | Fix |
|---|---|---|
| `lookup aoscloud.io: i/o timeout` | VBox NAT DNS broken | Fix DNS (Part 2.3) |
| Unit shows Offline on AosCloud | DNS or network issue | Check `journalctl -u aos-communicationmanager` on VM |
| `Connection timeout` during provision | VM not booted yet | Wait longer (`-w 120`), check VBox GUI |

### Service won't start on VM

| Symptom | Cause | Fix |
|---|---|---|
| `Key has expired` (runner.cpp:333) | SELinux Enforcing | `setenforce 0` on the VM (Part 2.4) |
| `required file not found` | Dynamic binary missing `ld-linux` | Rebuild Docker image — it bundles `ld-linux` automatically |
| `Connection refused` to databroker | Wrong address or port | Use host IP (`10.0.0.100`) not `localhost` — crun has isolated networking |
| `Socket closed` to databroker | TLS mismatch | Default databroker (port 55555) requires TLS. Use insecure instance on 55556 (Part 6) |
| Service installs but never starts | Version already failed | Deploy a new version number; AosCore won't retry a failed version |

### Broadcaster issues

| Symptom | Cause | Fix |
|---|---|---|
| `xhr poll error` | TLS verification failure | Add `-e NODE_TLS_REJECT_UNAUTHORIZED=0` |
| No Docker instances in UI | Broadcaster not connected | Check `docker logs aos-broadcaster` |
| Build succeeds, upload fails | SP certificate missing | Mount `.p12` with `-v` and set `CERT_FILE` |
| Upload SSL error | Aos Root CA not trusted | Rebuild Docker image (includes `aos-keys install-root`) |

### Corporate proxy

All commands that access the network need proxy env vars if behind a proxy:

```bash
HTTPS_PROXY=http://127.0.0.1:3128 HTTP_PROXY=http://127.0.0.1:3128 <command>
```

For Docker build:

```bash
docker build --build-arg https_proxy=http://127.0.0.1:3128 --network host -t aos-edge-toolchain:latest .
```

For the broadcaster, set proxy in the `docker run` command:

```bash
-e https_proxy=http://127.0.0.1:3128 -e http_proxy=http://127.0.0.1:3128
```

The VM itself needs **direct internet access** to reach `aoscloud.io:9000`.
Corporate proxies that block DNS or direct TCP will prevent the unit from
going online. Use a public network for the VM.

---

## References

- AosEdge docs: https://docs.aosedge.tech/docs/quick-start/
- Aos CLI tools: https://docs.aosedge.tech/docs/how-to/aos-tools/
- KUKSA Databroker: https://github.com/eclipse-kuksa/kuksa-databroker
- VM build from source: https://github.com/aosedge/meta-aos-vm
- VM requirements: 2 GB storage, 8 GB RAM
