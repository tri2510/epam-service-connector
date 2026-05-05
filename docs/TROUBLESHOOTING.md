# Troubleshooting Guide - AosCloud Service Deployment

## Error: "can't run any instances of service: job finished with status=failed"

**Location:** AosCloud OEM Portal → Units → Unit Details → Service Status

**Full Error Message:**
```
can't run any instances of service: job finished with status=failed (systemdconn.cpp:336)
[github.com/aosedge/aos_communicationmanager/unitstatushandler.(*softwareManager).checkNewServices:942]
```

---

### Root Cause

The C++ service binary is **dynamically linked** and requires shared libraries that are not available in the minimal AOS container runtime environment.

**Verification:**
```bash
# Check if binary is dynamic
ldd build/signal-writer

# Dynamic binary shows output like:
linux-vdso.so.1 => (0x00007ffc95fdc000)
libgrpc++.so.1.51 => /lib/x86_64-linux-gnu/libgrpc++.so.1.51
libprotobuf.so.32 => /lib/x86_64-linux-gnu/libprotobuf.so.32
...

# Static binary shows:
not a dynamic executable
```

---

### Solutions

## Solution 1: Use Python Services (RECOMMENDED - Easiest)

Python services work out-of-the-box because the `aos-pylibs-layer` includes all required dependencies.

### For SDV Blueprint

Replace C++ services with Python equivalents:

**Signal Writer:**
- File: `/sdv-blueprint/signal-writer.py`
- Update `/sdv-blueprint/presets/signal-writer.yaml`:

```yaml
configuration:
    cmd: python3
    args: ["/signal-writer.py"]
    env:
        KUKSA_DATABROKER_ADDR: "10.0.0.100:55556"
```

**Signal Reporter:**
- File: `/sdv-blueprint/signal-reporter/reporter.py`
- Update `/sdv-blueprint/presets/signal-reporter.yaml`:

```yaml
configuration:
    cmd: python3
    args: ["/reporter.py"]
    env:
        KUKSA_DATABROKER_ADDR: "10.0.0.100:55555"
        RELAY_URL: "http://10.0.0.1:9100"
```

**Deploy Python Service:**
```bash
# In broadcaster container
cd /workspace
rm -rf src meta service.tar.gz
mkdir -p src meta

# Copy Python script instead of binary
cp /workspace/sdv-blueprint/signal-writer.py src/signal-writer.py

# Copy updated config
cp /workspace/sdv-blueprint/presets/signal-writer.yaml meta/config.yaml

# Create empty state file
touch meta/default_state.dat

# Sign and upload
/usr/local/bin/aos-toolkit.sh sign
/usr/local/bin/aos-toolkit.sh upload
```

---

## Solution 2: Build Static C++ Binaries (COMPLEX)

Static linking with gRPC++ is complex and requires static library versions.

### Install Static Libraries

```bash
# Inside aos-broadcaster container
apt install -y \
    libc-ares-dev:native \
    libssl-dev:native \
    zlib1g-dev:native \
    libre2-dev:native
```

### Update Makefile

```makefile
CXXFLAGS := -std=c++17 -O2 -static -static-libgcc -static-libstdc++
LDFLAGS  := -static -Wl,--whole-archive -lpthread -Wl,--no-whole-archive
```

### Build

```bash
cd /workspace/sdv-blueprint
make clean
make all
```

### Verify Static Binary

```bash
ldd build/signal-writer
# Should output: "not a dynamic executable"

file build/signal-writer
# Should show: "statically linked"
```

**Known Issues:**
- `cannot find -lcares` - Install `libc-ares-dev` static version
- Linker errors - gRPC++ static linking is notoriously difficult
- Large binary size - static binaries are 5-10x larger

---

## Solution 3: Create Service Layer with Dependencies

Package required .so files with your service.

**Not recommended** - increases complexity and package size significantly.

---

## Verification After Fix

### 1. Check Service Logs on VM

```bash
# SSH to unit
ssh -p 8139 root@localhost

# Check service manager logs
journalctl -u aos-servicemanager --no-pager -n 100 | grep -i signal-writer

# Check if service is running
ps | grep signal-writer
```

### 2. Check in AosCloud OEM Portal

Navigate to: **Units** → **Your Unit** → **Services** tab

**Expected Status:**
- Service: Signal Writer v1.0.1
- Status: **Running** ✅ (not "failed")
- Instances: 1/1

### 3. Test Service Functionality

```bash
# For Signal Writer - verify it's writing to KUKSA
ssh -p 8139 root@localhost "
    echo 'Checking KUKSA signals...'
    # Monitor KUKSA for new values (if kuksa-client available)
"
```

---

## Additional Common Errors

### Error: "Quota storage_disk_limit exceeds service quota"

**Solution:** Reduce resource quotas in YAML to match AosCloud service limits

```yaml
requestedResources:
    storage: 5MB      # Match AosCloud service quota
quotas:
    storage: 5MB      # Must match
```

### Error: "version already presented"

**Solution:** Bump version number

```yaml
publish:
    version: "1.0.2"  # Increment from 1.0.1
```

### Error: Architecture mismatch

**Symptom:** Binary works on host but not in VM

**Solution:** Verify YAML architecture matches VM:

```bash
# Check VM architecture
ssh root@<vm-ip> "uname -m"

# Update YAML to match
build:
    arch: x86_64    # or aarch64
```

---

## Prevention

### For New C++ Services

**Option A: Start with Python**
- Faster development
- No compilation issues
- Built-in dependency management

**Option B: Use Static Build from Start**
- Set up proper static build environment
- Test binary with `ldd` before deployment
- Keep binaries small (<5MB if possible)

### Test Locally First

```bash
# Test binary can execute in minimal environment
docker run --rm -v $(pwd)/build:/app alpine:latest /app/signal-writer --help

# Should fail with "not found" errors if dynamically linked
```

---

## Quick Reference

| Issue | Root Cause | Fix |
|-------|------------|-----|
| `job finished with status=failed` | Dynamic binary, missing .so files | Use Python or rebuild static |
| Binary not found | Wrong path in config.yaml | Check `cmd:` matches binary name |
| Permission denied | Binary not executable | `chmod +x` before packaging |
| Quota exceeded | YAML requests > AosCloud limits | Reduce quotas in YAML |
| Version exists | Uploading same version twice | Increment version number |

---

## Error: "No auth token provided"

**Symptom:** Service connects to KUKSA but fails with gRPC error code 16

**Error Message:**
```
[Writer] Retry 1/15 failed: 16 - No auth token provided
```

**Root Cause:** KUKSA Databroker is configured with JWT authentication, but the service is connecting without providing an auth token.

**Solution:** Configure KUKSA Databroker to run in insecure mode (no authentication):

```bash
# Edit KUKSA systemd override
cat > /etc/systemd/system/kuksa-databroker.service.d/override.conf << 'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/databroker --vss /usr/share/vss/vss.json --address=0.0.0.0 --port 55556 --insecure
EOF

# Reload and restart
systemctl daemon-reload
systemctl restart kuksa-databroker
```

**Verify:**
```bash
systemctl status kuksa-databroker
# Should show: "Authorization is not enabled."
```

---

**Last Updated:** May 4, 2026  
**Tested With:** AosCloud v10 API, aos-servicemanager, VirtualBox 7.1.6, KUKSA Databroker 0.5.0

---

## Error: "failed to start unit [Operation not permitted]" - Network Configuration Issue

**Symptom:** Service uploaded successfully but fails to start with:
```
can't run any instances of service: failed to start unit [Operation not permitted]
```

**Root Cause:** Service is configured with wrong KUKSA Databroker address. AOS containers cannot reach VM network addresses (e.g., `10.0.0.100`) directly. They must use the Docker bridge gateway IP `172.17.0.1` to access host services.

**Verification:**
Check service logs for connection errors:
```bash
# In AosCloud OEM Portal, check service logs
# Or SSH to unit:
ssh root@<vm-ip>
journalctl -u aos-servicemanager | grep -E "signal-writer|ev-range|signal-reporter"
```

**Solution:**

Add environment variable to service YAML configuration:

```yaml
configuration:
    cmd: /your-service-binary
    workingDir: '/'
    env:
        - "KUKSA_DATABROKER_ADDR=172.17.0.1:<port>"
    # ... rest of config
```

**Port mapping:**
- Zonal KUKSA: `172.17.0.1:55556`
- HPC KUKSA: `172.17.0.1:55555`

**Example - Signal Writer (Zonal):**
```yaml
env:
    - "KUKSA_DATABROKER_ADDR=172.17.0.1:55556"
```

**Example - EV Range Extender (HPC):**
```yaml
env:
    - "KUKSA_DATABROKER_ADDR=172.17.0.1:55555"
```

**Example - Signal Reporter (HPC + Relay):**
```yaml
env:
    - "KUKSA_DATABROKER_ADDR=172.17.0.1:55555"
    - "SIGNAL_RELAY_URL=10.0.0.1:9100"
```

After updating YAML:
1. Increment version number in `publish:` section
2. Rebuild and redeploy service to AosCloud
3. Verify service starts successfully

---

**Last Updated:** May 5, 2026  
**Tested With:** AosCloud v10 API, aos-servicemanager, KUKSA Databroker 0.5.0
