# webuxn

A light-weight port of the [uxn virtual machine](https://100r.co/site/uxn.html) to the web via WebAssembly.

## Demos

- [life.rom](https://aduros.com/webuxn/?rom=roms/life.rom)
- [darena.rom](https://aduros.com/webuxn/?rom=roms/darena.rom)
- [animation.rom](https://aduros.com/webuxn/?rom=roms/animation.rom)
- [Bring Your Own Rom](https://aduros.com/webuxn/)

## rom2html

`rom2html` bakes a rom and VM into a fully self-contained html that can be easily distributed.

```
make
./rom2html roms/life.rom > life.html
```

## TODO

- Audio
- Files (using IndexedDB?)
- Support mobile as best we can
