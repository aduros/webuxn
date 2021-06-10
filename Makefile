# Build-time dependencies
CC = emcc
WASM_OPT = "$(EMSDK)/upstream/bin/wasm-opt"
ROLLUP = npx rollup
TERSER = npx terser

BUILD_DIR ?= ./build
SRC_DIRS ?= ./src

RELEASE=1
ifeq ($(RELEASE),1)
	OPT_FLAGS = -O2
else
	OPT_FLAGS = -g4 --source-map-base "http://0.0.0.0:7001/build/" # -s DEMANGLE_SUPPORT=1
endif
LDFLAGS = $(OPT_FLAGS) --no-entry -s WASM=1 -s ERROR_ON_UNDEFINED_SYMBOLS=0
CFLAGS ?= $(INC_FLAGS) -MMD -MP $(OPT_FLAGS) -W -Wall -Wextra

SRCS := $(shell find $(SRC_DIRS) -name "*.c")
OBJS := $(SRCS:%=$(BUILD_DIR)/%.o)
DEPS := $(OBJS:.o=.d)

INC_DIRS := $(shell find $(SRC_DIRS) -type d)
INC_FLAGS := $(addprefix -I,$(INC_DIRS))

all: $(BUILD_DIR)/webuxn.wasm $(BUILD_DIR)/webuxn.min.js

$(BUILD_DIR)/webuxn.wasm: $(OBJS)
	$(CC) $(OBJS) -o $@ $(LDFLAGS)
ifeq ($(RELEASE),1)
	$(WASM_OPT) -O4 $@ -o $@.opt
	mv $@.opt $@
endif

$(BUILD_DIR)/%.wat: $(BUILD_DIR)/%.wasm
	$(WASM_DIS) $< -o $@

$(BUILD_DIR)/%.c.o: %.c
	mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD_DIR)/%.min.js: %.js
	$(ROLLUP) $< --format iife --output.name webuxn | $(TERSER) --compress --mangle > $@

.PHONY: clean

clean:
	$(RM) -r $(BUILD_DIR)

-include $(DEPS)
