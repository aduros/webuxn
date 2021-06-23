export async function run (wasmBuffer, romBuffer, bgCanvas) {
    // Main canvas
    const bgCtx = bgCanvas.getContext("2d");
    const bgImageData = bgCtx.createImageData(bgCanvas.width, bgCanvas.height);

    // Overlay canvas
    const fgCanvas = document.createElement("canvas");
    fgCanvas.width = bgCanvas.width;
    fgCanvas.height = bgCanvas.height;
    const fgCtx = fgCanvas.getContext("2d");
    const fgImageData = fgCtx.createImageData(fgCanvas.width, fgCanvas.height);

    // Mutable state
    let lineBuffer = "";
    let keys = 0;
    let vmState;

    const { instance: wasm } = await WebAssembly.instantiate(wasmBuffer, {
        env: {
            printChar,
            printStr,
            render,
            getDateTime,
        },
    });

    function printChar (c) {
        if (c == 10) {
            console.log(lineBuffer);
            lineBuffer = "";
        } else {
            lineBuffer += String.fromCharCode(c);
        }
    }

    function printStr (ptr) {
        const memory = new Uint8Array(wasm.exports.memory.buffer);
        while (memory[ptr] != 0) {
            printChar(memory[ptr++]);
        }
    }

    function render (bgPtr, fgPtr) {
        const size = bgCanvas.width*bgCanvas.height*4;
        const bgPixels = new Uint8Array(wasm.exports.memory.buffer, bgPtr, size);
        const fgPixels = new Uint8Array(wasm.exports.memory.buffer, fgPtr, size);

        bgImageData.data.set(bgPixels);
        bgCtx.putImageData(bgImageData, 0, 0);

        fgImageData.data.set(fgPixels);
        fgCtx.putImageData(fgImageData, 0, 0);

        // Composite foreground with alpha blending
        bgCtx.drawImage(fgCanvas, 0, 0);
    }

    function getDateTime (datPtr) {
        const dat = new DataView(wasm.exports.memory.buffer, datPtr, 16);
        const now = new Date();
        dat.setUint16(0x0, now.getFullYear());
        dat.setUint8(0x2, now.getMonth());
        dat.setUint8(0x3, now.getDay());
        dat.setUint8(0x4, now.getHours());
        dat.setUint8(0x5, now.getMinutes());
        dat.setUint8(0x6, now.getSeconds());
        dat.setUint8(0x7, now.getDay());

        // TODO(2021-06-11): Implement day-of-year and DST flag
        dat.setUint16(0x08, 0);
        dat.setUint8(0xa, 0);
    }

    function onPointerEvent (event) {
        // Do certain things that require a user gesture
        if (event.type == "pointerdown") {
            if (document.fullscreenElement == null && event.pointerType == "touch") {
                // Go fullscreen on mobile
                bgCanvas.requestFullscreen({navigationUI: "hide"});
            }
            if (audioCtx.state == "suspended") {
                // Try to resume audio
                audioCtx.resume();
            }
        }

        // FIXME(2021-06-10): mouse coords incorrect when in fullscreen
        const bounds = bgCanvas.getBoundingClientRect();
        const x = bgCanvas.width * (event.clientX - bounds.left) / bounds.width;
        const y = bgCanvas.height * (event.clientY - bounds.top) / bounds.height;
        wasm.exports.onPointerEvent(x, y, event.buttons);
        event.preventDefault();
    }
    bgCanvas.addEventListener("pointermove", onPointerEvent);
    bgCanvas.addEventListener("pointerdown", onPointerEvent);
    bgCanvas.addEventListener("pointerup", onPointerEvent);

    bgCanvas.addEventListener("wheel", event => {
        wasm.exports.onWheelEvent(event.deltaY);
        event.preventDefault();
    });

    // Prevent right click context menu
    bgCanvas.addEventListener("contextmenu", event => {
        event.preventDefault();
    });

    function onKeyboardEvent (event) {
        event.preventDefault();

        // Handle special emulator keys
        if (event.type == "keydown") {
            switch (event.keyCode) {
            case 113: // F2
                vmState = saveState();
                return;
            case 115: // F4
                if (vmState != null) {
                    loadState(vmState);
                }
                return;
            case 116: // F5
                boot();
                return;
            }
        }

        let mask = 0;
        switch (event.keyCode) {
        case 17: // Control
            mask = 0x01;
            break;
        case 18: // Alt
            mask = 0x02;
            break;
        case 16: // Shift
            mask = 0x04;
            break;
        case 27: // Escape
            mask = 0x08;
            break;
        case 38: // Up
            mask = 0x10;
            break;
        case 40: // Down
            mask = 0x20;
            break;
        case 37: // Left
            mask = 0x40;
            break;
        case 39: // Right
            mask = 0x80;
            break;
        }
        let charCode = 0;
        if (event.type == "keydown") {
            keys |= mask;
            if (event.key.length == 1) {
                charCode = event.key.charCodeAt(0);
            } else if (mask == 0 && event.keyCode < 20) {
                charCode = event.keyCode;
            }
        } else {
            keys &= ~mask;
        }
        wasm.exports.onKeyboardEvent(keys, charCode);
    }
    window.addEventListener("keydown", onKeyboardEvent);
    window.addEventListener("keyup", onKeyboardEvent);

    // Gamepad handling
    let gamepadIdx = -1;
    window.addEventListener("gamepadconnected", event => {
        const gamepad = event.gamepad;
        if (gamepad.mapping == "standard") {
            gamepadIdx = gamepad.index;
        }
    });
    window.addEventListener("gamepaddisconnected", event => {
        gamepadIdx = -1;
    });
    function updateGamepad () {
        if (gamepadIdx >= 0) {
            const gamepad = navigator.getGamepads()[gamepadIdx];
            const buttons = gamepad.buttons;

            // https://w3c.github.io/gamepad/#remapping
            let gamepadKeys = 0;
            if (buttons[0].pressed) {
                gamepadKeys |= 0x01; // Control
            }
            if (buttons[1].pressed) {
                gamepadKeys |= 0x02; // Alt
            }
            if (buttons[2].pressed) {
                gamepadKeys |= 0x04; // Shift
            }
            if (buttons[8].pressed || buttons[9].pressed) {
                gamepadKeys |= 0x08; // Escape
            }
            if (buttons[12].pressed) {
                gamepadKeys |= 0x10; // Up
            }
            if (buttons[13].pressed) {
                gamepadKeys |= 0x20; // Down
            }
            if (buttons[14].pressed) {
                gamepadKeys |= 0x40; // Left
            }
            if (buttons[15].pressed) {
                gamepadKeys |= 0x80; // Right
            }

            if (keys != gamepadKeys) {
                keys = gamepadKeys;
                wasm.exports.onKeyboardEvent(keys, 0);
            }
        }
    }

    function boot () {
        // Initialize
        wasm.exports.init();

        // Load the ROM
        const memory = new Uint8Array(wasm.exports.memory.buffer);
        const romBufferLength = Math.min(romBuffer.byteLength, 0x10000 - 0x0100);
        memory.set(new Uint8Array(romBuffer, 0, romBufferLength), wasm.exports.getRomPtr());

        // Execute it
        wasm.exports.runMain();
        if (lineBuffer) {
            printChar(10);
        }
    }
    boot();

    // State saving and loading
    function saveState () {
        const memory = new Uint8Array(wasm.exports.memory.buffer);
        const ptr = wasm.exports.getStatePtr();
        const size = wasm.exports.getStateSize();
        return memory.slice(ptr, ptr+size);
    }
    function loadState (state) {
        const memory = new Uint8Array(wasm.exports.memory.buffer);
        const ptr = wasm.exports.getStatePtr();
        memory.set(state, ptr);
    }

    // Audio handling
    const audioCtx = new AudioContext();
    const chunkSize = 1024;
    const processor = audioCtx.createScriptProcessor(chunkSize, 0, 2);
    processor.onaudioprocess = event => {
        const samplesPtr = wasm.exports.getAudioSamples();
        const samples = new Float32Array(wasm.exports.memory.buffer, samplesPtr, 2*chunkSize);
        const audioBuffer = event.outputBuffer;
        audioBuffer.copyToChannel(samples, 0);
        audioBuffer.copyToChannel(samples.subarray(chunkSize), 1);
    };
    processor.connect(audioCtx.destination);

    // Update every frame
    function update () {
        updateGamepad();
        wasm.exports.onUpdate();
        requestAnimationFrame(update);
    }
    update();
}
