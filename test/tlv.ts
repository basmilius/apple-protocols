import { decodeTlv, encodeTlv, TlvFlags, TlvMethod, TlvState, TlvValue } from '@/encoding';

console.log(encodeTlv([
    [TlvValue.Method, TlvMethod.PairSetup],
    [TlvValue.State, TlvState.M1],
    [TlvValue.Flags, TlvFlags.TransientPairing]
]));

console.log(decodeTlv(encodeTlv([
    [TlvValue.Method, TlvMethod.PairSetup],
    [TlvValue.State, TlvState.M1],
    [TlvValue.Flags, TlvFlags.TransientPairing]
])));
