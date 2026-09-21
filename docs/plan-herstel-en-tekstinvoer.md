# Plan voor verbindingsherstel en tekstinvoer

Gebaseerd op de hertest van Woonkamer TV op 21 september 2026, commit `d299753`. Doel: automatische recovery na verlies van een essentiële stream en werkende tekstinvoer via de SDK, met afzonderlijke verificatie van Companion en AirPlay.

## Implementatiestatus

De codewijzigingen zijn uitgevoerd. Vóór verwijdering slaagden de 66 tests op Bun en Node; de projectbuild inclusief diagnostics en de Homey-build slaagden ook. De geautomatiseerde tests, fixtures en runner zijn daarna op verzoek verwijderd. De testscenario’s hieronder zijn bewaard voor een later, grondig testtraject. De hardwarehertest staat nog open.

- De manager bewaakt close op alle essentiële streams, maakt teardown eenmalig en meldt connected pas na volledige setup. Vernietigen annuleert socket-retries. Late recovery-resultaten na dispose/reset worden genegeerd.
- De gedeelde RTI-code respecteert buffergrenzen, resolveert archiefverwijzingen en valideert de sessie-UUID. Companion serialiseert invoer en weigert ontbrekende of vervangen sessies. De publieke keyboard-controller kiest Companion wanneer verbonden, zonder opnieuw versturen via een ander transport na een fout.
- AirPlay vraagt nu een RTI-sessie aan en verstuurt RemoteTextInputMessage met RTI-data. De sessieaanvraag wacht maximaal vijf seconden op een remoteTextInput-event; een ontbrekende sessie, afwijkende versie of verbroken stream geeft een fout. Het daadwerkelijke antwoordgedrag van Woonkamer TV moet nog worden bevestigd.
- De inmiddels verwijderde regressiefixture was een synthetisch RTIKeyedArchiver-archief, geen capture van de TV. Een later testtraject moet ook de uitgaande archiefstructuur onafhankelijk van onze eigen decoder controleren.
- Diagnostics ondersteunt voor recovery:simulateDrop nu de optionele streamkeuze control/data/event; data blijft de standaard. De herstelcontrole vereist ook Companion wanneer dat vóór de storing verbonden was.

De gedecompileerde klassen onderbouwen de RTI-berichttypen en sessieobjecten. Ze bewijzen niet dat iedere huidige tvOS-build de nieuwe AirPlay-route accepteert. De acceptatietests hieronder blijven daarom open tot de hertest op Woonkamer TV.

## 1. Verbindingsherstel eerst

De hertest sloot de DataStream zonder diagnostics te herstarten. De SDK bleef connected melden en startte geen recovery. Een volgend commando gaf ConnectionClosedError.

In `packages/sdk/src/internal/airplay-manager.ts` luistert de manager naar close op de controlstream, maar alleen naar error/timeout op data- en eventstreams. Ook isConnected kijkt uitsluitend naar de controlstream. Een TCP-close zonder error is niet hetzelfde als een door de gebruiker gevraagde disconnect.

### Wijzigingen

- Geef control-, data- en eventstreams dezelfde centrale afhandeling voor het onverwacht sluiten van een essentiële stream. Leg intentionaliteit vast in de levenscyclus van de sessie; gebruik daarvoor niet TCP hadError.
- Maak teardown idempotent. Ruim sockets, feedbacktimers, subscriptions en uitstaande requests op. Emit precies één disconnected-event met de juiste reden. Het huidige onClose-pad kan via disconnect eerst false en daarna true uitsturen; voorkom die dubbele melding.
- Maak connected afhankelijk van een volledig opgezette, nog bruikbare sessie. Een werkende controlstream alleen is onvoldoende.
- Verwijder alle listeners van de oude streams bij reconnect en negeer late events van een vorige sessie. Vang ook uitval tijdens setup af zonder een half verbonden sessie achter te laten.
- Laat ConnectionRecovery de volledige handshake opnieuw opzetten. Controleer dat socket-retries en sessie-recovery niet tegelijk proberen een versleutelde verbinding te herstellen. Hergebruik geen oude encryptiecounters of sessiepoorten.
- Controleer dat diagnostics direct disconnected/recovering toont en pas recovered meldt wanneer de vereiste verbindingen weer bruikbaar zijn. Herbevestig hierbij AirPlay én de eerder werkende Companion-verbinding.

### Tests

Voeg regressietests toe op de manager- en recovery-interface voor data-, event- en controlstreamverlies, inclusief een close zonder error. Test gelijktijdig sluiten van meerdere streams, bewuste disconnect, oude close-events na reconnect, afgebroken setup, mislukte retries en dispose tijdens een lopende poging. Uitstaande requests moeten afwijzen; listeners en timers mogen niet groeien bij herhaling.

Acceptatie op Woonkamer TV: drie gemotiveerde herstelcycli, één per essentieel streamtype. Elke cyclus geeft één onverwachte disconnect, herstelt op het gezonde LAN binnen tien seconden en levert weer actuele metadata en werkende pauze/hervatbediening. Een bewuste disconnect start geen recovery. Diagnostics behoudt hetzelfde proces. Breid de bestaande simulateDrop-testactie zo nodig uit met een streamkeuze; de huidige actie blijft standaard de DataStream testen.

## 2. Companion-tekstinvoer en RTI

De actieve tekstsessie was bevestigd. De ontvangen `_tiD` begon met bplist00, maar textInputCommand gaf een plist-headerfout. Zowel protocol.ts als companion-link-state.ts geeft `Buffer.from(data).buffer` door zonder rekening te houden met byteOffset en byteLength.

### Wijzigingen

- Reproduceer dit eerst met een geldig plist in een buffer met een niet-nul offset en extra bytes ervoor en erachter. Parse uitsluitend de bedoelde bytes. Pas dezelfde oplossing toe op de betrokken tekstsessie-readers.
- Decodeer vervolgens de echte RTIKeyedArchiver-structuur. Los UID-verwijzingen, de NSUUID met NS.uuidbytes, documenttekst en traits op. Alleen de header repareren is onvoldoende: de huidige code behandelt het UUID-object als ruwe bytes en leest documentvelden rechtstreeks uit de archiefcontainer.
- Gebruik één gedeelde RTI-decoder voor sessiestatus en het versturen van tekst. Houd de transportafhandeling in Companion/AirPlay en de interpretatie van dezelfde archiefstructuur op één plaats. Kies de bestaande encoding-package als eigenaar wanneer beide transports deze decoder gebruiken.
- Volg de lifecycle van `_tiStarted`, `_tiStopped` en `_tiStart`-responses. Leg vast wanneer een sessie geldig is, vervang een oude UUID bij sessiewissel en serialiseer opeenvolgende tekstbewerkingen. Controleer in de binaries of stop/start voor iedere bewerking nodig is; verwijder die reeks alleen met onderbouwing.
- Valideer de uitgaande RTITextOperations voor vervangen, invoegen en wissen tegen Apple en een vastgelegde testfixture. Stuur niet naar een beëindigde of vervangen sessie.
- Geef een herkenbare fout bij ontbrekende sessie, ongeldige archiefdata of ongeldige UUID. Een stil return/null mag in de high-level API niet als geslaagde invoer verschijnen.

### Onderzoek met de gedecompileerde binaries

De ingang staat in `.research/DECOMPILATION_SETUP.md` en `.research/COMPANION_LINK_ANALYSIS.md`. De classbestanden staan onder `~/Development/reference/apple-frameworks`:

- TVRemoteCore/TVRCRapportRemoteTextInputKeyboardImpl.c: ontvangen/vervangen van de inputsession, tekstbewerkingen en observatie beëindigen.
- TVRemoteCore/TVRCTextInputSession.c en RemoteTextInput/RTIInputSystemDataPayload.c: sessiegegevens en documenttoestand.
- RemoteTextInput/RTITextOperations.c, RTIKeyedArchiver.c en RTIKeyedUnarchiver.c: archiefroots, targetSessionUUID, keyboardOutput en wis-/vervangsemantiek.

Noteer per protocolbeslissing het classbestand, de functie en waar beschikbaar het adres. Controleer de versie/herkomst van de binaries tegenover de tvOS-build van de TV. Onopgeloste selectors en decompilerwaarschuwingen zijn onderzoeksvragen, geen bewezen gedrag. Hardwareverkeer blijft de controle op de interpretatie.

### Tests

Gebruik een fixture van een onschuldig leeg zoekveld, zonder credentials of persoonlijke tekst. Test buffer-offsets, UID-resolutie, UUID-lengte, documenttekst, ontbrekende/verouderde sessie en malformed data. Controleer uitgaande archieven tegen de verwachte Apple-structuur, niet uitsluitend met een roundtrip door onze eigen encoder en decoder.

## 3. AirPlay-tekstinvoer en de publieke keyboard-controller

`AirPlayRemote.textSet` verstuurt nu TEXT_INPUT_MESSAGE. De receiver liet het veld leeg. De repo bevat ook RemoteTextInputMessage en GetRemoteTextInputSessionMessage, en de gedecompileerde MediaRemote-klassen bevatten zowel het oude als het aparte RTI-bericht.

- Onderzoek MediaRemote/MRTextInputMessage.c, MRRemoteTextInputMessage.c en MRGetRemoteTextInputSessionMessage.c plus de ontvangende handlers. Bepaal welke sessieaanvraag, berichtversie, RTI-payload en capabilities nodig zijn. Verifieer ook timestamp- en actietypebetekenis van het oude bericht voordat dat als fallback blijft bestaan.
- Implementeer de ondersteunde RTI-route via AirPlay wanneer het onderzoek en het hardwareverkeer die bevestigen. Deel archiefverwerking met Companion. Gebruik een exchange uitsluitend als de receiver aantoonbaar een gecorreleerd antwoord stuurt; verifieer asynchrone status via events.
- Laat KeyboardController op Apple TV een bruikbare Companion-tekstsessie kunnen gebruiken. De controller krijgt nu alleen AirPlay. Behoud type/append/clear voor callers en voeg de benodigde transportkeuze intern toe.
- Kies vóór verzending één bruikbaar transport. Voer na een onzekere verzending geen blinde fallback uit, want die kan tekst dubbel invoeren. Behoud directe protocoltoegang voor afzonderlijke diagnose.
- Als AirPlay-tekstinvoer op deze tvOS-build niet ondersteund blijkt, maak dat expliciet zichtbaar. Een werkende Companion-route maakt een mislukte AirPlay-test niet geslaagd.

## 4. Validatie en afronding

Voorlopig valideert `bash build.sh` de wijzigingen. Geautomatiseerde regressietests worden pas in het latere testtraject toegevoegd. Valideer de publieke SDK tegen de Homey-app volgens CLAUDE.md door de gebouwde packages over te nemen en daar `bun run build` te draaien.

Hardwaretests starten met een vaste codeversie en het door de gebruiker geopende diagnostics-proces. Gebruik de bestaande bridge en leg cursors, proces en resultaten vast. Voor tekstinvoer vraagt de agent eerst het lege zoekveld te openen en verstuurt direct na bevestiging:

1. Vervangen door `test`; verwacht exact test.
2. Toevoegen van ` café 😀`; verwacht exact test café 😀.
3. Wissen; verwacht een leeg veld.
4. Veld sluiten en opnieuw openen; verwacht geen gebruik van de oude sessie.

Voer dit afzonderlijk uit voor Companion, AirPlay indien ondersteund en de publieke keyboard-controller. Doe na een herstelde verbinding nog één invoerbewerking om het samenspel te controleren. Eindig met een korte pauze/hervat- en audiocontrole, en herstel muziek, volume en recovery-instellingen.

Oplevering: fixes, betekenisvolle regressietests en een bijgewerkt hardwareverslag met geslaagd/mislukt/niet ondersteund per route. De twee problemen zijn pas opgelost wanneer herstel automatisch werkt en tekst daadwerkelijk zichtbaar verandert; een succesvol verstuurde call is onvoldoende bewijs.
