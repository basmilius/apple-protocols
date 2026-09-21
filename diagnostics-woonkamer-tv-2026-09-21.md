# Testresultaten Woonkamer TV

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
