import { randomInt } from 'node:crypto';
import { Discovery } from '@/discovery';
import { CompanionLink } from '@/protocol';
import { CompanionLinkFrameType, CompanionLinkMessageType } from '@/socket';

const discovery = Discovery.companionLink();
const device = await discovery.findUntil('Woonkamer HomePod (3)._companion-link._tcp.local');

const protocol = new CompanionLink(device);
await protocol.connect();

async function pair(): Promise<void> {
    await protocol.pairing.start();
    const keys = await protocol.pairing.transient();

    await protocol.socket.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    const [, _ss] = await protocol.socket.sendLRCP(CompanionLinkFrameType.E_OPACK, {
        _i: '_sessionStart',
        _t: CompanionLinkMessageType.Request,
        _c: {
            _srvT: 'com.apple.tvremoteservices',
            _sid: randomInt(0, 2 ** 32 - 1)
        }
    });

    console.log(_ss);

    const [, _si] = await protocol.socket.sendLRCP(CompanionLinkFrameType.E_OPACK, {
        _i: '_systemInfo',
        _t: CompanionLinkMessageType.Request,
        _c: {
            _bf: 0,
            _cf: 512,
            _clFl: 128,
            _i: '',
            _idsID: keys.pairingId.toString('hex'),
            _pubID: 'FF:70:79:61:74:76',
            _sf: 256,
            _sv: '170.18',
            model: 'iPhone10,6',
            nmae: 'iPhone van Bas'
        }
    });

    console.log(_si);

    const [, _ts] = await protocol.socket.send(CompanionLinkFrameType.E_OPACK, {
        _i: '_touchStart',
        _t: CompanionLinkMessageType.Request,
        _c: {
            _height: 1000.0,
            _width: 1000.0,
            _tFl: 0
        }
    });

    console.log(_ts);
}

await pair();
