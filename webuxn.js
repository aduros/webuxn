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

    const { instance: wasm } = await WebAssembly.instantiate(wasmBuffer, {
        env: {
            printChar,
            printStr,
            render,
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

    function render (bg, fg) {
        const size = bgCanvas.width*bgCanvas.height*4;
        const bgPixels = new Uint8Array(wasm.exports.memory.buffer, bg, size);
        const fgPixels = new Uint8Array(wasm.exports.memory.buffer, fg, size);

        bgImageData.data.set(bgPixels);
        bgCtx.putImageData(bgImageData, 0, 0);

        fgImageData.data.set(fgPixels);
        fgCtx.putImageData(fgImageData, 0, 0);

        // Composite foreground with alpha blending
        bgCtx.drawImage(fgCanvas, 0, 0);
    }

    function onPointerEvent (event) {
        const bounds = bgCanvas.getBoundingClientRect();
        const x = (event.clientX - bounds.left) * (bgCanvas.width / bounds.width);
        const y = (event.clientY - bounds.top) * (bgCanvas.height / bounds.height);
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
        // event.preventDefault();

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

    // Load the ROM
    const memory = new Uint8Array(wasm.exports.memory.buffer);
    memory.set(new Uint8Array(romBuffer), wasm.exports.getRomPtr());

    // Initialize
    wasm.exports.init();
    if (lineBuffer) {
        printChar(10);
    }

    // Update every frame
    function update () {
        wasm.exports.onUpdate();
        requestAnimationFrame(update);
    }
    update();
}
