import { Callout, Card, Check, Checks, Code, Column, Columns, Figure, Figures, Intro, Lead, Report, Row, Rows, Section, Status, Step, Steps } from 'html-report';

const advice = <Status tone="accent">Advies</Status>;
const assumed = <Status tone="warn">Aanname</Status>;

export default (
    <Report
        title="Packagestructuur vanaf nul"
        kind="Architectuurschets"
        model="Claude Fable 5.2"
        lang="nl"
        brand={{name: 'Apple Protocols', color: '#7c74ff'}}
        meta={<>14 november 2026 · revisie 2, met de scope <code>@corewire</code> en ruimte voor HomeKit · <code>main</code> op <code>5286829</code> · er is geen code gewijzigd</>}
    >
        <Lead>
            <p>
                Onder <code>@corewire</code> zou ik één package per protocol maken, op één gedeelde kern: <code>@corewire/core</code>,{' '}
                <code>@corewire/airplay</code>, <code>@corewire/companion-link</code>, en later <code>@corewire/homekit</code>. Daarboven staat{' '}
                <code>@corewire/devices</code> met de Apple TV en de HomePod, en ernaast <code>@corewire/audio-source</code>.
            </p>
            <p>
                De kern weet niets van een protocol. Dat is de regel die HomeKit mogelijk maakt, want HomeKit deelt met AirPlay en Companion Link
                precies de pairing, de versleuteling, TLV8 en mDNS. Drie grenzen verschuiven daarnaast. De handshake gaat naar het protocol, MRP
                krijgt zijn state erbij, en opnieuw verbinden gebeurt alleen nog in <code>devices</code>.
            </p>
        </Lead>

        <Figures>
            <Figure value="5" label="packages nu, HomeKit wordt de zesde" delta="nu 9" />
            <Figure value="6" label="buildstappen" delta="nu 11" />
            <Figure value="1" label="laag die opnieuw verbindt" delta="nu 3" />
            <Figure value="0" label="protobuf-types in de device-API" delta="Homey gebruikt er nu 35" />
        </Figures>

        <Callout>
            Revisie 1 stelde één package <code>apple-protocols</code> voor met alle protocollen als subpath. Dat klopte zolang het alleen om
            mediaprotocollen ging. Met HomeKit erbij krijgt elk protocol een eigen publiek, en dan is een package per protocol de juiste grens.
        </Callout>

        <Section title="Welke grenzen kloppen en welke niet" toc="Grenzen">
            <Intro>Een packagegrens verdient zijn plek als iemand de package los wil installeren. Dat geldt voor een protocol, niet voor een hulplaag.</Intro>
            <Rows>
                <Row title="Een protocol is een package">
                    <p>
                        Wie HomeKit-accessoires wil aansturen, wil niet de 1,1 MB aan protobuf van AirPlay meekrijgen. Wie een Apple TV bedient, heeft
                        niets aan het accessoiremodel van HomeKit. Die twee gebruikers bestaan straks allebei, dus <code>airplay</code>,{' '}
                        <code>companion-link</code> en <code>homekit</code> zijn elk een package. De grens dwingt ook af dat de protocollen elkaar niet
                        importeren.
                    </p>
                </Row>
                <Row title="encoding, encryption, common en rtsp zijn geen producten">
                    <p>
                        Niemand installeert ze los. Ze bestaan als package omdat een andere package ze nodig had. Dat kost een buildvolgorde,
                        path-aliassen, een kopieerlus van negen <code>dist</code>-mappen naar Homey en straks vier README's zonder lezer. Samen
                        vormen ze één kern.
                    </p>
                </Row>
                <Row title="common weet te veel">
                    <p>
                        <code>packages/common</code> exporteert rond de honderd namen, waaronder <code>uint16ToBE</code>,{' '}
                        <code>generateDacpId</code> en <code>prompt</code>. Erger voor HomeKit is wat erin staat aan AirPlay-kennis:{' '}
                        <code>airplayFeatures</code>, <code>AIRPLAY_SERVICE</code>, de audioconstanten, <code>TimingServer</code>,{' '}
                        <code>AudioSource</code> en de modelnummers van Apple TV en HomePod. Een HomeKit-package op deze kern zou dat allemaal
                        meeslepen.
                    </p>
                </Row>
                <Row title="De sdk geeft door wat hij zelf had moeten oplossen">
                    <p>
                        De sdk exporteert <code>Proto</code>, <code>mdnsUnicast</code>, <code>ConnectionRecovery</code>, <code>TimingServer</code> en{' '}
                        <code>AIRPLAY_SERVICE</code> opnieuw. Homey gebruikt ze alle vijf. De app zoekt Companion Link zelf met unicast mDNS, bouwt
                        twee keer een <code>DiscoveryResult</code> na met <code>as unknown as</code>, beheert twee <code>ConnectionRecovery</code>'s
                        plus een eigen trage herstelfase, zet credentials met de hand om van hex naar <code>Buffer</code>, en heeft een kopie van{' '}
                        <code>pctToDbfs</code>.
                    </p>
                </Row>
                <Row title="Protocolkennis staat in de sdk">
                    <p>
                        Van de 7.011 regels in <code>packages/sdk/src</code> staan er ruim 4.800 in <code>internal/</code>. Daar wonen de
                        now-playing-state, de HID-toetsen, het volume en de volledige AirPlay-handshake. De controllers erboven geven vooral door.
                        Diagnostics en de proxy bereiken die kennis alleen via de sdk, die daarvoor zijn internals exporteert.
                    </p>
                </Row>
            </Rows>
        </Section>

        <Section title="De nieuwe indeling" toc="Indeling">
            <table>
                <thead>
                    <tr>
                        <th>Package</th>
                        <th>Wat het is</th>
                        <th>Komt nu uit</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>@corewire/core</code></td>
                        <td>De gedeelde kern: codecs, crypto, transport, pairing, mDNS. Kent geen protocol.</td>
                        <td>encoding, encryption, common</td>
                    </tr>
                    <tr>
                        <td><code>@corewire/airplay</code></td>
                        <td>AirPlay 2, met MRP op <code>/mrp</code> en RAOP op <code>/raop</code>.</td>
                        <td>airplay, raop, rtsp, common, sdk</td>
                    </tr>
                    <tr>
                        <td><code>@corewire/companion-link</code></td>
                        <td>Companion Link.</td>
                        <td>companion-link, sdk</td>
                    </tr>
                    <tr>
                        <td><code>@corewire/homekit</code></td>
                        <td>Later. HomeKit Accessory Protocol over IP, eerst als controller.</td>
                        <td>nieuw</td>
                    </tr>
                    <tr>
                        <td><code>@corewire/devices</code></td>
                        <td><code>AppleTV</code> en <code>HomePod</code>. De stabiele API waar Homey op bouwt.</td>
                        <td>sdk</td>
                    </tr>
                    <tr>
                        <td><code>@corewire/audio-source</code></td>
                        <td>Decoders en bronnen voor audiostreams. Los vanwege 376 kB aan decoders en een worker.</td>
                        <td>audio-source</td>
                    </tr>
                    <tr>
                        <td><code>diagnostics</code> (privé)</td>
                        <td>De Electron-app, met de proxy en <code>JsonStorage</code> erin.</td>
                        <td>diagnostics, proxy, common</td>
                    </tr>
                </tbody>
            </table>
            <Code>{`
                 devices                  (later: iets bovenop homekit)
                 ╱      ╲                          │
          airplay    companion-link            homekit
                 ╲      │                        ╱
                  ╲     │                       ╱
                   └──── core ─────────────────┘

audio-source  ─ ─ ▶  airplay   (alleen het type AudioSource)
diagnostics   ───▶  alles`}</Code>
            <p>
                Een protocolpackage hangt alleen van <code>core</code> af, nooit van een ander protocol. <code>devices</code> is de enige plek waar
                twee protocollen samenkomen. Voor HomeKit betekent dat één nieuwe map onder <code>packages</code> en geen wijziging in de rest.
            </p>
            <p>
                De belofte verschilt per laag. <code>devices</code> zegt wat je met een device kunt doen en houdt dat stabiel. Een protocolpackage
                zegt wat er over de lijn gaat en verandert mee met tvOS. Alle packages houden voorlopig één gezamenlijke versie, zoals nu.
            </p>
        </Section>

        <Section title="@corewire/core van binnen" toc="Core">
            <Intro>De toets voor elk bestand: zou HomeKit het ook gebruiken, of op zijn minst niet in de weg zitten? Een map importeert alleen uit mappen erboven.</Intro>
            <table>
                <thead>
                    <tr>
                        <th>Subpath</th>
                        <th>Inhoud</th>
                        <th>Gebruikt door</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>/encoding</code></td>
                        <td>TLV8, Plist, OPack, NSKeyedArchiver</td>
                        <td>TLV8 door alle drie, de rest door AirPlay en Companion Link</td>
                    </tr>
                    <tr>
                        <td><code>/crypto</code></td>
                        <td>ChaCha20-Poly1305, Curve25519, Ed25519, HKDF, SRP, AES</td>
                        <td>alle drie</td>
                    </tr>
                    <tr>
                        <td><code>/transport</code></td>
                        <td>TCP-verbinding, het versleutelde kanaal met het nonce-formaat als parameter, de scheiding tussen ciphertext- en plaintextbuffer</td>
                        <td>alle drie</td>
                    </tr>
                    <tr>
                        <td><code>/pairing</code></td>
                        <td>Pair-setup en pair-verify, als controller en als accessoire, plus <code>Credentials</code></td>
                        <td>alle drie</td>
                    </tr>
                    <tr>
                        <td><code>/discovery</code></td>
                        <td>mDNS zoeken op een willekeurig servicetype, en adverteren</td>
                        <td>alle drie</td>
                    </tr>
                    <tr>
                        <td>hoofdingang</td>
                        <td>De foutklassen, de logger en de traffic-tap</td>
                        <td>alle packages</td>
                    </tr>
                </tbody>
            </table>
            <Rows>
                <Row title="Wat de kern verlaat">
                    <code>airplayFeatures</code>, de audioconstanten, <code>TimingServer</code>, de PTP-master, <code>AudioSource</code> en de
                    servicenamen gaan naar <code>airplay</code>. DAAP, RTI en de NTP-tijdstempels ook, want alleen AirPlay gebruikt ze. De
                    modelnummers van Apple TV en HomePod gaan naar <code>devices</code>. <code>ConnectionRecovery</code> gaat naar{' '}
                    <code>devices</code>. <code>Storage</code> en <code>prompt</code> gaan naar diagnostics. <code>Context</code> lost op in de opties
                    van een sessie, en <code>uuid</code> wordt <code>crypto.randomUUID()</code>.
                </Row>
                <Row title="Pairing kent het frame niet">
                    AirPlay stuurt de TLV8 van pair-setup in een HTTP-body, Companion Link in een OPack-frame, HomeKit weer in HTTP. De stappen M1 tot
                    en met M6 zijn gelijk. <code>/pairing</code> krijgt daarom een functie mee die één bericht verstuurt en het antwoord teruggeeft.{' '}
                    <code>airplay/pairing.ts</code> en <code>companion-link/pairing.ts</code> krimpen tot die functie.
                </Row>
                <Row title="De accessoirekant blijft in de kern">
                    Nu gebruikt alleen de proxy <code>AccessoryPairServer</code>. Een HomeKit-bridge heeft hem ook nodig, net als het adverteren via
                    mDNS dat nu in de proxy staat. Beide horen dus in <code>core</code>.
                </Row>
                <Row title="Discovery is generiek">
                    <code>core</code> zoekt op een servicetype en geeft adres, poort en TXT terug. Wat <code>_airplay._tcp</code> betekent, weet{' '}
                    <code>airplay</code>. Elke protocolpackage exporteert zijn eigen <code>discover()</code> op die basis.
                </Row>
            </Rows>
        </Section>

        <Section title="Waar HomeKit landt" toc="HomeKit">
            <Intro>Dit is geen ontwerp van de HomeKit-package. Het laat zien dat de indeling er klaar voor is.</Intro>
            <table>
                <thead>
                    <tr>
                        <th>HomeKit heeft nodig</th>
                        <th>Staat in</th>
                        <th>Bestaat al</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Accessoires vinden op <code>_hap._tcp</code></td>
                        <td><code>core/discovery</code></td>
                        <td>ja</td>
                    </tr>
                    <tr>
                        <td>Pair-setup met een code, pair-verify per sessie</td>
                        <td><code>core/pairing</code></td>
                        <td>ja, dit is dezelfde code die de Apple TV nu pairt</td>
                    </tr>
                    <tr>
                        <td>Versleutelde frames na pair-verify</td>
                        <td><code>core/transport</code></td>
                        <td>ja, het AirPlay-formaat komt van HomeKit</td>
                    </tr>
                    <tr>
                        <td>TLV8, HKDF, ChaCha20, Ed25519, SRP</td>
                        <td><code>core/encoding</code>, <code>core/crypto</code></td>
                        <td>ja</td>
                    </tr>
                    <tr>
                        <td>HTTP-berichten en het <code>EVENT</code>-bericht</td>
                        <td><code>homekit</code>, of gedeeld met de RTSP-codec</td>
                        <td>deels</td>
                    </tr>
                    <tr>
                        <td>Accessoires, services, characteristics, abonnementen</td>
                        <td><code>homekit</code></td>
                        <td>nee</td>
                    </tr>
                    <tr>
                        <td>De rol van accessoire of bridge</td>
                        <td><code>homekit</code>, op de serverkant van <code>core/pairing</code></td>
                        <td>de pairing wel, de rest niet</td>
                    </tr>
                </tbody>
            </table>
            <Rows>
                <Row title="Het grootste deel van de moeilijke helft ligt er al">
                    Pairing en versleuteling zijn het lastige stuk van een HomeKit-controller, en die deel je. Wat nieuw is, is het datamodel en de
                    HTTP-laag erboven. Een experiment kan dus beginnen in <code>packages/homekit</code> zonder iets in de andere packages aan te
                    raken.
                </Row>
                <Row title="De RTSP-codec verhuist pas als het nodig is" end={assumed}>
                    RTSP en HTTP hebben dezelfde berichtvorm. Als de codec uit <code>airplay</code> ook HomeKit kan bedienen, gaat hij op dat moment
                    naar <code>core</code>. Niet eerder, want ik weet nog niet of hij het <code>EVENT</code>-bericht zonder omweg aankan.
                </Row>
                <Row title="Bluetooth en Thread blijven buiten beeld">
                    Deze schets gaat over HomeKit via IP. Het versleutelde kanaal in <code>core/transport</code> werkt op een stroom bytes en weet
                    niets van TCP, dus een ander transport kan er later onder.
                </Row>
            </Rows>
        </Section>

        <Section title="@corewire/airplay van binnen" toc="AirPlay">
            <table>
                <thead>
                    <tr>
                        <th>Ingang</th>
                        <th>Inhoud</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>@corewire/airplay</code></td>
                        <td>De sessie met control-, event- en datakanaal, URL-playback, de audiostream, feature flags, <code>TimingServer</code>, het type <code>AudioSource</code>, <code>discover()</code></td>
                    </tr>
                    <tr>
                        <td><code>@corewire/airplay/mrp</code></td>
                        <td>Protobuf, berichten, now-playing-state per client en player, commando's, HID, volume, output devices</td>
                    </tr>
                    <tr>
                        <td><code>@corewire/airplay/raop</code></td>
                        <td>De RAOP-sessie en stream</td>
                    </tr>
                    <tr>
                        <td>intern</td>
                        <td>RTSP, de RTP-kern (pakketten, retransmit, sync, buffer), NTP en PTP, DAAP</td>
                    </tr>
                </tbody>
            </table>
            <Rows>
                <Row title="MRP krijgt zijn state erbij">
                    MRP loopt over het AirPlay-datakanaal. Nu ligt het in tweeën: de berichten staan in airplay, de betekenis ervan in{' '}
                    <code>sdk/internal</code>. In <code>/mrp</code> staan ze bij elkaar. De module krijgt een kanaal aangereikt en weet niets van
                    sockets, dus de proxy kan hem gebruiken om onderschept verkeer te duiden.
                </Row>
                <Row title="RAOP en RTSP worden onderdeel van airplay">
                    RAOP is de audiostream van AirPlay 1. Het deelt RTSP, de timing en de RTP-pakketten met AirPlay 2, en die code staat nu dubbel in{' '}
                    <code>airplay/audioStream.ts</code> en in <code>raop</code>. Als één package delen ze de kern zonder dat RTSP, timing en audio elk
                    een eigen package of een plek in <code>core</code> nodig hebben.
                </Row>
            </Rows>
        </Section>

        <Section title="Hoe een protocol werkt" toc="Protocollen">
            <Intro>Elk protocol krijgt dezelfde vorm, HomeKit straks ook. Wie er één kent, kent ze allemaal.</Intro>
            <Code file="voorbeeld: het protocol direct gebruiken">{`
import { connect } from '@corewire/airplay';
import { MediaRemote } from '@corewire/airplay/mrp';

const session = await connect({address: '192.168.1.20', port: 7000}, {credentials});
const remote = await MediaRemote.open(session);

remote.nowPlaying.on('change', item => console.log(item.title));
await remote.hid.press('select');

session.on('closed', reason => console.log(reason));`}</Code>
            <Rows>
                <Row title="connect() geeft een sessie die klaar is">
                    De functie doet pair-verify, zet de encryptie aan, haalt <code>/info</code> op en start de keepalive. Er is geen losse{' '}
                    <code>Protocol</code>-klasse meer waar de aanroeper zelf <code>verify</code>, <code>setupEventStream</code> en{' '}
                    <code>setupDataStream</code> in de juiste volgorde op moet aanroepen. Nu doet <code>AirPlayManager</code> in de sdk dat, en{' '}
                    <code>playUrl</code> en <code>streamAudio</code> doen het ieder nog een keer voor hun eigen verbinding.
                </Row>
                <Row title="Een sessie leeft één keer">
                    Een sessie verbindt niet opnieuw. Hij sluit met een reden (<code>local</code>, <code>remote</code>, <code>timeout</code>,{' '}
                    <code>error</code>) en is daarna weg. Een mislukte keepalive sluit de sessie met <code>timeout</code>. De retry die nu in{' '}
                    <code>Connection</code> zit, vervalt.
                </Row>
                <Row title="Kanalen open je op een sessie">
                    Op een AirPlay-sessie open je wat je nodig hebt: <code>MediaRemote.open(session)</code>, <code>session.playUrl(url)</code> of{' '}
                    <code>session.streamAudio(source)</code>. Dat het device voor audio een tweede verbinding wil, is kennis van{' '}
                    <code>airplay</code> en blijft daar.
                </Row>
                <Row title="Companion Link groepeert zijn methoden">
                    <code>connect()</code> uit <code>@corewire/companion-link</code> geeft een sessie met <code>hid</code>, <code>apps</code>,{' '}
                    <code>accounts</code>, <code>power</code>, <code>text</code> en <code>touch</code>. De ruim zestig methoden die nu plat op{' '}
                    <code>Protocol</code> staan en in <code>CompanionLinkManager</code> nog een keer, krijgen zo een groep en één plek.
                </Row>
                <Row title="Het protocol spreekt zijn eigen eenheden">
                    Volume is in een protocolpackage wat het protocol spreekt (dB bij AirPlay-audio, 0 tot 1 bij MRP). <code>devices</code> rekent om
                    en biedt alleen 0 tot 1.
                </Row>
            </Rows>
        </Section>

        <Section title="Hoe de code aan elkaar hangt" toc="Koppelingen">
            <Intro>De regels binnen een package. Ze gelden voor elk protocol en voor devices.</Intro>
            <Code>{`
AppleTV                     maakt sessies, bewaakt de levenscyclus, kiest per actie het protocol
 ├─ AirPlaySession          bezit de verbinding, leeft één keer, sluit met een reden
 │   ├─ EventChannel
 │   ├─ DataChannel         geeft berichten door
 │   │   └─ MediaRemote     model: maakt van berichten now-playing-state, doet geen I/O
 │   └─ AudioStream
 └─ CompanionLinkSession

omlaag: argumenten bij het aanmaken      omhoog: events`}</Code>
            <Rows>
                <Row title="Eigenaarschap loopt één kant op">
                    Een ouder maakt zijn kinderen en geeft ze mee wat ze nodig hebben. Een kind kent zijn ouder niet en praat alleen omhoog via
                    events. Nu houdt <code>AirPlayManager</code> een <code>Protocol</code> vast die streams vasthoudt, terwijl de controllers via de
                    manager weer in die streams reiken.
                </Row>
                <Row title="Alles komt binnen via de opties">
                    Logger, credentials en timing gaan mee bij het aanmaken. Er is geen <code>configure()</code>, geen singleton en geen setter
                    achteraf zoals <code>setCredentials()</code> of <code>discoveryResult =</code>. Een ander adres betekent een nieuwe sessie.
                </Row>
                <Row title="Drie soorten code">
                    Een codec zet bytes om en heeft geen state. Een sessie of kanaal bezit een socket en leeft één keer. Een model leidt state af uit
                    berichten en doet geen I/O. De now-playing-state is een model, en daarom te testen en in de proxy te gebruiken zonder verbinding.
                </Row>
                <Row title="Elke laag heeft zijn eigen events">
                    Nu reist hetzelfde event door vier lagen, van <code>DataStream</code> via <code>AirPlayState</code> en{' '}
                    <code>StateController</code> naar Homey. Straks geeft een kanaal berichten, maakt het model er statuswijzigingen van, en geeft het
                    device alleen <code>status</code> en zijn capability-events. Geen laag geeft een event van een andere laag ongewijzigd door.
                </Row>
                <Row title="Opruimen via één AbortSignal per sessie">
                    Het signaal gaat af als de sessie sluit. Timers, listeners, openstaande requests en kindkanalen hangen eraan. Dat vervangt de{' '}
                    <code>#bound*</code>-velden met handmatig <code>off()</code>. Een request op een gesloten sessie faalt met{' '}
                    <code>ConnectionClosedError</code>, een request zonder antwoord met <code>TimeoutError</code>.
                </Row>
                <Row title="Handlers zijn privé">
                    De publieke <code>onClose</code>, <code>onError</code> en <code>onTimeout</code> op de managers worden <code>#</code>-methoden.
                    Publiek is wat in de <code>index.ts</code> van de map staat.
                </Row>
                <Row title="Eén indeling per protocolpackage">
                    <code>session.ts</code> met <code>connect()</code>, een map voor de kanalen, een voor de berichten, en <code>types.ts</code>. In{' '}
                    <code>devices</code> staat een map per capability, met daarnaast het device en zijn levenscyclus.
                </Row>
            </Rows>
        </Section>

        <Section title="Wat @corewire/devices wel en niet doet" toc="Devices">
            <Columns>
                <Column title="Wel">
                    <ul>
                        <li>Devices vinden, met alle services van één device samengevoegd</li>
                        <li>Verbinden met alleen een adres, en de services er zelf bij zoeken</li>
                        <li>De levenscyclus bewaken en opnieuw verbinden, ook na een adreswijziging</li>
                        <li>Per actie het protocol kiezen (tekstinvoer via Companion Link, anders via MRP)</li>
                        <li>Now playing als momentopname met eigen types</li>
                        <li>Pairing, met credentials als één tekstwaarde</li>
                        <li>De gedeelde timing server starten bij de eerste audiostream</li>
                    </ul>
                </Column>
                <Column title="Niet">
                    <ul>
                        <li>Protobuf-types of protocolklassen in zijn API</li>
                        <li>Credentials opslaan. Dat doet de app</li>
                        <li>Globale configuratie. Opties gaan per device mee</li>
                        <li>Het internet op als bijwerking. Lyrics en artwork uit de Apple Music-catalogus staan in <code>@corewire/devices/catalog</code></li>
                        <li>Zijn internals exporteren. Wie dieper wil, pakt <code>device.sessions</code></li>
                        <li>HomeKit-accessoires. Die zijn geen Apple TV of HomePod en krijgen hun API in <code>homekit</code></li>
                    </ul>
                </Column>
            </Columns>
            <Code file="voorbeeld: de Apple TV in Homey">{`
import { AppleTV, Credentials } from '@corewire/devices';

const tv = new AppleTV({address: '192.168.1.20'}, {
    credentials: Credentials.parse(stored),
    log: entry => this.log(entry.message)
});

tv.on('status', status => {
    // status.state: 'connecting' | 'connected' | 'degraded' | 'recovering' | 'offline'
    // status.reason zegt waarom, status.companionLink en status.airplay per protocol
});

tv.nowPlaying.on('change', item => {
    // item.title, item.app, item.state ('playing' | 'paused' | ...), item.repeat ('off' | 'one' | 'all')
});

await tv.connect();
await tv.remote.press('select');
await tv.playback.setRepeat('all');
await tv.volume.set(0.3);`}</Code>
            <Rows>
                <Row title="Herstel zit in het device">
                    <code>connect()</code> houdt het device verbonden tot <code>disconnect()</code>. De status <code>degraded</code> betekent dat
                    AirPlay werkt en Companion Link nog niet. Het device blijft dan zelf zoeken en haakt Companion Link aan zodra hij er is. Nu moet
                    Homey het device afbreken en opnieuw opbouwen, omdat de sdk Companion Link alleen in de constructor kan binden.
                </Row>
                <Row title="Capabilities zijn er altijd">
                    <code>tv.apps</code> is nooit <code>undefined</code>. <code>tv.supports('apps')</code> zegt of het nu kan, en een aanroep die niet
                    kan, gooit een <code>UnavailableError</code>. Dat scheelt de <code>?.</code> op elke regel in de app.
                </Row>
                <Row title="Eén laag per capability">
                    <code>RemoteController</code> met daaronder <code>AirPlayRemote</code> wordt één <code>remote</code> die op de sessies uit de
                    protocolpackages werkt. Hetzelfde geldt voor volume, state en artwork.
                </Row>
                <Row title="Twee deviceklassen">
                    <code>AppleTV</code> en <code>HomePod</code>. <code>HomePodMini</code> is nu een lege subklasse en wordt{' '}
                    <code>pod.model</code>.
                </Row>
            </Rows>
        </Section>

        <Section title="Wat er uit de Homey-app verdwijnt" toc="Homey">
            <table>
                <thead>
                    <tr>
                        <th>Nu in Homey</th>
                        <th>Straks</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Twee <code>ConnectionRecovery</code>'s, een trage herstelfase en een herverbinding elke 15 minuten</td>
                        <td>Het <code>status</code>-event van het device</td>
                    </tr>
                    <tr>
                        <td><code>mdnsUnicast</code> en een nagebouwde <code>DiscoveryResult</code> voor Companion Link</td>
                        <td>Het device zoekt zelf</td>
                    </tr>
                    <tr>
                        <td><code>convertDiscoveryResult</code> met <code>as unknown as</code></td>
                        <td>Een doel met <code>address</code>, en optioneel <code>port</code> en <code>txt</code></td>
                    </tr>
                    <tr>
                        <td><code>getAccessoryCredentialsFromDevice</code> zet hex om naar <code>Buffer</code></td>
                        <td><code>Credentials.parse()</code>, die ook het huidige opslagformaat leest</td>
                    </tr>
                    <tr>
                        <td><code>Proto.RepeatMode_Enum</code>, <code>Proto.Command.NextTrack</code></td>
                        <td><code>'off' | 'one' | 'all'</code>, <code>nowPlaying.supports('next')</code></td>
                    </tr>
                    <tr>
                        <td>Een kopie van <code>pctToDbfs</code></td>
                        <td>Volume van 0 tot 1</td>
                    </tr>
                    <tr>
                        <td><code>new TimingServer()</code> en <code>configure()</code></td>
                        <td>Niets. Uitzetten kan met een optie</td>
                    </tr>
                    <tr>
                        <td><code>tv.companionLink.pressButton()</code>, <code>tv.airplay.state.volumeCapabilities</code></td>
                        <td><code>tv.remote.press()</code>, <code>tv.volume.mode</code></td>
                    </tr>
                    <tr>
                        <td><code>@basmilius/apple-sdk</code> en <code>@basmilius/apple-audio-source</code></td>
                        <td><code>@corewire/devices</code> en <code>@corewire/audio-source</code></td>
                    </tr>
                </tbody>
            </table>
            <p>
                <code>src/apple-tv/device.ts</code> is nu 593 regels. Zo'n 250 daarvan gaan over vinden, verbinden en herstellen. Die horen in{' '}
                <code>devices</code>, en de HomePod-klasse heeft er een eigen variant van.
            </p>
        </Section>

        <Section title="Diagnostics en de proxy" toc="Diagnostics">
            <Rows>
                <Row title="Diagnostics gebruikt alleen publieke API's">
                    De roots van <code>device:call</code> worden het device en de sessies uit <code>device.sessions</code>. Diagnostics hoeft dan
                    niet meer door string-paden in <code>sdk/internal</code> te lopen.
                </Row>
                <Row title="De proxy wordt een onderdeel van diagnostics">
                    Dat heb je in de eerdere sessie al gekozen. <code>packages/proxy</code> verdwijnt, met zijn CLI en de proxystap in de build. De
                    pairing-server en het adverteren die hij gebruikt, komen uit <code>core</code>.
                </Row>
                <Row title="Een HomeKit-experiment krijgt hier zijn paneel">
                    Een paneel toevoegen is een map plus een regel in de registry. Zo test je HomeKit op dezelfde manier als de andere protocollen,
                    met de traffic-tap erbij.
                </Row>
                <Row title="Losse testscripts verdwijnen">
                    <code>test-audio.ts</code>, <code>test-remote.ts</code>, <code>find.ts</code> en <code>audio-test.mjs</code> doen wat diagnostics
                    en <code>diag</code> ook doen. Wat een goed voorbeeld is voor de documentatie, gaat naar <code>examples/</code>.
                </Row>
            </Rows>
        </Section>

        <Section title="Keuzes waar ik je akkoord op wil" toc="Keuzes">
            <Rows>
                <Row title="Eén core, geen losse encoding, crypto en mdns" end={advice}>
                    Je zou de kern ook in drie of vier packages kunnen knippen. Ik zie er geen gebruiker voor. Als er later vraag is naar alleen de
                    mDNS-code, is afsplitsen van een subpath een kleine stap.
                </Row>
                <Row title="RAOP en RTSP worden onderdeel van airplay" end={advice}>
                    Het alternatief is <code>@corewire/raop</code> als eigen package. Dan moeten RTSP, timing en de RTP-kern naar <code>core</code> of
                    naar een vierde package, terwijl HomeKit er niets mee doet. Homey gebruikt RAOP niet.
                </Row>
                <Row title="MRP is een subpath van airplay, met de state erbij" end={advice}>
                    Dit is de grootste verhuizing, ongeveer 2.700 regels uit <code>sdk/internal</code>. Een eigen package <code>@corewire/mrp</code>{' '}
                    kan ook, maar MRP bestaat sinds tvOS 15 alleen nog binnen AirPlay.
                </Row>
                <Row title="De naam devices" end={advice}>
                    <code>@corewire/sdk</code> zegt onder een scope met HomeKit niet meer waar het over gaat. <code>@corewire/devices</code> leest
                    goed naast de protocolnamen. <code>@corewire/apple</code> is korter, maar HomeKit is ook van Apple.
                </Row>
                <Row title="Eén versie voor alle packages" end={advice}>
                    Zoals nu. <code>homekit</code> krijgt in zijn README de status experimenteel tot hij tegen echte accessoires werkt. Losse versies
                    per package vragen een release-tool en leveren voorlopig niets op.
                </Row>
                <Row title="De oude packages" end={advice}>
                    De negen <code>@basmilius/apple-*</code> packages krijgen op npm een deprecation-melding die naar <code>@corewire</code> wijst. Er
                    komt geen tussenlaag.
                </Row>
            </Rows>
            <Card title="Wat ik van je nodig heb">
                <p>
                    Akkoord op de zes packages en op de keuzes hierboven, of je afwijking per punt. Zeg er ook bij of de repository zelf van naam
                    moet veranderen. Daarna maak ik een plan per stap uit het volgende hoofdstuk.
                </p>
            </Card>
        </Section>

        <Section title="Ombouwen in stappen" toc="Ombouwen">
            <Intro>Na elke stap bouwt alles en werkt diagnostics tegen een echt device. Homey gaat als laatste over.</Intro>
            <Steps>
                <Step title="Eén validatiecommando" done="één script bouwt de packages, kopieert de dist-mappen naar Homey en draait daar de build">
                    Dit bestaat nu als drie losse stappen in <code>CLAUDE.md</code>.
                </Step>
                <Step
                    title="@corewire/core"
                    done="encoding, encryption en common bestaan niet meer als package, een zoekactie op airplay in packages/core/src geeft niets, en diagnostics verbindt met een Apple TV en een HomePod"
                >
                    De mappen <code>encoding</code>, <code>crypto</code>, <code>transport</code>, <code>pairing</code> en <code>discovery</code>,
                    zonder gedragswijziging. Wat AirPlay-kennis is, verhuist in dezelfde stap naar <code>airplay</code>. Een script past de imports
                    en de scope aan.
                </Step>
                <Step
                    title="AirPlay en Companion Link als sessie"
                    done="pair-verify wordt alleen binnen airplay en companion-link aangeroepen, en verbinden, een URL afspelen en audio streamen werken in diagnostics"
                >
                    Beide packages krijgen <code>connect()</code>. De handshake komt uit de sdk-managers, en beide pairing-bestanden krimpen tot de
                    framefunctie.
                </Step>
                <Step
                    title="MRP met zijn state"
                    done="sdk/internal bevat geen airplay-state, airplay-client, airplay-player, airplay-remote of airplay-volume, en now playing en remote.up werken via diag"
                />
                <Step
                    title="RAOP en RTSP in airplay, één audiokern"
                    done="de packages raop en rtsp bestaan niet meer, en een stream via AirPlay en een stream via RAOP spelen allebei af vanuit diagnostics"
                />
                <Step
                    title="@corewire/devices"
                    done="een verbroken verbinding in diagnostics eindigt zonder code van de app weer op connected, ook na een herstart van de Apple TV"
                >
                    Devices, capabilities, levenscyclus en herstel. Eigen types in plaats van protobuf.
                </Step>
                <Step
                    title="Diagnostics op de publieke API's, met de proxy erin"
                    done="packages/proxy bestaat niet meer en diagnostics importeert niets uit een internal-map"
                />
                <Step
                    title="Homey overzetten"
                    done="Homey importeert alleen uit @corewire/devices en @corewire/audio-source, de build slaagt en een Apple TV en een HomePod werken een dag zonder ingreep"
                >
                    In een worktree van de app.
                </Step>
                <Step title="Release, README en CLAUDE.md" done="de release-workflow publiceert vijf packages onder @corewire en de documentatie kan beginnen" />
                <Step title="Daarna: het HomeKit-experiment" done="packages/homekit pairt met één accessoire en leest een characteristic, zonder wijziging in een andere package dan core">
                    Dit hoort niet bij de ombouw. Het is de proef dat de kern klopt.
                </Step>
            </Steps>
            <Callout>
                De branch <code>experimental/reworked-api</code> bevat al werk voor de sessies, het herstel en de proxy in diagnostics, binnen de oude
                packages. Dat is bruikbaar als bron, niet als startpunt.
            </Callout>
        </Section>

        <Section title="Wat ik heb nagekeken" toc="Nagekeken">
            <Checks>
                <Check status="done">De <code>index.ts</code>, regelaantallen en dependencies van alle packages op <code>main</code></Check>
                <Check status="done">Alle imports en sdk-aanroepen in de Homey-app, en de code voor verbinden en herstel in beide deviceklassen</Check>
                <Check status="done">De publieke methoden van de protocolklassen en de sdk-managers</Check>
                <Check status="skipped">Er is niets gebouwd of op een device getest. Dit is een schets</Check>
                <Check status="skipped">Het eerdere architectuurrapport heb ik alleen op koppen gelezen</Check>
                <Check status="skipped">De HomeKit-specificatie heb ik er niet naast gelegd. Wat hier over HomeKit staat, komt uit wat ik van het protocol weet</Check>
            </Checks>
            <Rows>
                <Row title="Het versleutelde kanaal van AirPlay past ongewijzigd op HomeKit" end={assumed}>
                    Beide gebruiken frames met een lengte van twee bytes als AAD en een nonce van vier nulbytes plus een teller. De ontvangstgrens kan
                    verschillen. Het blijkt bij het experiment.
                </Row>
                <Row title="Een keepalive die sluit, maakt de herverbinding elke 15 minuten overbodig" end={assumed}>
                    Het eerdere rapport noemt een mislukte keepalive die niets doet als oorzaak. Ik heb dat niet zelf nagelopen.
                </Row>
                <Row title="Homey kan subpaths van een package importeren" end={assumed}>
                    De sdk heeft al een <code>exports</code>-veld en Homey leest dat. Een tweede ingang (<code>@corewire/devices/catalog</code>) heb
                    ik niet geprobeerd.
                </Row>
                <Row title="De regelaantallen zijn een indicatie" end={assumed}>
                    Ze komen uit <code>wc -l</code> op de bronbestanden, zonder de gegenereerde protobuf.
                </Row>
            </Rows>
        </Section>
    </Report>
);
