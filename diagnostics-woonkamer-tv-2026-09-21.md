# Testresultaten Woonkamer TV

## Hertest na de implementatiefixes

Op 21 september 2026 vanaf circa 20:17 UTC is commit `9ceb238` op Woonkamer TV getest. De werkboom was bij aanvang schoon. Tijdens de drie herstelproeven bleef diagnostics hetzelfde proces, 63420.

| Onderdeel | Resultaat |
| --- | --- |
| Data-, event- en controlstreamverlies | Drie afzonderlijke simulateDrop-acties. Elke keer automatisch recovered, met beide protocollen weer verbonden. Geen handmatige reconnect nodig |
| Bediening na herstel | AirPlay-pauze slaagt en de snapshot wordt Paused; Companion hervat de muziek |
| Companion-tekstinvoer vóór aanvullende correctie | Plist wordt gelezen, maar sessie-UUID wordt afgewezen |
| Aanvullende correctie | De ontvangen UUID is rechtstreeks 16 bytes, geen NSUUID-object. De decoder accepteert nu beide vormen. Diagnostics is voor deze bronwijziging automatisch herstart |
| Companion vervangen en toevoegen | Gebruiker bevestigt exact `test`, daarna `test café 😀` |
| Publieke keyboard-controller | Gebruiker bevestigt leeg veld na clear. Na opnieuw openen van Zoek bevestigt de gebruiker exact `nieuw` via keyboard.type |
| Directe AirPlay-tekstinvoer | De RTI-sessieaanvraag krijgt een antwoord zonder sessiedata. De API geeft No active AirPlay text input session. Deze route is nog niet werkend aangetoond |

De CLI-wachtfunctie zag het recovered-event niet. De recovery-status meldde wel recovered en de opnieuw uitgevoerde protocolcalls werkten. Dit is een afzonderlijke beperking in de waarneembaarheid via de agent-bridge, geen mislukte reconnect.

De kleine UUID-correctie en dit verslag staan lokaal. Projectbuild en Homey-build slagen. Er zijn geen geautomatiseerde tests toegevoegd. Na afloop zijn de zoektekst gewist, Muziek hervat en beide verbindingen als connected teruggelezen. Recovery staat weer uit, zoals bij aanvang.

## Hertest zonder ander werk

Op 21 september 2026, ongeveer 19:48–19:53 UTC, zijn de kerntests opnieuw uitgevoerd op commit `d299753`. De werkboom was voor en na de hardwaretests schoon. Diagnostics behield proces 51237. Er waren geen waargenomen herstarts. Onderstaande resultaten vervangen de eerdere beoordeling waar ze verschillen.

| Onderdeel | Resultaat hertest |
| --- | --- |
| AirPlay en Companion verbinden | Beide verbonden; handmatig disconnect/connect slaagt met bestaande credentials |
| Pauze/hervatten | Via beide protocollen geslaagd, zowel teruggelezen als door gebruiker bevestigd. AirPlay-antwoorden 71/194 ms, Companion 7/35 ms |
| AirPlay metadata | Titel, artiest, album en afspeelstatus ontvangen; trackwissels blijven binnenkomen |
| Companion applijst en apps openen | 26 apps; Zoek opent en gebruiker bevestigt zichtbaar toetsenbord; Muziek na afloop weer geopend |
| Companion wakkerstatus | `awake`, 15 ms |
| Companion media-capabilities | Play, pause, vorige/volgende, spoelen en volume staan nu true. Skip forward/backward false. Eerdere afwijking met uitsluitend false reproduceert niet |
| Volume uitlezen | Afwijking blijft: AirPlay 0, Companion circa 0.10. Betekenis per route niet vastgesteld |
| Companion tekstinvoer | Actieve lege tekstsessie bevestigd. `textSet('test')` faalt met `Invalid binary plist. Expected 'bplist00' at offset 0.` |
| AirPlay tekstinvoer | `remote.textSet('test')` meldt succes; gebruiker bevestigt leeg veld |
| AirPlay audiostream | 440 Hz gedurende 10 seconden op -20 dB, standaardpad zonder PTP-experiment. Gebruiker bevestigt hoorbaar, zonder haperingen |
| Audiotelemetrie | Tijdens stream 270 pakketten en 389880 bytes; geen retransmitrequests. Dit is een tussentijdse meting |
| Automatisch herstel | Recovery ingeschakeld, DataStream vernietigd, geen recovered-event binnen 10 seconden. Ook daarna geen herstelpoging; connected blijft staan. Volgend AirPlay-commando faalt met ConnectionClosedError. Handmatig opnieuw verbinden herstelt bediening |

De ontvangen Companion-tekstpayload begint aantoonbaar met `bplist00`, 1835 bytes in traffic-record 2706. Toch faalt de parser. `textInputCommand` gebruikt `Buffer.from(tiD).buffer` zonder byteOffset/byteLength. Dit is een concrete aanwijzing voor een fout bij het doorgeven van de buffer aan de parser; in deze testronde is geen reparatie uitgevoerd. Een latere tekstsessie-notificatie levert dezelfde parserfout in CompanionLinkState op.

De audiotest slaagt nu op -20 dB. De eerste ronde gebruikte -30 dB en een andere, veranderende codeversie. Daardoor is niet vastgesteld waarom die eerdere test stil bleef. Tien seconden goed geluid is geen bewijs voor langdurige streamingstabiliteit.

Conclusie van de hertest: basisbediening, metadata, app openen en korte audiostreaming werken. Tekstinvoer en automatisch herstel na de gesimuleerde socketbreuk falen reproduceerbaar zonder verstoring door ander werk. Nieuwe pairing, URL/video-playback, langdurige belasting, echte netwerkuitval en overige niet uitgevoerde functies blijven onbeoordeeld.

Na afloop is de teststream gestopt en Muziek hervat, teruggelezen als Playing. Beide protocollen zijn verbonden. Recovery is weer uitgeschakeld zoals bij aanvang. Alleen dit verslag is aangepast.

## Eerste ronde, met tussentijdse bronwijzigingen

Getest op 21 september 2026 met de draaiende diagnostics-app, ongeveer 18:40–18:47 UTC. Device: AppleTV11,1, OS-build 24K5088l. De gebruiker keek en luisterde mee.

De basis voor afstandsbediening werkt. Deze ronde geeft geen grond om de volledige AirPlay- en Companion Link-implementatie compleet of stabiel te noemen.

| Onderdeel | Waarneming | Oordeel |
| --- | --- | --- |
| Discovery | Woonkamer-TV.local gevonden op 192.168.1.91 | Werkt |
| Bestaande pairing | Beide protocollen verbinden met opgeslagen credentials; opnieuw verbinden werkt | Werkt; nieuwe PIN-pairing niet getest |
| AirPlay/MRP metadata | Titel, artiest, album, voortgang en trackwissels ontvangen | Werkt in Apple Music |
| AirPlay pauze/hervatten | Succesrespons, status-events en bevestiging door gebruiker | Werkt |
| Companion pauze/hervatten | Succesrespons, AirPlay-status wordt Paused en gebruiker bevestigt hervatten | Werkt |
| Companion applijst | 26 apps ontvangen, antwoord in 14 ms | Werkt |
| Companion app openen | Zoek zichtbaar volgens gebruiker; later Muziek weer geopend | Werkt |
| Companion wakkerstatus | `awake`, antwoord in 10 ms | Werkt |
| Companion media-capabilities | Wire-response bevat MediaControlFlags=511, SDK meldt alle capabilities false | Inconsistent |
| Companion aanvullende metadata | Now-playing en supported-actions responses hebben lege `_c` | Geen bruikbare gegevens in deze situatie |
| Volume uitlezen | AirPlay-snapshot 0; Companion GetVolume circa 0.10 | Inconsistent; juiste referentie/route niet vastgesteld |
| Companion tekstinvoer | Zoek geopend, `textSet('test')` meldt succes, veld blijft leeg volgens gebruiker | Werkt niet in deze test |
| AirPlay tekstinvoer | Zelfde veld, `remote.textSet('test')` meldt succes, veld blijft leeg | Werkt niet in deze test |
| AirPlay audiostream | 440 Hz, 8 s, -30 dB, standaardpad zonder PTP-experiment. Muziek stopt, gebruiker hoort geen toon | Geen hoorbare uitvoer |
| Audiotelemetrie | Tussentijds 162 pakketten, 233928 bytes, 0 retransmitrequests en gerapporteerd pakketverlies 0 | Bewijst verzending, geen hoorbare ontvangst |
| Socket-herstel | Recovery ingeschakeld; simulateDrop sluit DataStream. Log: `Connection closed (normally)`. Status blijft connected, recovery blijft `socket destroyed`, geen herstelpoging | Hersteltest faalt; simulatie/propagatie van disconnect nader onderzoeken |

Companion-tekstinvoer ontving een lege `_tiStart`-response. De implementatie keert dan terug zonder tekst te versturen; de manager rapporteert geen fout. Dat verklaart waarom een geslaagde API-call hier geen geslaagde invoer betekent. De eerste tekstpoging telt niet mee: Zoek was toen alweer gesloten. Bovenstaande beoordeling gebruikt de herhaling met opnieuw geopende Zoek-app.

De hersteltest is tweemaal uitgevoerd. Rond de eerste poging wisselde het diagnostics-proces. Tijdens deze sessie veranderden ook bronbestanden door ander werk; automatische dev-herstarts zijn daardoor een mogelijke verklaring. Er is geen bewijs voor een crash. Bij de tweede poging bleef de recovery-status op `socket destroyed` staan. Handmatig disconnect/connect herstelde de sessie.

Geen error- of warn-logs gevonden in de gecontroleerde buffers, ook niet bij de stille audiostream. Buffers worden bij een app-herstart gewist; dit is geen bewijs dat de volledige sessie foutloos was.

## Vervolgonderzoek

1. Onderzoek waarom het sluiten van de DataStream geen bruikbare disconnect/recovery oplevert en waarom connected blijft staan.
2. Onderzoek audiotiming en ontvangerrouting van de stille stream. Geen hogere volumes geprobeerd.
3. Controleer tekstsessieactivatie en laat ontbrekende tekstsessies herkenbaar mislukken.
4. Controleer het verwerken van Companion mediaflags en de betekenis van de verschillende volumewaarden.

Nieuwe pairing, URL/video-playback, langdurige streaming, netwerkuitval, slaap/wake, navigatie/touch, seek/queue, accountwisseling, multiroom en andere receivers zijn niet gevalideerd. Voor een stabiliteitsoordeel is een langere run nodig op een vaste codeversie zonder dev-herstarts.

Na afloop is de teststream gestopt, Muziek geopend en playback teruggelezen als Playing. Recovery was na de hersteltest weer uitgeschakeld, zoals bij aanvang. Er zijn geen implementatiebestanden door deze tests gewijzigd.
