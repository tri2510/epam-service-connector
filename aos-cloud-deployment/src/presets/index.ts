// Copyright (c) 2026 Eclipse Foundation.
// 
// This program and the accompanying materials are made available under the
// terms of the MIT License which is available at
// https://opensource.org/licenses/MIT.
//
// SPDX-License-Identifier: MIT

// Preset examples for AOS Cloud Deployment Plugin

export const PRESETS = {
  helloAos: {
    name: 'Hello AOS',
    appName: 'hello-aos',
    description: 'Simple hello world application',
    cpp: `#include <iostream>
#include <thread>
#include <chrono>

#define VERSION "1.0.0"

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "AosEdge Hello Service" << std::endl;
    std::cout << "Version: " << VERSION << std::endl;
    std::cout << "Deployed via aos-edge-toolchain!" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout.flush();

    int count = 0;
    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(10));
        count++;
        std::cout << "[" << count << "] Hello from AosEdge! v" << VERSION << std::endl;
        std::cout.flush();
    }

    return 0;
}`,
    yaml: `publisher:
    author: "developer@example.com"
    company: "Example Corp"

build:
    os: linux
    arch: aarch64
    sign_pkcs12: aos-user-sp.p12
    symlinks: copy

publish:
    url: aoscloud.io
    service_uid: c0528145-b393-44c6-aeaa-b26bc560acee
    tls_pkcs12: aos-user-sp.p12
    version: "1.0.0"

configuration:
    cmd: /hello-aos
    workingDir: '/'
    state:
        filename: default_state.dat
        required: true
    instances:
        minInstances: 1
        priority: 0
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
        storage: 5MB`
  },

  kuksaVehicleApp: {
    name: 'KUKSA Vehicle App',
    appName: 'kuksa-vehicle-app',
    description: 'Vehicle signal app using Eclipse KUKSA databroker',
    cpp: `#include <iostream>
#include <string>
#include <cstring>
#include <cstdlib>
#include <vector>
#include <thread>
#include <chrono>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#define VERSION "1.0.0"

// ── Configuration ──────────────────────────────────────────────
// KUKSA REST bridge host (IP address — DNS won't work with static linking).
// Change this to the IP where kuksa-docker/start-kuksa.sh is running.
static const char* DEFAULT_HOST = "10.0.0.1";
static const int   DEFAULT_PORT = 8888;
static const int   DEFAULT_INTERVAL = 3;   // seconds between polls

// ── Minimal HTTP client (POSIX sockets, no external libs) ─────
std::string http_get(const std::string& host, int port, const std::string& path) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return "";

    struct timeval tv{5, 0};
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    struct sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port   = htons(port);
    if (inet_pton(AF_INET, host.c_str(), &addr.sin_addr) != 1) {
        close(sock);
        return "";
    }
    if (connect(sock, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        close(sock);
        return "";
    }

    std::string req = "GET " + path + " HTTP/1.0\\r\\nHost: " + host + "\\r\\n\\r\\n";
    send(sock, req.c_str(), req.size(), 0);

    std::string resp;
    char buf[4096];
    int n;
    while ((n = recv(sock, buf, sizeof(buf) - 1, 0)) > 0) {
        buf[n] = 0;
        resp += buf;
    }
    close(sock);

    auto pos = resp.find("\\r\\n\\r\\n");
    return pos != std::string::npos ? resp.substr(pos + 4) : "";
}

// ── Tiny JSON value extractor (flat objects only) ─────────────
std::string json_val(const std::string& json, const std::string& key) {
    auto kpos = json.find(key);
    if (kpos == std::string::npos) return "";
    auto cpos = json.find(':', kpos + key.size());
    if (cpos == std::string::npos) return "";
    cpos++;
    while (cpos < json.size() && json[cpos] == ' ') cpos++;
    if (cpos < json.size() && json[cpos] == '"') {
        cpos++;
        auto end = json.find('"', cpos);
        return end != std::string::npos ? json.substr(cpos, end - cpos) : "";
    }
    auto end = json.find_first_of(",}", cpos);
    return end != std::string::npos ? json.substr(cpos, end - cpos) : json.substr(cpos);
}

int main(int argc, char* argv[]) {
    std::string host = DEFAULT_HOST;
    int port     = DEFAULT_PORT;
    int interval = DEFAULT_INTERVAL;

    if (auto h = std::getenv("KUKSA_BRIDGE_HOST")) host     = h;
    if (auto p = std::getenv("KUKSA_BRIDGE_PORT"))  port     = std::atoi(p);
    if (auto i = std::getenv("POLL_INTERVAL"))      interval = std::atoi(i);
    if (argc > 1) host     = argv[1];
    if (argc > 2) port     = std::atoi(argv[2]);
    if (argc > 3) interval = std::atoi(argv[3]);

    std::cout << "========================================" << std::endl;
    std::cout << "  KUKSA Vehicle Signal App" << std::endl;
    std::cout << "  Version:  " << VERSION << std::endl;
    std::cout << "  Bridge:   " << host << ":" << port << std::endl;
    std::cout << "  Interval: " << interval << "s" << std::endl;
    std::cout << "  Deployed via aos-edge-toolchain!" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout.flush();

    // Wait for bridge to become reachable
    for (int r = 1; r <= 30; r++) {
        auto h = http_get(host, port, "/api/v1/health");
        if (!h.empty() && h.find("ok") != std::string::npos) {
            std::cout << "[KUKSA] Bridge connected" << std::endl;
            break;
        }
        if (r == 30) {
            std::cerr << "[KUKSA] Bridge unreachable at "
                      << host << ":" << port << std::endl;
        }
        std::cout << "[KUKSA] Waiting for bridge (" << r << "/30)..." << std::endl;
        std::cout.flush();
        std::this_thread::sleep_for(std::chrono::seconds(2));
    }

    std::vector<std::string> signals = {
        "Vehicle.Speed",
        "Vehicle.Cabin.HVAC.AmbientAirTemperature",
        "Vehicle.Powertrain.TractionBattery.StateOfCharge.Current"
    };

    int cycle = 0;
    while (true) {
        cycle++;
        std::cout << "\\n--- Cycle " << cycle << " ---" << std::endl;
        for (const auto& sig : signals) {
            auto body = http_get(host, port, "/api/v1/signals/" + sig);
            if (!body.empty()) {
                auto val = json_val(body, "value");
                std::cout << "  " << sig << " = " << val << std::endl;
            } else {
                std::cout << "  " << sig << " = (unavailable)" << std::endl;
            }
        }
        std::cout.flush();
        std::this_thread::sleep_for(std::chrono::seconds(interval));
    }
    return 0;
}`,
    yaml: `publisher:
    author: "developer@example.com"
    company: "Example Corp"

build:
    os: linux
    arch: aarch64
    sign_pkcs12: aos-user-sp.p12
    symlinks: copy

publish:
    url: aoscloud.io
    service_uid: c0528145-b393-44c6-aeaa-b26bc560acee
    tls_pkcs12: aos-user-sp.p12
    version: "1.0.0"

configuration:
    cmd: /kuksa-vehicle-app
    workingDir: '/'
    state:
        filename: default_state.dat
        required: true
    instances:
        minInstances: 1
        priority: 0
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
        storage: 5MB`
  }
}
