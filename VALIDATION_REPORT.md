# Validatierapport: apple-protocols vs Apple Private Frameworks

> Gebaseerd op disassembly van 15 Mach-O arm64e binaries uit `/tmp/libraries/System/Library/PrivateFrameworks/`
> Datum: 2026-03-23

---

## Totaalbeeld

| Gebied                   | Status           | Samenvatting                                                                                                               |
|--------------------------|------------------|----------------------------------------------------------------------------------------------------------------------------|
| **Pairing & Encryption** | **100% correct** | Alle HKDF parameters, SRP-6a, ChaCha20 nonces, TLV8 — volledig conform                                                     |
| **Stream Protocols**     | **~80% correct** | DataStream, EventStream, ControlStream werken correct. Ontbreekt: `/info` fetch, feature negotiation, dedicated keep-alive |
| **Audio Streaming**      | **~60% correct** | Real-time RTP werkt. Ontbreekt: buffered audio (APAP/APAT), format negotiation, RFC2198, echte NTP sync                    |

---

## Bevestigd correct (geen actie nodig)

### Pairing
- Pair-Setup M1-M6: volledig HAP-spec conform
- Pair-Verify PV1-PV4: volledig correct
- SRP-6a: correcte 3072-bit prime, SHA-512, `"Pair-Setup"` gebruikersnaam
- Transient pairing: correcte flow (M1-M4), PIN `"3939"`, flag `0x10`
- Credential opslag: functioneel correct

### Key Derivation (HKDF)
- Control: `Control-Salt` + `Control-Read/Write-Encryption-Key` — **bevestigd**
- DataStream: `DataStream-Salt{seed}` + `DataStream-Input/Output-Encryption-Key` — **bevestigd**
- EventStream: `Events-Salt` + `Events-Read/Write-Encryption-Key` — **bevestigd** (key swap correct)
- Companion Link: `ServerEncrypt-main` / `ClientEncrypt-main` — **bevestigd**

### Encryption
- ChaCha20-Poly1305 frame format (2-byte LE length + ciphertext + 16-byte authTag)
- AirPlay nonce: 4 zero bytes + 8-byte LE counter — **bevestigd**
- Companion Link nonce: 8-byte LE counter + 4 zero bytes — **bevestigd**
- Pairing nonces: `"PS-Msg05"`, `"PV-Msg02"` etc. met left-zero-padding — **bevestigd**

### Audio Streaming (basis)
- RTP packet structuur (12-byte header, PT 96, marker bit)
- Audio encryption (ChaCha20 met shk, AAD = timestamp+SSRC)
- Retransmission request (0x55) en response (0xD6) — basisflow correct
- RTCP sync packets (PT 0xD4) — correct formaat
- Feedback loop (2s interval) — correct

---

## Verbeterplan (geprioriteerd)

### KRITIEK — Ontbrekende kernfunctionaliteit

#### 1. Buffered Audio Engine (APAP/APAT)
**Wat**: Apple's primaire streaming mode voor muziek. Gebruikt pre-buffering met receiver-managed timing.
**Waarom**: Zonder dit streamen we altijd real-time, wat gevoeliger is voor glitches en geen receiver-managed timing ondersteunt.
**Impact**: Betere audiokwaliteit, minder glitches, ondersteuning voor SetRate/GetAnchor protocol.
**Complexiteit**: Hoog — vereist nieuw audio engine naast de bestaande real-time engine.
**Relevante symbolen**: `APAudioEngineBuffered`, `APEndpointStreamBufferedAudio`, `APAP`, `APAT`, `APAT_Buffered`

#### 2. Audio Format Negotiation
**Wat**: Apple vraagt `SupportedAudioFormats` op en kiest het beste formaat. Wij sturen hardcoded `audioFormat: 0x800` (ALAC 44100/16/2).
**Waarom**: Sommige devices ondersteunen mogelijk niet exact dit formaat, of kunnen beter (48kHz, 24-bit, AAC-ELD).
**Impact**: Compatibiliteit en audiokwaliteit.
**Complexiteit**: Medium — `/info` response parsen + format selectie logica.
**Relevante code**: `audioStream.ts` — inconsistente constanten (`AUDIO_FORMAT_PCM = 0x400000` gedefinieerd maar `0x800` verstuurd).

### HOOG — Significante verbeteringen

#### 3. GET /info Fetch voor Pairing
**Wat**: Apple doet altijd eerst `GET /info` voordat er gepaird wordt. Response bevat: `features`, `SupportsKeepAlive`, `SupportsTransientPairing`, `initialVolume`, `isMuted`, `RequiredSenderFeatures`.
**Waarom**: We vliegen blind — weten niet welke features het device ondersteunt.
**Impact**: Robustere verbinding, feature-afhankelijke logica, initieel volume.
**Complexiteit**: Laag — simpele HTTP GET + plist parse.
**Relevante bestanden**: `protocol.ts`

#### 4. Feature Negotiation
**Wat**: Apple stuurt `features` bitmask in de SETUP request en parseert `enabledFeatures` uit de response.
**Waarom**: Het device kan features correct activeren op basis van wat de sender ondersteunt.
**Impact**: Correctere protocol handshake.
**Complexiteit**: Laag — veld toevoegen aan SETUP request/response.

#### 5. Dedicated Keep-Alive
**Wat**: Apple heeft een dedicated keep-alive port (uit SETUP response) + low-power keep-alive stream. Onze `/feedback` POST is waarschijnlijk een pyatv-conventie, niet Apple's native mechanisme.
**Waarom**: Betrouwbaardere verbinding, betere idle-state handling, belangrijk voor Homey.
**Impact**: Minder onverwachte disconnects.
**Complexiteit**: Medium — nieuwe TCP verbinding + keep-alive protocol.
**Relevante symbolen**: `keepAlivePort`, `keepAliveLowPower`, `apsession_ensureKeepAliveStarted`

#### 6. RFC2198 Audio Redundancy
**Wat**: In-band redundancy voor packet loss recovery. Apple gebruikt dit actief.
**Waarom**: Betere audiokwaliteit bij packet loss zonder retransmit delay.
**Impact**: Minder audio glitches.
**Complexiteit**: Medium — RTP packet format aanpassen, redundancy encoding/decoding.
**Relevante symbolen**: `rfc2198MaxRedundancy`, `redundancyCount`, `supportsRTPPacketRedundancy`

#### 7. Echte NTP Synchronisatie
**Wat**: Onze `ntpFromTs()` converteert sample timestamps naar NTP format, maar is geen echte NTP klok.
**Waarom**: Fundamenteel fout voor multi-room audio sync.
**Impact**: Multi-room audio werkt niet correct gesynchroniseerd.
**Complexiteit**: Medium — gedeelde NTP clock implementatie.
**Relevante symbolen**: `APSNetworkClock`, `senderNetworkClock`, `timingPort`

### MEDIUM — Kwaliteitsverbeteringen

#### 8. SETUP Request Body Completeren
**Wat**: Apple stuurt veel meer velden mee: `sessionCorrelationUUID`, `features`, `keepAliveLowPower`, `isPersistentConnection`, `isNonMediaSession`, `audioType`, `audioBufferSize`, `streamStartTimestamp`.
**Complexiteit**: Laag.

#### 9. Futile Retransmit Response
**Wat**: Als een packet niet meer in de backlog zit, stuurt Apple een expliciete "futile" response. Wij doen niets.
**Waarom**: De receiver weet dat het packet niet meer beschikbaar is en kan doorgaan.
**Complexiteit**: Laag — paar regels code.

#### 10. Volume via /volume Endpoint
**Wat**: AirPlay 2 gebruikt `POST /volume?volume=%f` (HTTP endpoint), niet `SET_PARAMETER`. Ons RAOP fallback werkt maar is legacy.
**Complexiteit**: Laag.

#### 11. Initial Volume Fetch
**Wat**: Apple leest het device volume bij sessie-start via `/info` response.
**Complexiteit**: Laag (komt mee met punt 3).

#### 12. SetListeningMode / SetConversationDetection
**Wat**: HomePod-specifieke features — ANC/Transparency control en auto-pause bij spraak.
**Complexiteit**: Laag — protobuf messages zijn al aangemaakt.

### LAAG — Nice-to-have

#### 13. Dynamic Latency Management
**Wat**: Tier-based latency met adaptive offset op basis van glitches.

#### 14. Volume Fades
**Wat**: Geleidelijke volume transities in plaats van abrupte wijzigingen.

#### 15. Retransmit Statistics
**Wat**: Tracking van retransmits, futile responses, glitches.

#### 16. EventStream Event Dispatch
**Wat**: Specifieke events dispatchen in plaats van alleen loggen.

#### 17. Connection Transport Fallback
**Wat**: Apple probeert Infra → AWDL → NAN bij connectiefalen. Wij proberen alleen TCP.

---

## Niet relevant voor onze library

| Feature | Reden |
|---------|-------|
| FairPlay / MFi authenticatie | Vereist Apple's proprietary FairPlay library of MFi hardware chip |
| PWD key exchange | Alleen nodig voor screen mirroring |
| Account Owner Pair-Verify | Vereist iCloud authenticatie |
| Certificate verificatie bij pairing | Optioneel, Apple root CA niet beschikbaar |
| Screen mirroring (AVC/HEVC) | Buiten scope, complex apart project |
| SharePlay / GroupSession | Apple ecosystem specifiek, ~13 protobuf types al aangemaakt |
| SnapInSnapOut (proximity transfer) | Vereist NearbyInteraction framework |
| APAC codec | Apple's proprietary spatial audio codec, decoder niet beschikbaar |

---

## Framework Dumps Locatie

Alle disassembled frameworks staan in `/tmp/framework-dumps/` met per framework:
- `objc-metadata.txt` — ObjC class/method metadata
- `symbols.txt` — Alle symbolen met adressen
- `strings.txt` — Alle string literals
- `exports.txt` — Geëxporteerde symbolen
- `classes.txt` — ObjC class namen
- `methods.txt` — ObjC methoden

Totaal 16MB aan gestructureerde data voor 15 frameworks.
