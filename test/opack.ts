import { decodeOPack, encodeOPack } from '@/encoding';

console.log(encodeOPack({
    _a: true,
    _b: 'hallo',
    _c: 13,
    _d: ['a', 'b', 'c'],
    _e: {
        _x: 1,
        _y: 10
    }
}));

console.log(decodeOPack(encodeOPack({
    _a: true,
    _b: 'hallo',
    _c: 13,
    _d: ['a', 'b', 'c'],
    _e: {
        _x: 1,
        _y: 10
    }
})));
