import { defineConfig } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';
import { nav, sidebar } from './navigation.ts';

export default defineConfig({
    title: 'Apple Protocols',
    titleTemplate: ':title | Apple Protocols',
    description: 'TypeScript packages that control Apple TVs and HomePods over AirPlay 2, the Media Remote Protocol, RAOP and Companion Link, on Node.js and Bun without native dependencies.',
    head: [
        ['link', {rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg'}],
        ['meta', {name: 'application-name', content: 'Apple Protocols'}],
        ['meta', {property: 'og:site_name', content: 'Apple Protocols'}],
        ['meta', {property: 'og:type', content: 'website'}]
    ],
    cleanUrls: true,
    sitemap: {
        hostname: 'https://apple-protocols.dev'
    },
    vite: {
        plugins: [
            llmstxt({
                domain: 'https://apple-protocols.dev',
                generateLLMsTxt: true,
                generateLLMsFullTxt: true,
                generateLLMFriendlyDocsForEachPage: true,
                injectLLMHint: true
            })
        ]
    },
    themeConfig: {
        siteTitle: false,
        search: {
            provider: 'local'
        },
        nav,
        sidebar,
        socialLinks: [
            {icon: 'github', link: 'https://github.com/basmilius/apple-protocols'},
            {icon: 'npm', link: 'https://www.npmjs.com/org/apple-protocols'}
        ],
        editLink: {
            pattern: 'https://github.com/basmilius/apple-protocols/edit/main/docs/:path'
        },
        outline: {
            level: [2, 3]
        },
        footer: {
            message: 'Apple Protocols is released under the MIT license.',
            copyright: 'Copyright 2026 <a href="https://github.com/basmilius">Bas Milius</a>'
        }
    }
});
