import React from 'react'
import { createRoot } from 'react-dom/client'
import { hydrateRoot } from 'react-dom/client'
import { App } from './App'
import type { Model, Page } from './lib/content'
import { routeInfo } from './lib/lang'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/700.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '../generated/fonts/noto-sans-sc.css'
import './index.css'

async function boot() {
  const initial = document.getElementById('site-data')?.textContent
  const model: Model = initial ? JSON.parse(initial) : {
    pages: await (await fetch('/content.json')).json(), figures: await (await fetch('/figures.json')).json(),
    corpusCount: 0, corpusItems: [], corpusTags: await (await fetch('/api/corpus/tags')).json(), siteUrl: location.origin,
  }
  if (!initial) {
    const { lang, slug } = routeInfo(location.pathname)
    model.currentPage = (model.pages as Page[]).find(p => p.lang === lang && p.slug === slug)
    const corpus = await (await fetch('/api/corpus?limit=20')).json(); model.corpusItems = corpus.items; model.corpusCount = corpus.total }
  const app = <React.StrictMode><App model={model} /></React.StrictMode>
  if (initial) hydrateRoot(document.getElementById('root')!, app)
  else createRoot(document.getElementById('root')!).render(app)
}
void boot()
