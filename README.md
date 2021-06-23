# webuxn

A light-weight port of the [uxn virtual machine](https://100r.co/site/uxn.html) to the web via WebAssembly.

## Demos

- [life.rom](https://aduros.com/webuxn/?rom=roms/life.rom)
- [darena.rom](https://aduros.com/webuxn/?rom=roms/darena.rom)
- [animation.rom](https://aduros.com/webuxn/?rom=roms/animation.rom)
- [musictracker.rom](https://aduros.com/webuxn/?rom=roms/musictracker.rom)
- [Bring Your Own Rom](https://aduros.com/webuxn/)

## Hotkeys

- F2: Save state
- F4: Load state
- F5: Reboot
- F10: Toggle fullscreen

## rom2html

`rom2html` bakes a rom and VM into a fully self-contained html that can be easily distributed.

```
make
./rom2html roms/life.rom > life.html
```
