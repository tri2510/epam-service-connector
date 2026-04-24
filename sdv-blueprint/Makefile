# Eclipse SDV Blueprint — Build C++ presets locally
#
# Prerequisites:
#   apt install -y protobuf-compiler libgrpc++-dev libprotobuf-dev
#   (or equivalent for your distro)
#
# Usage:
#   make protos          # download KUKSA proto files
#   make all             # build all presets
#   make signal-writer   # build one preset
#   make clean           # remove build artefacts

KUKSA_PROTO_REPO  := https://raw.githubusercontent.com/eclipse-kuksa/kuksa-databroker/main/proto
PROTO_DIR         := generated
CXX               := g++
CXXFLAGS          := -std=c++17 -O2
GRPC_FLAGS        := $(shell pkg-config --cflags --libs grpc++ protobuf 2>/dev/null || echo "-lgrpc++ -lprotobuf") -lpthread
PROTOC            := protoc
GRPC_PLUGIN       := $(shell which grpc_cpp_plugin 2>/dev/null || echo /usr/bin/grpc_cpp_plugin)

TARGETS := signal-writer ev-range-extender signal-reporter

.PHONY: all clean protos

all: protos $(TARGETS)

# ── Download KUKSA proto files ───────────────────────────────────────

protos: $(PROTO_DIR)/kuksa/val/v1/types.pb.cc $(PROTO_DIR)/kuksa/val/v1/val.pb.cc

$(PROTO_DIR)/kuksa/val/v1/%.proto:
	@mkdir -p $(PROTO_DIR)/kuksa/val/v1
	curl -sfL $(KUKSA_PROTO_REPO)/kuksa/val/v1/$*.proto -o $@

$(PROTO_DIR)/kuksa/val/v1/types.pb.cc: $(PROTO_DIR)/kuksa/val/v1/types.proto
	$(PROTOC) --proto_path=$(PROTO_DIR) \
	  --cpp_out=$(PROTO_DIR) \
	  --grpc_out=$(PROTO_DIR) \
	  --plugin=protoc-gen-grpc=$(GRPC_PLUGIN) \
	  $<

# grpc stubs are produced as a side effect of the protoc invocation above
$(PROTO_DIR)/kuksa/val/v1/types.grpc.pb.cc: $(PROTO_DIR)/kuksa/val/v1/types.pb.cc
	@true

$(PROTO_DIR)/kuksa/val/v1/val.pb.cc: $(PROTO_DIR)/kuksa/val/v1/val.proto $(PROTO_DIR)/kuksa/val/v1/types.pb.cc
	$(PROTOC) --proto_path=$(PROTO_DIR) \
	  --cpp_out=$(PROTO_DIR) \
	  --grpc_out=$(PROTO_DIR) \
	  --plugin=protoc-gen-grpc=$(GRPC_PLUGIN) \
	  $<

$(PROTO_DIR)/kuksa/val/v1/val.grpc.pb.cc: $(PROTO_DIR)/kuksa/val/v1/val.pb.cc
	@true

# ── Proto object files ──────────────────────────────────────────────

PROTO_SRCS := $(PROTO_DIR)/kuksa/val/v1/types.pb.cc \
              $(PROTO_DIR)/kuksa/val/v1/types.grpc.pb.cc \
              $(PROTO_DIR)/kuksa/val/v1/val.pb.cc \
              $(PROTO_DIR)/kuksa/val/v1/val.grpc.pb.cc

# ── Build targets ───────────────────────────────────────────────────

signal-writer: presets/signal-writer.cpp $(PROTO_SRCS)
	$(CXX) $(CXXFLAGS) -I$(PROTO_DIR) $^ $(GRPC_FLAGS) -o $@

ev-range-extender: presets/ev-range-extender.cpp $(PROTO_SRCS)
	$(CXX) $(CXXFLAGS) -I$(PROTO_DIR) $^ $(GRPC_FLAGS) -o $@

signal-reporter: presets/signal-reporter.cpp $(PROTO_SRCS)
	$(CXX) $(CXXFLAGS) -I$(PROTO_DIR) $^ $(GRPC_FLAGS) -o $@

# ── Clean ───────────────────────────────────────────────────────────

clean:
	rm -rf $(PROTO_DIR) $(TARGETS)
