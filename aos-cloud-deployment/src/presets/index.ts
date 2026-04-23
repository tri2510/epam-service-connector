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

  kuksaGrpcApp: {
    name: 'KUKSA gRPC App (Direct)',
    appName: 'kuksa-grpc-app',
    description: 'Vehicle signal app using gRPC — connects directly to KUKSA Databroker, no bridge needed',
    cpp: `#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include <cstdlib>
#include <vector>

#include <grpcpp/grpcpp.h>
#include "kuksa/val/v1/val.grpc.pb.h"
#include "kuksa/val/v1/types.pb.h"

#define VERSION "1.0.0"

static std::string get_signal(kuksa::val::v1::VAL::Stub* stub,
                              const std::string& path) {
    kuksa::val::v1::GetRequest request;
    auto* entry = request.add_entries();
    entry->set_path(path);
    entry->set_view(kuksa::val::v1::VIEW_CURRENT_VALUE);
    entry->add_fields(kuksa::val::v1::FIELD_VALUE);

    kuksa::val::v1::GetResponse response;
    grpc::ClientContext context;
    auto status = stub->Get(&context, request, &response);

    if (!status.ok()) return "(error: " + status.error_message() + ")";
    if (response.entries_size() == 0) return "N/A";

    const auto& dp = response.entries(0).value();
    switch (dp.value_case()) {
        case kuksa::val::v1::Datapoint::kFloat:  return std::to_string(dp.float_());
        case kuksa::val::v1::Datapoint::kDouble: return std::to_string(dp.double_());
        case kuksa::val::v1::Datapoint::kInt32:  return std::to_string(dp.int32());
        case kuksa::val::v1::Datapoint::kUint32: return std::to_string(dp.uint32());
        case kuksa::val::v1::Datapoint::kBool:   return dp.bool_() ? "true" : "false";
        case kuksa::val::v1::Datapoint::kString: return dp.string();
        default: return "N/A";
    }
}

int main(int argc, char* argv[]) {
    // Default databroker address. Inside crun containers, use the host IP
    // (not localhost) since containers have isolated networking.
    // Override via KUKSA_DATABROKER_ADDR env or command line arg.
    std::string target = "10.0.0.100:55555";
    int interval = 3;

    if (auto t = std::getenv("KUKSA_DATABROKER_ADDR")) target = t;
    if (auto i = std::getenv("POLL_INTERVAL"))         interval = std::atoi(i);
    if (argc > 1) target   = argv[1];
    if (argc > 2) interval = std::atoi(argv[2]);

    std::cout << "========================================"  << std::endl;
    std::cout << "  KUKSA Vehicle Signal App (gRPC)"        << std::endl;
    std::cout << "  Version:    " << VERSION                 << std::endl;
    std::cout << "  Databroker: " << target                  << std::endl;
    std::cout << "  Interval:   " << interval << "s"         << std::endl;
    std::cout << "  Direct gRPC - no bridge needed!"         << std::endl;
    std::cout << "========================================"  << std::endl;
    std::cout.flush();

    auto channel = grpc::CreateChannel(target, grpc::InsecureChannelCredentials());
    auto stub = kuksa::val::v1::VAL::NewStub(channel);

    for (int r = 1; r <= 30; r++) {
        kuksa::val::v1::GetServerInfoRequest req;
        kuksa::val::v1::GetServerInfoResponse resp;
        grpc::ClientContext ctx;
        ctx.set_deadline(std::chrono::system_clock::now() + std::chrono::seconds(3));
        auto st = stub->GetServerInfo(&ctx, req, &resp);
        if (st.ok()) {
            std::cout << "[KUKSA] Connected to " << resp.name()
                      << " " << resp.version() << std::endl;
            break;
        }
        if (r == 30) std::cerr << "[KUKSA] Unreachable: " << target << std::endl;
        std::cout << "[KUKSA] Waiting (" << r << "/30)..." << std::endl;
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
        std::cout << std::endl << "--- Cycle " << cycle << " ---" << std::endl;
        for (const auto& sig : signals) {
            std::cout << "  " << sig << " = " << get_signal(stub.get(), sig) << std::endl;
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
    arch: x86_64
    sign_pkcs12: aos-user-sp.p12
    symlinks: copy

publish:
    url: aoscloud.io
    service_uid: c0528145-b393-44c6-aeaa-b26bc560acee
    tls_pkcs12: aos-user-sp.p12
    version: "4.0.0"

configuration:
    cmd: /kuksa-grpc-app
    workingDir: '/'
    state:
        filename: default_state.dat
        required: true
    instances:
        minInstances: 1
        priority: 0
    isResourceLimits: true
    requestedResources:
        cpu: 2000
        ram: 50MB
        storage: 25MB
        state: 512KB
    quotas:
        cpu: 2000
        mem: 50MB
        state: 512KB
        storage: 25MB`
  }
}
