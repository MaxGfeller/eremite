import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-01',
  ssr: false,

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Eremite.js — offline-first data layer for any REST backend',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Eremite.js is a zero-dependency, offline-first data layer for apps that talk to any REST backend. Your app, in quiet retreat from the network: reads render instantly from IndexedDB, writes queue in a durable outbox and push exactly once — no special server required.',
        },
        { name: 'theme-color', content: '#f4e9d4' },
        // Social / Open Graph — also carries the tagline into the static HTML
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: 'https://eremitejs.org' },
        {
          property: 'og:title',
          content: 'Eremite.js — Your app, in quiet retreat from the network.',
        },
        {
          property: 'og:description',
          content:
            'A zero-dependency, offline-first data layer for any REST backend. Optimistic UI, a durable outbox, exactly-once writes and multi-tab safety.',
        },
        { name: 'twitter:card', content: 'summary' },
        {
          name: 'twitter:title',
          content: 'Eremite.js — Your app, in quiet retreat from the network.',
        },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'canonical', href: 'https://eremitejs.org' },
      ],
    },
  },
})
