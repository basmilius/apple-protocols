<template>
    <div :class="$style.homePackages">
        <section
            v-for="area of AREAS"
            :key="area.title"
            :class="$style.homeArea">
            <h2 :class="$style.homeAreaTitle">{{ area.title }}</h2>
            <p :class="$style.homeAreaSummary">{{ area.summary }}</p>

            <ul :class="$style.homeAreaList">
                <li
                    v-for="item of area.packages"
                    :key="item.link"
                    :class="$style.homeAreaItem">
                    <a
                        :class="$style.homeAreaLink"
                        :href="item.link">
                        <span :class="$style.homeAreaName">{{ item.name }}</span>
                        <span :class="$style.homeAreaBlurb">{{ item.blurb }}</span>
                    </a>
                </li>
            </ul>
        </section>
    </div>
</template>

<script
    lang="ts"
    setup>
    type Area = {
        readonly title: string;
        readonly summary: string;
        readonly packages: { readonly name: string; readonly link: string; readonly blurb: string }[];
    };

    const AREAS: Area[] = [
        {
            title: 'Devices',
            summary: 'An Apple TV or HomePod as one object that connects, recovers and exposes what the device can do.',
            packages: [
                {name: '@corewire/devices', link: '/guide/getting-started', blurb: 'AppleTV, HomePod, discovery, pairing and credentials'},
                {name: '@corewire/devices/catalog', link: '/guide/catalog', blurb: 'Lyrics and animated artwork from Apple Music'},
                {name: '@corewire/audio-source', link: '/guide/media', blurb: 'MP3, OGG, WAV, FLAC and QOA decoders, PCM, FFmpeg, live input'}
            ]
        },
        {
            title: 'Protocols',
            summary: 'The sessions underneath, for a protocol without the device layer.',
            packages: [
                {name: '@corewire/airplay', link: '/protocols/airplay', blurb: 'AirPlay 2 sessions, URL playback, audio streams and timing'},
                {name: '@corewire/airplay/mrp', link: '/protocols/mrp', blurb: 'Media Remote: keys, commands, volume and now playing state'},
                {name: '@corewire/airplay/raop', link: '/protocols/raop', blurb: 'Audio to RAOP receivers such as the AirPort Express'},
                {name: '@corewire/companion-link', link: '/protocols/companion-link', blurb: 'Apps, accounts, power, text input and touch on an Apple TV'}
            ]
        },
        {
            title: 'Core',
            summary: 'What the protocols share. It knows no protocol itself.',
            packages: [
                {name: '@corewire/core', link: '/protocols/pairing', blurb: 'HAP pairing, encrypted transport, mDNS, errors and logging'},
                {name: '@corewire/core/encoding', link: '/protocols/encoding', blurb: 'TLV8, OPack, plist, DAAP, NTP and RTI codecs'}
            ]
        },
        {
            title: 'Standalone',
            summary: 'Codecs without dependencies, which core re-exports.',
            packages: [
                {name: 'opack', link: '/reference/opack', blurb: 'OPack, the binary object format of Companion Link'},
                {name: 'tlv8', link: '/reference/tlv8', blurb: 'TLV8, the type-length-value format of HomeKit pairing'}
            ]
        }
    ];
</script>

<style module>
    /* The child selectors nest under .homeArea to outweigh the `.vp-doc` element styles. */
    .homePackages {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 16px;
    }

    .homeArea {
        padding: 24px;
        border: 1px solid var(--vp-c-divider);
        border-radius: 12px;
        background: var(--vp-c-bg-soft);
    }

    .homeArea .homeAreaTitle {
        font-size: 20px;
        line-height: 28px;
        margin: 0;
        padding: 0;
        border: 0;
    }

    .homeArea .homeAreaSummary {
        font-size: 14px;
        line-height: 22px;
        margin: 8px 0 16px;
        color: var(--vp-c-text-2);
    }

    .homeArea .homeAreaList {
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .homeArea .homeAreaItem {
        margin: 0;
    }

    .homeArea .homeAreaLink {
        display: flex;
        flex-direction: column;
        margin: 0 -10px;
        padding: 6px 10px;
        transition: background-color 0.15s;
        text-decoration: none;
        border-radius: 8px;
    }

    .homeArea .homeAreaLink:hover {
        background: var(--vp-c-default-soft);
    }

    .homeAreaName {
        font-family: var(--vp-font-family-mono);
        font-size: 13px;
        font-weight: 600;
        line-height: 20px;
        color: var(--vp-c-brand-1);
    }

    .homeAreaBlurb {
        font-size: 13px;
        line-height: 20px;
        color: var(--vp-c-text-2);
    }
</style>
