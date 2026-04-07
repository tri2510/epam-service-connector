# aos-edge-toolchain - Self-contained Docker image for AosEdge service development
# Base: Ubuntu 24.04 with ARM64 cross-compiler and aos-signer
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV NODE_PATH=/usr/local/lib/node_modules

# Build-time proxy support: pass --build-arg HTTP_PROXY=... when behind a corporate proxy
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy

# Install build tools + ARM64 cross-compiler + Python + Node.js
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    gcc-aarch64-linux-gnu \
    g++-aarch64-linux-gnu \
    wget \
    curl \
    git \
    python3 \
    python3-pip \
    python3-venv \
    jq \
    file \
    openssl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install socket.io-client + proxy agent for Socket.IO through corporate proxy
RUN npm install --global --prefix=/usr/local socket.io-client https-proxy-agent

# Create symlinks for easier access
RUN ln -sf /usr/bin/aarch64-linux-gnu-g++ /usr/local/bin/aarch64-linux-gnu-g++ && \
    ln -sf /usr/bin/aarch64-linux-gnu-gcc /usr/local/bin/aarch64-linux-gnu-gcc

# Install aos-signer + Azure SDK for Key Vault cert retrieval
RUN pip3 install --break-system-packages \
    aos-signer \
    azure-identity \
    azure-keyvault-secrets

# Copy scripts (aos-toolkit.sh, broadcaster.js, init-certs.py and other tools)
COPY scripts/ /usr/local/bin/
RUN chmod +x /usr/local/bin/aos-*.sh /usr/local/bin/aos-broadcaster.js /usr/local/bin/init-certs.py

# Set working directory
WORKDIR /workspace

# Default entrypoint: fetch certs from Key Vault, then run toolkit
# SKIP_INIT_CERTS prevents double-run since toolkit.sh also calls init-certs.py
ENTRYPOINT ["sh", "-c", "python3 /usr/local/bin/init-certs.py && export SKIP_INIT_CERTS=true && exec /usr/local/bin/aos-toolkit.sh \"$@\"", "--"]
CMD ["help"]
