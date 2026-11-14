<template>
    <div class="home-packages">
        <section
            v-for="area of AREAS"
            :key="area.title"
            class="home-area">
            <h2>{{ area.title }}</h2>
            <p>{{ area.summary }}</p>
            <ul>
                <li
                    v-for="item of area.packages"
                    :key="item.link">
                    <a :href="item.link">
                        <span class="name">{{ item.name }}</span>
                        <span class="blurb">{{ item.blurb }}</span>
                    </a>
                </li>
            </ul>
        </section>
    </div>
</template>

<script
    lang="ts"
    setup>
    interface Area {
        readonly title: string;
        readonly summary: string;
        readonly packages: { readonly name: string; readonly link: string; readonly blurb: string }[];
    }

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
            summary: 'The sessions underneath, for when you want a protocol without the device layer.',
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
        }
    ];
</script>

<style scoped>
    .home-packages {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 16px;
    }

    .home-area {
        padding: 24px;
        border: 1px solid var(--vp-c-divider);
        border-radius: 12px;
        background: var(--vp-c-bg-soft);
    }

    .home-area h2 {
        margin: 0;
        padding: 0;
        border: 0;
        font-size: 20px;
        line-height: 28px;
    }

    .home-area p {
        margin: 8px 0 16px;
        color: var(--vp-c-text-2);
        font-size: 14px;
        line-height: 22px;
    }

    .home-area ul {
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .home-area li {
        margin: 0;
    }

    .home-area a {
        display: flex;
        flex-direction: column;
        margin: 0 -10px;
        padding: 6px 10px;
        border-radius: 8px;
        text-decoration: none;
        transition: background-color 0.15s;
    }

    .home-area a:hover {
        background: var(--vp-c-default-soft);
    }

    .name {
        font-family: var(--vp-font-family-mono);
        font-size: 13px;
        font-weight: 600;
        line-height: 20px;
        color: var(--vp-c-brand-1);
    }

    .blurb {
        font-size: 13px;
        line-height: 20px;
        color: var(--vp-c-text-2);
    }
</style>
