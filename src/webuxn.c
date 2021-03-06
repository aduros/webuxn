#include <emscripten.h>
#include <string.h>

#include "uxn.h"
#include "devices/ppu.h"
#include "devices/apu.h"

extern void printChar (const char c);
extern void printStr (const char* str);
extern void render (const Uint32* bg, const Uint32* fg);
extern void getDateTime (const Uint8* ptr);

typedef struct {
    Uxn uxn;
    Ppu ppu;
    Apu apu[POLYPHONY];
} VMState;

VMState vm;
Device *devscreen, *devmouse, *devctrl, *devmidi, *devaudio0;
Uint8 reqdraw = 0;

Uint32 toAbgr (Uint32 argb) {
    Uint8 b = (argb & 0x000000ff);
    Uint8 g = (argb & 0x0000ff00) >> 8;
    Uint8 r = (argb & 0x00ff0000) >> 16;
    Uint8 a = (argb & 0xff000000) >> 24;
    return (a << 24) | (b << 16) | (g << 8) | r;
}

void system_talk (Device* d, Uint8 b0, Uint8 w) {
    /* printStr("Called system_talk\n"); */

    if(!w) {
        d->dat[0x2] = d->u->wst.ptr;
        d->dat[0x3] = d->u->rst.ptr;
    } else {
        putcolors(&vm.ppu, &d->dat[0x8]);
        reqdraw = 1;
    }
    (void)b0;
}

void
console_talk(Device *d, Uint8 b0, Uint8 w)
{
    if(!w) return;
    switch(b0) {
    case 0x8: printChar(d->dat[0x8]); break;
    // TODO(2021-06-10): Implement number printing
    /* case 0x9: printf("0x%02x", d->dat[0x9]); break; */
    /* case 0xb: printf("0x%04x", mempeek16(d->dat, 0xa)); break; */
    case 0xd: printStr(&d->mem[mempeek16(d->dat, 0xc)]); break;
    }
}

void
screen_talk(Device *d, Uint8 b0, Uint8 w)
{
    if(w && b0 == 0xe) {
        Uint16 x = mempeek16(d->dat, 0x8);
        Uint16 y = mempeek16(d->dat, 0xa);
        Uint8 *addr = &d->mem[mempeek16(d->dat, 0xc)];
        Layer *layer = d->dat[0xe] >> 4 & 0x1 ? &vm.ppu.fg : &vm.ppu.bg;
        Uint8 mode = d->dat[0xe] >> 5;
        if(!mode)
            putpixel(&vm.ppu, layer, x, y, d->dat[0xe] & 0x3);
        else if(mode-- & 0x1)
            puticn(&vm.ppu, layer, x, y, addr, d->dat[0xe] & 0xf, mode & 0x2, mode & 0x4);
        else
            putchr(&vm.ppu, layer, x, y, addr, d->dat[0xe] & 0xf, mode & 0x2, mode & 0x4);
        reqdraw = 1;
    }
}

void audio_talk(Device *d, Uint8 b0, Uint8 w)
{
    Apu *c = &vm.apu[d - devaudio0];
    if(!w) {
        if(b0 == 0x2)
            mempoke16(d->dat, 0x2, c->i);
        else if(b0 == 0x4)
            d->dat[0x4] = apu_get_vu(c);
    } else if(b0 == 0xf) {
        c->len = mempeek16(d->dat, 0xa);
        c->addr = &d->mem[mempeek16(d->dat, 0xc)];
        c->volume[0] = d->dat[0xe] >> 4;
        c->volume[1] = d->dat[0xe] & 0xf;
        c->repeat = !(d->dat[0xf] & 0x80);
        apu_start(c, mempeek16(d->dat, 0x8), d->dat[0xf] & 0x7f);
    }
}

void
datetime_talk(Device *d, Uint8 b0, Uint8 w)
{
    getDateTime(d->dat);
    (void)b0;
    (void)w;
}

void
nil_talk(Device *d, Uint8 b0, Uint8 w)
{
    (void)d;
    (void)b0;
    (void)w;
}

Uint8* EMSCRIPTEN_KEEPALIVE getRomPtr () {
    return vm.uxn.ram.dat + PAGE_PROGRAM;
}

void* EMSCRIPTEN_KEEPALIVE getStatePtr () {
    return &vm;
}

int EMSCRIPTEN_KEEPALIVE getStateSize () {
    return sizeof(vm);
}

float* EMSCRIPTEN_KEEPALIVE getAudioSamples () {
    // Should match chunkSize in webuxn.js, it would be nice to lower this to 512, but that seems to
    // introduce skipping
    const int chunkSize = 1024;

    Sint16 samples[2*chunkSize] = {0};
    for (int ii = 0; ii < POLYPHONY; ++ii) {
        apu_render(&vm.apu[ii], samples, samples + 2*chunkSize);
    }

    // Convert interleaved Sint16 array to uninterleaved float32 array
    static float webAudioSamples[2*chunkSize];
    for (int ii = 0; ii < chunkSize; ++ii) {
        webAudioSamples[ii] = (float)samples[2*ii] / 32767;
        webAudioSamples[ii+chunkSize] = (float)samples[2*ii+1] / 32767;
    }
    return webAudioSamples;
}

void EMSCRIPTEN_KEEPALIVE init () {
    // Reset state
    memset(&vm, 0, sizeof(vm));

    // Statically allocate pixels to avoid depending on malloc
    vm.ppu.width = WIDTH;
    vm.ppu.height = HEIGHT;

    portuxn(&vm.uxn, 0x0, "system", system_talk);
    portuxn(&vm.uxn, 0x1, "console", console_talk);
    devscreen = portuxn(&vm.uxn, 0x2, "screen", screen_talk);
    devaudio0 = portuxn(&vm.uxn, 0x3, "audio0", audio_talk);
    portuxn(&vm.uxn, 0x4, "audio1", audio_talk);
    portuxn(&vm.uxn, 0x5, "audio2", audio_talk);
    portuxn(&vm.uxn, 0x6, "audio3", audio_talk);
    devmidi = portuxn(&vm.uxn, 0x7, "midi", nil_talk);
    devctrl = portuxn(&vm.uxn, 0x8, "controller", nil_talk);
    devmouse = portuxn(&vm.uxn, 0x9, "mouse", nil_talk);
    portuxn(&vm.uxn, 0xa, "file", nil_talk);
    portuxn(&vm.uxn, 0xb, "datetime", datetime_talk);
    portuxn(&vm.uxn, 0xc, "---", nil_talk);
    portuxn(&vm.uxn, 0xd, "---", nil_talk);
    portuxn(&vm.uxn, 0xe, "---", nil_talk);
    portuxn(&vm.uxn, 0xf, "---", nil_talk);

    // Write screen size to dev/screen
    mempoke16(devscreen->dat, 2, WIDTH);
    mempoke16(devscreen->dat, 4, HEIGHT);
}

void EMSCRIPTEN_KEEPALIVE runMain () {
    evaluxn(&vm.uxn, PAGE_PROGRAM);
}

void EMSCRIPTEN_KEEPALIVE onUpdate () {
    evaluxn(&vm.uxn, mempeek16(devscreen->dat, 0));

    if (reqdraw) {
        reqdraw = 0;

        // TODO(2021-06-09): Do alpha compositing in software?
        int ll = WIDTH*HEIGHT;
        Uint32 bg_abgr[ll], fg_abgr[ll];
        Uint32* bg = vm.ppu.bg.pixels;
        Uint32* fg = vm.ppu.fg.pixels;

        for (int ii = 0; ii < ll; ++ii) {
            bg_abgr[ii] = toAbgr(bg[ii]);
            fg_abgr[ii] = toAbgr(fg[ii]);
        }
        render(bg_abgr, fg_abgr);
    }
}

void EMSCRIPTEN_KEEPALIVE onPointerEvent (int x, int y, int buttons) {
    // FIXME(2021-06-10): Click and drag compatibility with uxnemu
    mempoke16(devmouse->dat, 0x2, x);
    mempoke16(devmouse->dat, 0x4, y);
    devmouse->dat[6] = buttons;

    evaluxn(&vm.uxn, mempeek16(devmouse->dat, 0));
}

void EMSCRIPTEN_KEEPALIVE onWheelEvent (int y) {
    devmouse->dat[7] = y;
    evaluxn(&vm.uxn, mempeek16(devmouse->dat, 0));
    devmouse->dat[7] = 0;
}

void EMSCRIPTEN_KEEPALIVE onKeyboardEvent (int buttons, int charCode) {
    devctrl->dat[2] = buttons;
    devctrl->dat[3] = charCode;

    evaluxn(&vm.uxn, mempeek16(devctrl->dat, 0));
    devctrl->dat[3] = 0;
}
