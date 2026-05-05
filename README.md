# EPAM Service Connector for AosCloud

This repository contains two main components:

1. **Eclipse SDV Blueprint Demo** (`/sdv-blueprint`) - Full vehicle signal flow demo with EV Range Extender use case
2. **EPAM Service Connector** (`/service`) - Connector service for executing Python code from playground.digital.auto on AOS units

---

## Quick Start

### For Eclipse SDV Blueprint Deployment

**Full guide:** [sdv-blueprint/README.md](sdv-blueprint/README.md)

**Deployed Services:**
- Signal Writer v1.0.9 → Zonal-Unit (writes Speed, SoC, Temperature) - **RUNNING**
- EV Range Extender v1.0.10 → HPC-Unit (battery management, power-saving mode) - **UPLOADED**
- Signal Reporter v1.0.10 → HPC-Unit (relays signals to dashboard) - **UPLOADED**

**Documentation:**
- [C++ Deployment Log](docs/CPP_DEPLOYMENT_LOG.md) - Complete build & deployment process
- [Created Services](docs/CREATED_SERVICES.md) - Service UUIDs and IDs
- [Bridge Status](docs/BRIDGE_STATUS.md) - KUKSA bridge connection details
- [Deployment Guide](docs/SDV_BLUEPRINT_DEPLOYMENT_GUIDE.md) - VM setup and architecture
- [**Troubleshooting Guide**](docs/TROUBLESHOOTING.md) - **Common errors and solutions**

**Quick Deploy:**
```bash
# Option 1: Use enhanced builder image (recommended)
cd aos-edge-toolchain
docker build -f Dockerfile.builder -t aos-edge-toolchain:builder .
docker run --rm -v $(pwd)/../sdv-blueprint:/workspace/sdv-blueprint \
    aos-edge-toolchain:builder bash -c "cd /workspace/sdv-blueprint && make all"

# Option 2: Install build tools in running container
docker exec aos-broadcaster bash < aos-edge-toolchain/setup-build-env.sh
docker exec aos-broadcaster bash -c "cd /workspace/sdv-blueprint && make all"

# Deploy via aos-broadcaster container (see CPP_DEPLOYMENT_LOG.md)
```

**Note:** Base `aos-edge-toolchain` image does NOT include C++ build tools. Use builder image or run setup script.

---

## EPAM Service Connector

This guidance aims to setup a service on EPAM unit to receive python code from playground.digital.auto and execute code.

## Folder struture
```bash
- service                       // this folder for the connector service
    - meta
        - config.yaml           // service config file
    - src
        - app
            - syncer.py         // this is the main app to connect between unit and plsyground.digital.auto.
            - ...
```

# Installation

## Step 1: Create unit and service on AOS Edge website

Follow this guide and create the Aos service: [AosEdge Quick start](https://docs.aosedge.tech/docs/quick-start/)

Output: you will get a `service ID`

Here are some hints to get you started with Aos solutions:

1. If using virtualbox, the version 7.1.6 is recommended. There is a [bug](https://github.com/VirtualBox/virtualbox/issues/271) in version 7.2.x which makes it unsuitable for AosCore.

1. Be aware that if the unit is created behind a corporate proxy, it may interfere with connection to AosCloud.

1. When creating a service in AosCloud, reserve at least the amount of resources given by `meta/config.yaml`.

   e.g. 
   ```yaml
       # Quotas assigned to service
       quotas:
           cpu: 10000
           mem: 100MB
           state: 128KB
           storage: 20MB
           # upload_speed: 1MB
           # download_speed: 1MB
           # upload: 512MB
           # download: 512MB
           temp: 128KB
   ```
   ![Service resources](assets/images/01_epam_service_resource.png)

1. This service has dependency to "aos-pylibs-layer". This layer must be uploaded to AosCloud Layers tab.
   
   You can download the latest version from the layer from [here](https://github.com/aosedge/meta-aos-vm/releases).

   e.g. aos-pylibs-layer-genericx86-64-1.0.0.tar.gz

   ![Layers tab](assets/images/02_layer.png)

1. download `unitconfig.json` from the release page in previous step.
   
   create a new Target System and paste the json contents there.

   ![Target systems](assets/images/03_target_system.png)

1. After all the steps as in the official Aos Quick Start, make sure of the following:
   1. Unit is `Online`
   2. Service status is `ready`
   3. In the Unit Details, Subject/Service status is `Installed`

1. Finally fetch the `system id` from the `UUID` of the `Services` tab
   
   ![service id](assets/images/04_service_id.png)

## Step 2: 
Go to file: service/meta/config.yaml, line 19, change `service_id` to `service ID`

## Step 3
Go to file: service/src/app/syncer.py, line 25, change DEFAULT_RUNTIME_NAME = 'EPAM-SERVICE-001' to a another unique name.
```python
# set a secret name
DEFAULT_RUNTIME_NAME = 'EPAM-ANHB-81'
```

## Step 4: sign and publish your service
```bash
cd service
aos-signer sign
aos-signer upload
```

Then wait for service deploy to unit. It take a few minutes.

---

## Common Errors and Solutions

### Error: "can't run any instances of service: job finished with status=failed"

**Symptom:** Service uploaded successfully to AosCloud but fails to run on the unit. Shows `status=failed` in unit logs.

**Root Cause:** Service binary is dynamically linked and requires shared libraries (e.g., libgrpc++, libprotobuf) that are not available in the minimal AOS container environment.

**Solution:**

#### Option 1: Build Static Binaries (Recommended for C++ services)

Edit the Makefile and add `-static` flag:

```makefile
CXXFLAGS := -std=c++17 -O2 -static
```

**Note:** Static linking with gRPC++ can be complex. You may need to install static library versions:
```bash
apt install -y libgrpc++-dev libprotobuf-dev:native
```

Then rebuild:
```bash
make clean && make all
```

Verify the binary is static:
```bash
ldd build/signal-writer
# Should output: "not a dynamic executable"
```

#### Option 2: Use Python Services (Easier)

Python services work out-of-the-box because the AOS Python layer includes all dependencies.

For SDV Blueprint, Python versions are available in `/sdv-blueprint/`:
- `signal-writer.py` (instead of C++ signal-writer)
- `signal-reporter/reporter.py` (instead of C++ signal-reporter)

**Deploy Python service:**
```bash
# Update config.yaml to use Python entry point
configuration:
    cmd: python3
    args: ["/signal-writer.py"]
```

#### Option 3: Bundle Dependencies in Service Package

Include required .so files in your service package and set LD_LIBRARY_PATH.

**Not recommended** - increases package size significantly.

---

### Error: Architecture Mismatch

**Symptom:** Binary runs on host but fails in VM

**Solution:** Ensure service YAML matches VM architecture:
```yaml
build:
    arch: x86_64  # or aarch64 for ARM
```

Check VM architecture:
```bash
ssh root@<vm-ip> "uname -m"
```

---

# Step 5: Test with existing prototype
Go to playground.digital.auto perform below action:
1. Register and Login(if you don't have account yet)
2. Test with existing prototype.
   2.1 Goto this prototype:
   https://playground.digital.auto/model/67d275636e5b6c002746bf4f/library/prototype/6810400bf7ffb78147e4a882/code

   2.2 Expand terminal panel
   ![image](https://bewebstudio.digitalauto.tech/data/projects/ih1XKDE24yRM/expland_terminal.png)

   2.3 Click 'Add runtime' (only do this action one time)
    ![image](https://bewebstudio.digitalauto.tech/data/projects/ih1XKDE24yRM/add_runtime.png)

   2.4 Enter your runtime name, format: Runtime-{your_unique runtime name}
    => As above config: it is: `Runtime-EPAM-ANHB-81`, then click add and close dialog.
   ![image](https://bewebstudio.digitalauto.tech/data/projects/ih1XKDE24yRM/set_runtime_name.png)

   2.5 When the runtime list reload, pick your runtime. Then click run button to execute the code on aos unit.
   2.6 Switch to dashboard to see the result.
   
# Step 6: Test with your own prototype   
1. Create e vehicle model(if you don't have any) with VSS v4.1
2. Create a prototype
3. Go to tab Code: learn from step 5 code, modify it for your purpose
4. Execute new code with your runtime selected
