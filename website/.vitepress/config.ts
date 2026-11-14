import { defineConfig } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';
import { nav, sidebar } from './navigation.ts';

export default defineConfig({
    title: 'corewire',
    titleTemplate: ':title | corewire',
    description: 'TypeScript packages that control Apple TVs and HomePods over AirPlay 2, the Media Remote Protocol, RAOP and Companion Link, on Node.js and Bun without native dependencies.',
    cleanUrls: true,
    sitemap: {
        hostname: 'https://corewire.dev'
    },
    vite: {
        plugins: [
            llmstxt({
                domain: 'https://corewire.dev',
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
            {icon: 'npm', link: 'https://www.npmjs.com/org/corewire'}
        ],
        editLink: {
            pattern: 'https://github.com/basmilius/apple-protocols/edit/main/website/:path'
        },
        outline: {
            level: [2, 3]
        },
        footer: {
            message: 'Released under the MIT license.',
            copyright: 'Copyright 2026 <a href="https://github.com/basmilius">Bas Milius</a>'
        }
    }
});
