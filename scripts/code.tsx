import { renderToStaticMarkup } from 'react-dom/server'
import { Highlight, type PrismTheme, type Language } from 'prism-react-renderer'
import type { Lang } from '../src/lib/lang'

const electric: PrismTheme = {
  plain: { color: '#E9E4F5', backgroundColor: '#171126' },
  styles: [
    { types: ['keyword', 'operator'], style: { color: '#D5ADFF' } },
    { types: ['string'], style: { color: '#C6F432' } },
    { types: ['function'], style: { color: '#FF91CB' } },
    { types: ['class-name', 'builtin'], style: { color: '#9DDFFF' } },
    { types: ['punctuation'], style: { color: '#C2B7D6' } },
    { types: ['comment'], style: { color: '#B4A7C8' } },
  ],
}
export function codeHtml(code: string, language: string, lang: Lang) {
  return renderToStaticMarkup(<div className="code-window"><div className="code-title"><span>{language}</span><button type="button" data-copy>{lang === 'zh' ? '复制' : 'Copy'}</button></div><Highlight code={code} language={language as Language} theme={electric}>{({ tokens, getTokenProps }) => <pre><code>{tokens.map((line, i) => <span key={i} className="code-line">{line.map((token, j) => <span key={j} {...getTokenProps({ token })} />)}{'\n'}</span>)}</code></pre>}</Highlight></div>)
}
