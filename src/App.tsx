import { useEffect, useMemo, useState } from 'react'
import { ingredients, recipes, saveCustom, saveCustomIng, type Cat, type Effort, type Line, type Meal, type Recipe } from './data'
import { T, type Dict, type Lang } from './i18n'
import { defaultPrefs, match, type Prefs, type Result } from './match'

type Screen = 'welcome' | 'ingredients' | 'prefs' | 'results' | 'detail' | 'favorites' | 'history' | 'plan' | 'add' | 'shop'
const cats: Cat[] = ['veg', 'protein', 'dairy', 'legume', 'pantry', 'spices']
const meals: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks']
type ShopItem = { id: string; qty: number; unit: string; done: boolean }
const unitLabel = (t: Dict, u: string) => (u === '' ? '' : (t as Record<string, string>)[u] ?? u)
const mainMeals: Meal[] = ['breakfast', 'lunch', 'dinner']
const shuffle = <T,>(a: T[]) => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
const modeBtns = { quick: ['favorites'], plan: ['plan', 'history', 'favorites'], prep: ['plan', 'shop', 'favorites'] }

const fried = ['tameya', 'bolti', 'baneh', 'fries-plate', 'loqmet-qadi', 'mesaqaa']
const carbIds = ['rice', 'pasta', 'bread', 'potatoes', 'flour', 'sugar', 'semolina', 'kunafa', 'pastry']
const proteinIds = ['chicken', 'breast', 'meat', 'beef', 'liver', 'duck', 'steak', 'mombar', 'denise', 'bolti', 'mackerel', 'shrimp', 'seafood', 'eggs', 'lentils', 'chickpeas', 'fava', 'whitebeans']
const tagsOf = (r: Recipe) => {
  const tags: string[] = []
  if (r.ing.some((l) => proteinIds.includes(l[0]))) tags.push('protein')
  if (r.cat !== 'sweet' && !r.ing.some((l) => !l[3] && carbIds.includes(l[0]))) tags.push('lowcarb')
  if (fried.includes(r.id)) tags.push('fried')
  if (r.cat === 'sweet') tags.push('sweet')
  return tags
}
const lightScore = (r: Recipe) => {
  const g = tagsOf(r)
  return (g.includes('protein') ? 2 : 0) + (g.includes('lowcarb') ? 1 : 0) - (g.includes('fried') ? 2 : 0) - (g.includes('sweet') ? 3 : 0)
}

const kindOf = (r: Recipe) => {
  const has = (...ids: string[]) => r.ing.some((l) => ids.includes(l[0]))
  if (r.cat === 'sweet') return 'sweet'
  if (has('chicken', 'breast')) return 'chicken'
  if (has('meat', 'beef', 'liver', 'duck', 'steak', 'mombar')) return 'meat'
  if (has('fish', 'denise', 'bolti', 'mackerel', 'shrimp', 'seafood')) return 'fish'
  if (has('eggs')) return 'eggs'
  return 'plant'
}
const byId = (id: string) => ingredients.find((i) => i.id === id)!

// Turn typed text into a known ingredient id, or keep it as a custom item
function resolve(text: string): string {
  const t = text.trim().toLowerCase()
  return ingredients.find((i) => i.en.toLowerCase() === t || i.ar === t)?.id ?? t
}

export default function App() {
  const [lang, setLang] = usePersisted<Lang>('lang', 'en')
  const [screen, setScreen] = useState<Screen>('welcome')
  const [sel, setSel] = usePersisted<string[]>('sel', [])
  const [prefs, setPrefs] = usePersisted<Prefs>('prefs', defaultPrefs)
  const [open, setOpen] = useState<Recipe | null>(null)
  const [history, setHistory] = useState<Entry[]>(() => {
    try { return JSON.parse(localStorage.getItem('history') ?? '[]') } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem('history', JSON.stringify(history)) } catch { /* ignore */ }
  }, [history])
  const dayStart = (ts: number) => new Date(ts).setHours(0, 0, 0, 0)
  const dayDiff = (ts: number) => Math.round((dayStart(Date.now()) - dayStart(ts)) / 864e5)
  const cookedText = (id: string) => {
    const last = Math.max(0, ...history.filter((h) => h.id === id).map((h) => h.ts))
    if (!last) return undefined
    const d = dayDiff(last)
    if (d > 7) return undefined
    return d === 0 ? t.cookedToday : t.cookedAgo.replace('{n}', String(d))
  }
  const [prev, setPrev] = useState<Screen>('welcome')
  const openPage = (s: Screen) => {
    if (screen !== 'favorites' && screen !== 'history' && screen !== 'plan' && screen !== 'shop') setPrev(screen)
    setScreen(s)
  }
  const [hidden, setHidden] = usePersisted<string[]>('hidden', [])
  const [plans, setPlans] = usePersisted<Record<string, Slots>>('plans', {})
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [shop, setShop] = usePersisted<ShopItem[]>('shop', [])
  const [mode, setMode] = usePersisted<'quick' | 'plan' | 'prep'>('mode', 'quick')
  const [more, setMore] = useState(false)
  const [menu, setMenu] = useState(false)
  const [diet, setDiet] = usePersisted<boolean>('diet', false)
  const vis = (n: string) => more || modeBtns[mode].includes(n)
  const addShop = (items: { id: string; qty: number; unit: string }[]) => {
    const next = [...shop]
    for (const it of items) {
      const i = next.findIndex((x) => x.id === it.id && x.unit === it.unit)
      if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + it.qty, done: false }
      else next.push({ ...it, done: false })
    }
    setShop(next)
  }
  const surprise = () => {
    const all = match(sel, prefs, true).filter((x) => x.r.meals.includes('lunch') && !hidden.includes(x.r.id))
    const ready = all.filter((x) => x.cookable)
    const picks = shuffle((ready.length >= 5 ? ready : all).map((x) => x.r))
    if (picks.length === 0) return
    setOpen(picks[0])
    setPool(picks.map((r) => r.id))
    setFrom(screen)
    setScreen('detail')
  }
  const [, setVer] = useState(0)
  const [pool, setPool] = useState<string[]>([])
  const [from, setFrom] = useState<Screen>('results')
  const [favs, setFavs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('favs') ?? '[]') as string[] } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem('favs', JSON.stringify(favs)) } catch { /* ignore */ }
  }, [favs])
  const toggleFav = (id: string) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme')
      if (saved === 'light' || saved === 'dark') return saved
    } catch { /* storage unavailable */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const t = T[lang]

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch { /* ignore */ }
  }, [theme])

  useEffect(() => { window.scrollTo(0, 0) }, [screen, open])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const name = (id: string) => (byId(id) ? byId(id)[lang] : id)
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="app">
      <header className="top">
        <button className="brand" onClick={() => setScreen('welcome')}>{t.brand}</button>
        <div className="tools desk">
          {vis('plan') && <button className="ghost" onClick={() => openPage('plan')}>📅 <span className="lbl">{t.plan}</span></button>}
          {vis('history') && <button className="ghost" onClick={() => openPage('history')}>🕘 <span className="lbl">{t.history}</span></button>}
          {vis('shop') && <button className="ghost" onClick={() => openPage('shop')}>🛒 <span className="lbl">{t.shopTitle}</span> ({shop.filter((x) => !x.done).length})</button>}
          {vis('favorites') && <button className="ghost" onClick={() => openPage('favorites')}>♥ <span className="lbl">{t.favorites}</span> ({favs.length})</button>}
          <button className="ghost round" aria-label={t.moreMenu} aria-pressed={more} onClick={() => setMore(!more)}>⋯</button>
          <button className="ghost round" aria-label={theme === 'dark' ? t.light : t.dark} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀' : '☾'}</button>
          <button className="ghost" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>{t.lang}</button>
        </div>
        <div className="tools mob">
          <button className="ghost round" aria-label={theme === 'dark' ? t.light : t.dark} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀' : '☾'}</button>
          <button className="ghost round" aria-label={t.moreMenu} aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button>
        </div>
        {menu && (
          <div className="menu mob" role="menu">
            <button role="menuitem" onClick={() => { openPage('plan'); setMenu(false) }}>📅 {t.plan}</button>
            <button role="menuitem" onClick={() => { openPage('history'); setMenu(false) }}>🕘 {t.history}</button>
            <button role="menuitem" onClick={() => { openPage('shop'); setMenu(false) }}>🛒 {t.shopTitle} ({shop.filter((x) => !x.done).length})</button>
            <button role="menuitem" onClick={() => { openPage('favorites'); setMenu(false) }}>♥ {t.favorites} ({favs.length})</button>
            <button role="menuitem" onClick={() => { setLang(lang === 'en' ? 'ar' : 'en'); setMenu(false) }}>🌐 {t.lang}</button>
          </div>
        )}
      </header>
      <main>
        {screen === 'welcome' && (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">{t.eyebrow}</p>
                <h1>{t.headline}</h1>
                <p className="lead">{t.sub}</p>
                <div className="badges"><span>{t.b1}</span><span>{t.b2}</span><span>{t.b3}</span></div>
                <h3 className="modeh">{t.modeLabel}</h3>
                <div className="chips">
                  {(['quick', 'plan', 'prep'] as const).map((m) => (
                    <button key={m} className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>{t[`mode${m}` as keyof Dict]}</button>
                  ))}
                </div>
                <div className="actions cta">
                  <button className="primary" onClick={() => setScreen('ingredients')}>{t.cta} {lang === 'ar' ? '←' : '→'}</button>
                  <button className="ghost" onClick={surprise}>🎲 {t.surpriseLunch}</button>
                </div>
              </div>
              <div className="pics">
                {['koshari', 'tameya', 'shakshuka', 'basbousa'].map((id) => (
                  <Pic key={id} r={recipes.find((x) => x.id === id)!} lang={lang} t={t} />
                ))}
              </div>
            </section>
            <section className="how">
              {([[t.s1, t.d1], [t.s2, t.d2], [t.s3, t.d3]] as const).map(([h, d], i) => (
                <div key={h}><span className="num">{i + 1}</span><h3>{h}</h3><p className="note">{d}</p></div>
              ))}
            </section>
          </>
        )}
        {screen === 'ingredients' && (
          <Ingredients t={t} lang={lang} sel={sel} toggle={toggle} name={name} setSel={setSel}
            onBack={() => setScreen('welcome')} onNext={() => setScreen('prefs')} />
        )}
        {screen === 'prefs' && (
          <Preferences t={t} lang={lang} prefs={prefs} setPrefs={setPrefs}
            onBack={() => setScreen('ingredients')} onNext={() => setScreen('results')} />
        )}
        {screen === 'results' && (
          <Results t={t} lang={lang} sel={sel} prefs={prefs} name={name} hidden={hidden} onHide={(id) => setHidden([...hidden, id])} onRestore={(ids) => setHidden(hidden.filter((h) => !ids.includes(h)))} favs={favs} onFav={toggleFav} cookedText={cookedText}
            onBack={() => setScreen('prefs')} onEdit={() => setScreen('ingredients')} onAdd={() => { setEditing(null); setScreen('add') }} onSurprise={surprise} simple={mode === 'quick'}
            onOpen={(r, ids) => { setOpen(r); setPool(ids ?? []); setFrom('results'); setScreen('detail') }} />
        )}
        {screen === 'shop' && (
          <Shop t={t} lang={lang} items={shop} setItems={setShop} onBack={() => setScreen(prev)}
            onBought={(ids) => setSel(Array.from(new Set([...sel, ...ids])))} />
        )}
        {screen === 'add' && (
          <AddDish key={editing?.id ?? 'new'} initial={editing ?? undefined} t={t} lang={lang} onBack={() => setScreen('results')} onSave={(r) => {
            const at = recipes.findIndex((x) => x.id === r.id)
            if (at >= 0) recipes[at] = r
            else recipes.push(r)
            saveCustom(recipes.filter((x) => x.custom))
            setVer((v) => v + 1)
            setScreen('results')
          }} />
        )}
        {screen === 'plan' && (
          <Plan t={t} lang={lang} sel={sel} prefs={prefs} hidden={hidden} name={name} history={history} dayDiff={dayDiff} onCooked={(id, meal) => setHistory([...history, { id, ts: Date.now(), meal }])} onBack={() => setScreen(prev)}
            plans={plans} setPlans={setPlans} onShop={addShop} diet={diet} setDiet={setDiet} setLowCarb={(b) => setPrefs({ ...prefs, lowCarb: b })}
            onOpen={(r) => { setOpen(r); setPool([]); setFrom('plan'); setScreen('detail') }} />
        )}
        {screen === 'history' && (
          <History t={t} lang={lang} onBack={() => setScreen(prev)} history={history} dayDiff={dayDiff} onAdd={(id, ts) => setHistory([...history, { id, ts }])}
            onRemove={(ts) => setHistory(history.filter((h) => h.ts !== ts))}
            onOpen={(r) => { setOpen(r); setPool([]); setFrom('history'); setScreen('detail') }} />
        )}
        {screen === 'favorites' && (
          <Favorites t={t} lang={lang} onBack={() => setScreen(prev)} sel={sel} name={name} favs={favs} onFav={toggleFav} cookedText={cookedText}
            onOpen={(r) => { setOpen(r); setPool([]); setFrom('favorites'); setScreen('detail') }} />
        )}
        {screen === 'detail' && open && (
          <Detail key={open.id} lastCooked={(() => { const ts = Math.max(0, ...history.filter((h) => h.id === open.id).map((h) => h.ts)); return ts ? new Date(ts).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined })()} diet={diet} onShop={addShop} onEditDish={() => {
            const i = lang === 'en' ? 0 : 1
            setEditing(open.custom ? open : { ...open, id: `custom-${Date.now()}`, custom: true, desc: [open.desc[i], open.desc[i]], tip: [open.tip[i], open.tip[i]], steps: open.steps.map((st) => [st[i], st[i]] as [string, string]) })
            setScreen('add')
          }} onDelete={open.custom ? () => {
            const i = recipes.findIndex((x) => x.id === open.id)
            if (i >= 0) recipes.splice(i, 1)
            saveCustom(recipes.filter((x) => x.custom))
            setFavs(favs.filter((f) => f !== open.id))
            setVer((v) => v + 1)
            setScreen(from)
          } : undefined} cookedCount={history.filter((h) => h.id === open.id && dayDiff(h.ts) === 0).length} t={t} lang={lang} r={open} onAnother={pool.length > 1 ? () => {
            const id = pool[(pool.indexOf(open.id) + 1) % pool.length]
            setOpen(recipes.find((x) => x.id === id) ?? open)
          } : undefined} sel={sel} name={name} fav={favs.includes(open.id)} onFav={() => toggleFav(open.id)} fromFav={from !== 'results'} onCooked={() => setHistory([...history, { id: open.id, ts: Date.now() }])} onBack={() => setScreen(from)} />
        )}
      </main>
    </div>
  )
}

type Common = { t: Dict; lang: Lang }

function Ingredients(p: Common & { sel: string[]; toggle: (id: string) => void; setSel: (s: string[]) => void; name: (id: string) => string; onBack: () => void; onNext: () => void }) {
  const { t, lang, sel, toggle, name } = p
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = ingredients.filter((i) => !needle || i.en.toLowerCase().includes(needle) || i.ar.includes(needle))
  const allShown = shown.length > 0 && shown.every((i) => sel.includes(i.id))
  const customs = sel.filter((id) => !ingredients.some((i) => i.id === id))
  const addCustom = () => {
    if (!needle) return
    let id = resolve(needle)
    if (!ingredients.some((i) => i.id === id)) {
      id = `x-${Date.now()}`
      ingredients.push({ id, en: q.trim(), ar: q.trim(), cat: 'pantry', custom: true })
      saveCustomIng(ingredients.filter((i) => i.custom))
    }
    if (!sel.includes(id)) p.setSel([...sel, id])
    setQ('')
  }
  return (
    <section className="pick">
      <div>
      <h2>{t.ingTitle}</h2>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          placeholder={t.search} aria-label={t.search} />
        <button className="ghost" onClick={addCustom}>{t.add}</button>
      </div>
      {shown.length > 0 && (
        <button className="ghost small" onClick={() => p.setSel(allShown
          ? sel.filter((id) => !shown.some((i) => i.id === id))
          : [...sel, ...shown.filter((i) => !sel.includes(i.id)).map((i) => i.id)])}>
          {allShown ? t.deselectAll : t.selectAllIng}
        </button>
      )}
      {shown.length === 0 && <p className="note">{t.notFound}</p>}
      {cats.map((c) => {
        const list = shown.filter((i) => i.cat === c)
        const allOn = list.length > 0 && list.every((i) => sel.includes(i.id))
        const toggleAll = () => p.setSel(allOn
          ? sel.filter((id) => !list.some((i) => i.id === id))
          : [...sel, ...list.filter((i) => !sel.includes(i.id)).map((i) => i.id)])
        return list.length ? (
          <div key={c}>
            <div className="sec">
              <h3>{t[c]}</h3>
              <button className="link" onClick={toggleAll}>{allOn ? t.deselectAll : t.selectAll}</button>
            </div>
            <div className="chips">
              {list.map((i) => (
                <button key={i.id} className="chip" aria-pressed={sel.includes(i.id)} onClick={() => toggle(i.id)}>{i[lang]}</button>
              ))}
            </div>
          </div>
        ) : null
      })}
      </div>
      <aside className="side">
        <strong>{sel.length} {t.selected}</strong>
        {sel.length === 0 ? <p className="note">{t.none}</p> : (
          <div className="chips">
            {sel.map((id) => (
              <button key={id} className="chip on" onClick={() => toggle(id)} aria-label={`${name(id)} ✕`}>{name(id)} ✕</button>
            ))}
          </div>
        )}
        {customs.length > 0 && <p className="note">{t.custom}</p>}
        <div className="actions">
          <button className="ghost" onClick={p.onBack}>{t.back}</button>
          {sel.length > 0 && <button className="ghost" onClick={() => p.setSel([])}>{t.clear}</button>}
          <button className="primary" disabled={sel.length === 0} onClick={p.onNext}>{t.next}</button>
        </div>
      </aside>
    </section>
  )
}

function Preferences(p: Common & { prefs: Prefs; setPrefs: (p: Prefs) => void; onBack: () => void; onNext: () => void }) {
  const { t, lang, prefs, setPrefs } = p
  const times = [[15, t.t15], [30, t.t30], [45, t.t45], [0, t.t0]] as const
  const efforts: [Effort, string][] = [[0, t.e0], [1, t.e1], [2, t.e2]]
  return (
    <section className="panel">
      <h2>{t.prefTitle}</h2>
      <h3>{t.time}</h3>
      <div className="chips">
        {times.map(([v, l]) => <button key={v} className="chip" aria-pressed={prefs.maxTime === v} onClick={() => setPrefs({ ...prefs, maxTime: v })}>{l}</button>)}
      </div>
      <h3>{t.effort}</h3>
      <div className="chips">
        {efforts.map(([v, l]) => <button key={v} className="chip" aria-pressed={prefs.maxEffort === v} onClick={() => setPrefs({ ...prefs, maxEffort: v })}>{l}</button>)}
      </div>
      <div className="check"><label><input type="checkbox" checked={prefs.veg} onChange={(e) => setPrefs({ ...prefs, veg: e.target.checked })} /> {t.vegOnly}</label></div>
      <div className="check"><label><input type="checkbox" checked={!!prefs.lowCarb} onChange={(e) => setPrefs({ ...prefs, lowCarb: e.target.checked })} /> {t.lowcarb}</label></div>
      <details className="more">
        <summary>{t.exclude}{prefs.exclude.length > 0 ? ` (${prefs.exclude.length})` : ''}</summary>
      <div className="chips">
        {ingredients.filter((i) => i.cat !== 'spices').map((i) => (
          <button key={i.id} className="chip" aria-pressed={prefs.exclude.includes(i.id)}
            onClick={() => setPrefs({ ...prefs, exclude: prefs.exclude.includes(i.id) ? prefs.exclude.filter((x) => x !== i.id) : [...prefs.exclude, i.id] })}>{i[lang]}</button>
        ))}
      </div>
      </details>
      <div className="actions end">
        <button className="ghost" onClick={p.onBack}>{t.back}</button>
        <button className="primary" onClick={p.onNext}>{t.show}</button>
      </div>
    </section>
  )
}

function Results(p: Common & { sel: string[]; prefs: Prefs; hidden: string[]; onHide: (id: string) => void; onRestore: (ids: string[]) => void; favs: string[]; onFav: (id: string) => void; cookedText: (id: string) => string | undefined; name: (id: string) => string; onBack: () => void; onEdit: () => void; onAdd: () => void; onSurprise: () => void; simple: boolean; onOpen: (r: Recipe, pool?: string[]) => void }) {
  const { t, lang, name } = p
  const [all, setAll] = useState(false)
  const [limit, setLimit] = useState(p.simple ? 3 : 5)
  const [q, setQ] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const needle = q.trim().toLowerCase()
  const [rc, setRc] = useState<Meal | 'all'>('all')
  const hay = (x: Result) => [x.r.en, x.r.ar, ...x.r.ing.map((l) => `${byId(l[0]).en} ${byId(l[0]).ar}`)].join(' ').toLowerCase()
  const inCat = (x: Result) => !p.hidden.includes(x.r.id) && (rc === 'all' || x.r.meals.includes(rc)) && (!needle || hay(x).includes(needle))
  const list = useMemo(() => match(p.sel, p.prefs, all || needle !== '').filter(inCat), [p.sel, p.prefs, p.hidden, all, rc, needle]) // eslint-disable-line react-hooks/exhaustive-deps
  const fullCount = useMemo(() => match(p.sel, p.prefs, true).filter(inCat).length, [p.sel, p.prefs, p.hidden, rc, needle]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="panel wide">
      <h2>{t.resTitle}</h2>
      <div className="actions">
        <button className="ghost" onClick={p.onBack}>{t.back}</button>
        <button className="ghost" onClick={p.onEdit}>{t.edit}</button>
        <button className="ghost" onClick={p.onAdd}>＋ {t.addDish}</button>
        {rc === 'lunch' && (
          <button className="ghost" onClick={p.onSurprise}>🎲 {t.surprise}</button>
        )}
      </div>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchRecipes} aria-label={t.searchRecipes} />
      </div>
      <div className="chips">
        {(['all', ...meals] as const).map((c) => (
          <button key={c} className="chip" aria-pressed={rc === c} onClick={() => { setRc(c); setLimit(p.simple ? 3 : 5); setAll(false) }}>{c === 'all' ? t.cAll : t[`m${c}` as keyof Dict]}</button>
        ))}
      </div>
      {list.length === 0 && (
        <div className="empty"><h3>{t.noRes}</h3><p>{t.noResHint}</p></div>
      )}
      {p.hidden.length > 0 && <button className="link" onClick={() => setShowHidden(!showHidden)}>{t.hiddenTitle} ({p.hidden.length})</button>}
      {showHidden && p.hidden.length > 0 && (
        <div className="empty">
          <ul className="ings">
            {p.hidden.map((id) => {
              const r = recipes.find((x) => x.id === id)
              return r ? <li key={id}><span>{r.emoji} {r[lang]}</span><button className="link" onClick={() => p.onRestore([id])}>{t.restore}</button></li> : null
            })}
          </ul>
          <button className="ghost small" onClick={() => p.onRestore(p.hidden)}>{t.restoreAll}</button>
        </div>
      )}
      <div className="grid">
        {list.slice(0, needle ? 999 : limit).map((x) => <Card key={x.r.id} x={x} t={t} lang={lang} name={name} cooked={p.cookedText(x.r.id)} fav={p.favs.includes(x.r.id)} onFav={() => p.onFav(x.r.id)} onHide={() => p.onHide(x.r.id)} onOpen={() => p.onOpen(x.r)} />)}
      </div>
      {list.length > 0 && <p className="note">{t.showing.replace('{a}', String(Math.min(needle ? list.length : limit, list.length))).replace('{b}', String(list.length))}</p>}
      <div className="actions">
        {list.length > limit && !needle && <button className="ghost" onClick={() => setLimit(limit + 5)}>{t.more} ({Math.min(5, list.length - limit)})</button>}
        {(list.length > limit || (!all && fullCount > list.length)) && (
          <button className="ghost" onClick={() => { setAll(true); setLimit(999) }}>{t.all}</button>
        )}
      </div>
    </section>
  )
}

function Card({ x, t, lang, name, onOpen, fav, onFav, cooked, onHide }: Common & { onHide?: () => void; cooked?: string; x: Result; name: (id: string) => string; onOpen: () => void; fav: boolean; onFav: () => void }) {
  const { r } = x
  return (
    <article className="card">
      <div className="media">
        <Pic r={r} lang={lang} t={t} />
        <button className="heart" aria-pressed={fav} aria-label={fav ? t.removeFav : t.saveFav} onClick={onFav}>{fav ? '♥' : '♡'}</button>
      </div>
      <div className="body">
        <h3>{r[lang]}</h3>
        <p className="meta">{r.prep + r.cook} {t.min} · {[t.e0, t.e1, t.e2][r.effort]}</p>
        {x.cookable ? <p className="ok">✓ {t.cookable}</p> : <p className="warn">{t.missing}: {x.missing.map(name).join('، ').replace(/، /g, lang === 'ar' ? '، ' : ', ')}</p>}
        {cooked && <p className="note">{cooked}</p>}
        <button className="primary small" onClick={onOpen}>{t.open}</button>
        {onHide && <button className="link" onClick={onHide}>{t.hide}</button>}
      </div>
    </article>
  )
}

function Detail({ t, lang, r, sel, name, onBack, fav, onFav, fromFav, onCooked, onAnother, cookedCount, onDelete, onShop, onEditDish, diet, lastCooked }: Common & { lastCooked?: string; diet: boolean; onEditDish: () => void; onShop: (items: { id: string; qty: number; unit: string }[]) => void; onDelete?: () => void; cookedCount: number; onAnother?: () => void; onCooked: () => void; r: Recipe; sel: string[]; name: (id: string) => string; onBack: () => void; fav: boolean; onFav: () => void; fromFav: boolean }) {
  const [servings, setServings] = useState(r.servings)
  const unit = (u: string) => (u in t ? (t as Record<string, string>)[u] : u)
  const qty = (q: number) => Math.round(((q * servings) / r.servings) * 10) / 10
  const [copied, setCopied] = useState(false)
  const [added, setAdded] = useState(false)
  const missing = r.ing.filter((l) => !l[3] && !sel.includes(l[0]))
  const shopText = missing.map(([id, q, u]) => `- ${qty(q)} ${unit(u)} ${name(id)}`.replace(/ {2,}/g, ' ')).join('\n')
  const copy = async () => {
    try { await navigator.clipboard.writeText(shopText); setCopied(true) } catch { /* clipboard blocked */ }
  }
  return (
    <section className="panel wide">
      <div className="actions">
        <button className="ghost" onClick={onBack}>{fromFav ? t.back : t.backRes}</button>
        {onAnother && <button className="ghost" onClick={onAnother}>🎲 {t.another}</button>}
      </div>
      <div className="dhead">
        <Pic r={r} lang={lang} t={t} big />
        <div>
      <h2>{r[lang]}</h2>
          {r.en !== r.ar && <p className="note">{r[lang === 'en' ? 'ar' : 'en']}</p>}
      {r.desc[lang === 'en' ? 0 : 1] && <p className="lead">{r.desc[lang === 'en' ? 0 : 1]}</p>}
      <p className="meta">{t.prep} {r.prep} {t.min} · {t.cook} {r.cook} {t.min} · {t.total} {r.prep + r.cook} {t.min} · {[t.e0, t.e1, t.e2][r.effort]}</p>
        {diet && tagsOf(r).length > 0 ? <p className="meta">{tagsOf(r).map((g) => t[`tag${g}` as keyof Dict]).join(' · ')}</p> : null}
      <div className="actions"><button className="ghost" aria-pressed={fav} onClick={onFav}>{fav ? '♥' : '♡'} {fav ? t.removeFav : t.saveFav}</button>
      <button className="primary small" onClick={onCooked}>✓ {cookedCount > 0 ? `${t.cookedToday}${cookedCount > 1 ? ` ×${cookedCount}` : ''}` : t.cookedBtn}</button></div>
      {cookedCount > 0 && <p className="note">{t.cookAgain}</p>}
        {lastCooked && <p className="note">{t.lastCooked}: {lastCooked}</p>}
        </div>
      </div>
      <div className="row">
        <span>{t.servings}</span>
        <button className="ghost small" aria-label="−" onClick={() => setServings(Math.max(1, servings - 1))}>−</button>
        <strong>{servings}</strong>
        <button className="ghost small" aria-label="+" onClick={() => setServings(servings + 1)}>+</button>
      </div>
      <h3>{t.ingredients}</h3>
      <ul className="ings">
        {r.ing.map(([id, q, u, opt]) => (
          <li key={id} className={sel.includes(id) ? 'have' : 'need'}>
            <span>{qty(q)} {unit(u)} {name(id)}{opt ? ` (${t.optional})` : ''}</span>
            <span>{sel.includes(id) ? `✓ ${t.have}` : t.need}</span>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <div className="shop">
          <h3>{t.shopTitle}</h3>
          <ul className="ings">{missing.map(([id, q, u]) => <li key={id}><span>{qty(q)} {unit(u)} {name(id)}</span></li>)}</ul>
          <div className="actions">
            <button className="primary small" onClick={() => { onShop(missing.map(([id, q, u]) => ({ id, qty: qty(q), unit: u }))); setAdded(true) }}>{added ? t.added : `🛒 ${t.addToShop}`}</button>
            <button className="ghost small" onClick={copy}>{copied ? t.copied : t.copy}</button>
          </div>
        </div>
      )}
      <h3>{t.steps}</h3>
      <ol className="steps">{r.steps.map((s, i) => <li key={i}>{s[lang === 'en' ? 0 : 1]}</li>)}</ol>
      {r.tip[lang === 'en' ? 0 : 1] && <p className="tip"><strong>{t.tip}:</strong> {r.tip[lang === 'en' ? 0 : 1]}</p>}
      <div className="actions">
        <button className="ghost small" onClick={onEditDish}>{r.custom ? t.editDish : t.copyDish}</button>
        {r.custom && onDelete && <button className="ghost small" onClick={() => { if (window.confirm(t.confirmDelete)) onDelete() }}>{t.deleteDish}</button>}
      </div>
    </section>
  )
}

function Favorites(p: Common & { onBack: () => void; cookedText: (id: string) => string | undefined; sel: string[]; favs: string[]; name: (id: string) => string; onFav: (id: string) => void; onOpen: (r: Recipe) => void }) {
  const list = match(p.sel, defaultPrefs, true).filter((x) => p.favs.includes(x.r.id))
  return (
    <section className="panel wide">
      <button className="ghost" onClick={p.onBack}>{p.t.back}</button>
      <h2>♥ {p.t.favorites}</h2>
      {list.length === 0 && <div className="empty"><p>{p.t.noFavs}</p></div>}
      <div className="grid">
        {list.map((x) => <Card key={x.r.id} x={x} t={p.t} lang={p.lang} name={p.name} cooked={p.cookedText(x.r.id)} fav onFav={() => p.onFav(x.r.id)} onOpen={() => p.onOpen(x.r)} />)}
      </div>
    </section>
  )
}

type Slots = Partial<Record<Meal, string>>

function Plan(p: Common & { diet: boolean; setDiet: (b: boolean) => void; setLowCarb: (b: boolean) => void; history: Entry[]; dayDiff: (ts: number) => number; onCooked: (id: string, meal?: Meal) => void; sel: string[]; prefs: Prefs; hidden: string[]; plans: Record<string, Slots>; setPlans: (s: Record<string, Slots>) => void; name: (id: string) => string; onShop: (items: { id: string; qty: number; unit: string }[]) => void; onBack: () => void; onOpen: (r: Recipe) => void }) {
  const { t, lang } = p
  const locale = lang === 'ar' ? 'ar-EG' : 'en-GB'
  const weekStart = lang === 'ar' ? 6 : 1 // Saturday in Arabic, Monday in English
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayIdx = (now.getDay() - weekStart + 7) % 7
  const [shift, setShift] = useState(0)
  const [day, setDay] = useState(todayIdx)
  const [added, setAdded] = useState(false)
  const dates = Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIdx + shift * 7 + i))
  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  const keys = dates.map(keyOf)
  const isToday = dates[day].getTime() === startToday.getTime()
  const isPast = dates[day] < startToday
  const slots: Slots = p.plans[keys[day]] ?? {}
  const used = (s: Slots) => Object.values(s).filter((x): x is string => !!x)
  const weekUsed = () => keys.flatMap((k) => used(p.plans[k] ?? {}))
  const isDone = (id: string) => isToday && p.history.some((h) => h.id === id && p.dayDiff(h.ts) === 0)
  const cooked = p.history.filter((h) => keyOf(new Date(h.ts)) === keys[day])
  const mealOfEntry = (h: Entry): Meal => {
    if (h.meal) return h.meal
    const r = recipes.find((x) => x.id === h.id)
    const hour = new Date(h.ts).getHours()
    const guess: Meal = hour < 11 ? 'breakfast' : hour < 17 ? 'lunch' : 'dinner'
    return !r || r.meals.includes(guess) ? guess : r.meals[0]
  }
  const weekDishes = keys.flatMap((k) => used(p.plans[k] ?? {})).map((id) => recipes.find((x) => x.id === id)).filter((r): r is Recipe => !!r)
  const count = (tag: string) => weekDishes.filter((r) => tagsOf(r).includes(tag)).length
  const go = (n: number) => { setShift(shift + n); setDay(shift + n === 0 ? todayIdx : 0); setAdded(false) }
  const pickFor = (m: Meal, taken: string[], avoid: string[]) => {
    const ok = (x: Result) => x.r.meals.includes(m) && !p.hidden.includes(x.r.id) && !taken.includes(x.r.id)
    let pool = match(p.sel, p.prefs).filter(ok)
    if (pool.length === 0) pool = match(p.sel, p.prefs, true).filter(ok)
    const fresh = pool.filter((x) => !avoid.includes(x.r.id))
    if (fresh.length > 0) pool = fresh
    const ready = pool.filter((x) => x.cookable)
    let from = ready.length ? ready : pool
    if (p.diet) {
      const light = [...from].sort((a, b) => lightScore(b.r) - lightScore(a.r))
      from = light.slice(0, Math.max(1, Math.ceil(light.length / 2)))
    }
    return from.length ? from[Math.floor(Math.random() * from.length)].r.id : undefined
  }
  const setSlots = (s: Slots) => p.setPlans({ ...p.plans, [keys[day]]: s })
  const swap = (m: Meal) => {
    const id = pickFor(m, used(slots), weekUsed())
    if (id) setSlots({ ...slots, [m]: id })
  }
  const fillDay = () => {
    const next = { ...slots }
    for (const m of mainMeals) {
      if (next[m]) continue
      const id = pickFor(m, used(next), weekUsed())
      if (id) next[m] = id
    }
    setSlots(next)
  }
  const fillWeek = () => {
    const all = { ...p.plans }
    keys.forEach((k, i) => {
      if (dates[i] < startToday) return
      const cur = { ...(all[k] ?? {}) }
      for (const m of mainMeals) {
        if (cur[m]) continue
        const id = pickFor(m, used(cur), keys.flatMap((kk) => used(kk === k ? cur : all[kk] ?? {})))
        if (id) cur[m] = id
      }
      all[k] = cur
    })
    p.setPlans(all)
  }
  const weekShop = () => {
    const sum = new Map<string, { id: string; qty: number; unit: string }>()
    keys.forEach((k, i) => {
      if (dates[i] < startToday) return
      for (const id of used(p.plans[k] ?? {})) {
        const r = recipes.find((x) => x.id === id)
        if (!r) continue
        for (const [ing, q, u, o] of r.ing) {
          if (o || p.sel.includes(ing)) continue
          const cur = sum.get(`${ing}|${u}`)
          sum.set(`${ing}|${u}`, { id: ing, unit: u, qty: (cur?.qty ?? 0) + q })
        }
      }
    })
    p.onShop(Array.from(sum.values()))
    setAdded(true)
  }
  const range = `${dates[0].toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${dates[6].toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`
  return (
    <section className="panel">
      <button className="ghost" onClick={p.onBack}>{t.back}</button>
      <h2>📅 {t.plan}</h2>
      <p className="note">{t.planNote}</p>
      <div className="row">
        <button className="ghost small" aria-label={t.prevL} onClick={() => go(-1)}><span dir="ltr">{lang === 'ar' ? '›' : '‹'}</span></button>
        <strong>{range}</strong>
        <button className="ghost small" aria-label={t.nextL} onClick={() => go(1)}><span dir="ltr">{lang === 'ar' ? '‹' : '›'}</span></button>
      </div>
      <div className="cal">
        {dates.map((d, i) => (
          <button key={keys[i]} className={`day${d.getTime() === startToday.getTime() ? ' today' : ''}${d < startToday ? ' past' : ''}`} aria-pressed={day === i} onClick={() => { setDay(i); setAdded(false) }}>
            <small>{d.toLocaleDateString(locale, { weekday: 'short' })}</small>
            <strong>{d.getDate()}</strong>
            <span className="em">{used(p.plans[keys[i]] ?? {}).length > 0 ? '●' : ''}</span>
          </button>
        ))}
      </div>
      <label className="dietswitch"><input type="checkbox" checked={p.diet} onChange={(e) => p.setDiet(e.target.checked)} /> {t.dietMode}</label>
      {p.diet && (
        <div className="dietbox">
          <p className="note">{t.dietNote}</p>
          <label><input type="checkbox" checked={!!p.prefs.lowCarb} onChange={(e) => p.setLowCarb(e.target.checked)} /> {t.lowcarbShort}</label>
          {weekDishes.length > 0 && (
            <div className="chips">
              <span className="tag">{t.weekBalance}: {weekDishes.length}</span>
              {(['protein', 'lowcarb', 'fried'] as const).map((g) => <span key={g} className="tag">{t[`tag${g}` as keyof Dict]} × {count(g)}</span>)}
            </div>
          )}
        </div>
      )}
      {!isPast && (
        <div className="actions">
          <button className="primary small" onClick={fillDay}>{t.fillDay}</button>
          <button className="ghost small" onClick={fillWeek}>{t.fillWeek}</button>
          <button className="ghost small" onClick={() => setSlots({})}>{t.clearDay}</button>
        </div>
      )}
      {meals.map((m) => {
        const r = recipes.find((x) => x.id === slots[m])
        if (isPast) return null
        const miss = r ? r.ing.filter((l) => !l[3] && !p.sel.includes(l[0])).map((l) => p.name(l[0])) : []
        return (
          <div key={m} className="slot">
            <h3>{t[`m${m}` as keyof Dict]}</h3>
            {r ? (
              <>
                <button className="link big" onClick={() => p.onOpen(r)}>{r.emoji} {r[lang]}</button>
                {!isPast && <p className="meta">{r.prep + r.cook} {t.min} · {miss.length === 0 ? `✓ ${t.cookable}` : `${t.missing}: ${miss.join(lang === 'ar' ? '، ' : ', ')}`}{p.diet && tagsOf(r).length > 0 ? ` · ${tagsOf(r).map((g) => t[`tag${g}` as keyof Dict]).join(', ')}` : ''}</p>}
                {!isPast && (
                  <div className="actions">
                    {isToday && <button className="primary small" disabled={isDone(r.id)} onClick={() => p.onCooked(r.id, m)}>✓ {isDone(r.id) ? t.cookedToday : t.cookedBtn}</button>}
                    <button className="ghost small" onClick={() => swap(m)}>🔀 {t.swap}</button>
                    <button className="ghost small" onClick={() => { const next = { ...slots }; delete next[m]; setSlots(next) }}>✕ {t.remove}</button>
                  </div>
                )}
              </>
            ) : <button className="ghost small" onClick={() => swap(m)}>＋ {t.pickForMe}</button>}
          </div>
        )
      })}
      {isPast && meals.map((m) => {
        const done = cooked.filter((h) => mealOfEntry(h) === m)
        const plannedR = recipes.find((x) => x.id === slots[m])
        if (done.length === 0 && !plannedR) return null
        return (
          <div key={`p-${m}`} className="slot">
            <h3>{t[`m${m}` as keyof Dict]}</h3>
            {done.length > 0 ? done.map((h) => {
              const r = recipes.find((x) => x.id === h.id)
              return r ? <button key={h.ts} className="link big" onClick={() => p.onOpen(r)}>✓ {r.emoji} {r[lang]}</button> : null
            }) : plannedR && (
              <>
                <button className="link big" onClick={() => p.onOpen(plannedR)}>{plannedR.emoji} {plannedR[lang]}</button>
                <p className="meta">{t.plannedOnly}</p>
              </>
            )}
          </div>
        )
      })}
      {isPast && cooked.length === 0 && used(slots).length === 0 && <p className="note">{t.nothingDay}</p>}
      {keys.some((k, i) => dates[i] >= startToday && used(p.plans[k] ?? {}).length > 0) && (
        <button className="primary small" onClick={weekShop}>{added ? t.added : `🛒 ${t.weekShop}`}</button>
      )}
    </section>
  )
}

type Entry = { id: string; ts: number; meal?: Meal }

function History(p: Common & { onAdd: (id: string, ts: number) => void; onBack: () => void; history: Entry[]; dayDiff: (ts: number) => number; onRemove: (ts: number) => void; onOpen: (r: Recipe) => void }) {
  const locale = p.lang === 'ar' ? 'ar-EG' : 'en-GB'
  const weekStart = p.lang === 'ar' ? 6 : 1 // Saturday in Arabic, Monday in English
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const today = new Date()
  const [view, setView] = useState<'week' | 'month'>('week')
  const [shift, setShift] = useState(0)
  const [selected, setSelected] = useState(key(today))
  const [dish, setDish] = useState('')
  const byDay = new Map<string, Entry[]>()
  for (const h of p.history) {
    const k = key(new Date(h.ts))
    byDay.set(k, [...(byDay.get(k) ?? []), h])
  }
  const recipeOf = (id: string) => recipes.find((x) => x.id === id)
  const first = new Date(today.getFullYear(), today.getMonth() + shift, 1)
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() - weekStart + 7) % 7
  const days: (Date | null)[] = view === 'week'
    ? Array.from({ length: 7 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + i))
    : [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))]
  const counts: Record<string, number> = {}
  for (const d of days) {
    for (const h of d ? byDay.get(key(d)) ?? [] : []) {
      const r = recipeOf(h.id)
      if (r) counts[kindOf(r)] = (counts[kindOf(r)] ?? 0) + 1
    }
  }
  const dow = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + ((weekStart + i) % 7)).toLocaleDateString(locale, { weekday: 'short' }))
  const [sy, sm, sd] = selected.split('-').map(Number)
  const dayList = byDay.get(selected) ?? []
  const addPast = () => {
    const name = dish.trim().toLowerCase()
    const r = recipes.find((x) => x.en.toLowerCase() === name || x.ar === dish.trim())
    if (!r) return
    const at = new Date(sy, sm, sd, 12).getTime()
    p.onAdd(r.id, Math.min(at, Date.now()))
    setDish('')
  }
  const perCell = view === 'week' ? 2 : 1
  return (
    <section className="panel wide">
      <button className="ghost" onClick={p.onBack}>{p.t.back}</button>
      <h2>{p.t.history}</h2>
      {p.history.length === 0 && <div className="empty"><p>{p.t.noHist}</p></div>}
      <div className="chips">
        {(['week', 'month'] as const).map((v) => (
          <button key={v} className="chip" aria-pressed={view === v} onClick={() => setView(v)}>{v === 'week' ? p.t.week : p.t.month}</button>
        ))}
      </div>
      {view === 'month' && (
        <div className="row">
          <button className="ghost small" aria-label={p.t.prevL} onClick={() => setShift(shift - 1)}><span dir="ltr">{p.lang === 'ar' ? '›' : '‹'}</span></button>
          <strong>{first.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</strong>
          <button className="ghost small" aria-label={p.t.nextL} disabled={shift >= 0} onClick={() => setShift(shift + 1)}><span dir="ltr">{p.lang === 'ar' ? '‹' : '›'}</span></button>
        </div>
      )}
      {view === 'month' && <div className="cal">{dow.map((d) => <span key={d} className="dow">{d}</span>)}</div>}
      <div className="cal">
        {days.map((d, i) => {
          if (!d) return <span key={`b${i}`} />
          const k = key(d)
          const list = byDay.get(k) ?? []
          return (
            <button key={k} className={`day${k === key(today) ? ' today' : ''}`} aria-pressed={k === selected} onClick={() => setSelected(k)}
              aria-label={`${d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}: ${list.length}`}>
              {view === 'week' && <small>{d.toLocaleDateString(locale, { weekday: 'short' })}</small>}
              <strong>{d.getDate()}</strong>
              <span className="em">{list.slice(0, perCell).map((h) => recipeOf(h.id)?.emoji).join('')}{list.length > perCell ? '+' : ''}</span>
            </button>
          )
        })}
      </div>
      {Object.keys(counts).length > 0 && (
        <div className="chips">{Object.entries(counts).map(([k, n]) => <span key={k} className="tag">{p.t[`k${k}` as keyof Dict]} × {n}</span>)}</div>
      )}
      <h3>{new Date(sy, sm, sd).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
      {dayList.length === 0 ? <p className="note">{p.t.nothingDay}</p> : (
        <ul className="ings">
          {dayList.map((h) => {
            const r = recipeOf(h.id)
            return r ? (
              <li key={h.ts}>
                <button className="link" onClick={() => p.onOpen(r)}>{r.emoji} {r[p.lang]}</button>
                <button className="link" onClick={() => p.onRemove(h.ts)}>{p.t.remove}</button>
              </li>
            ) : null
          })}
        </ul>
      )}
      {new Date(sy, sm, sd) <= today && (
        <div className="row wrap">
          <input list="hist-recipes" value={dish} onChange={(e) => setDish(e.target.value)} placeholder={p.t.pickDish} aria-label={p.t.addPast} />
          <datalist id="hist-recipes">{recipes.map((r) => <option key={r.id} value={r[p.lang]} />)}</datalist>
          <button className="ghost" onClick={addPast}>＋ {p.t.addPast}</button>
        </div>
      )}
    </section>
  )
}

// Shows /images/<id>.jpg if it exists, otherwise the emoji block
function Pic({ r, lang, t, big }: Common & { r: Recipe; big?: boolean }) {
  const [bad, setBad] = useState(false)
  const cls = big ? 'art big' : 'art'
  if (bad) return <div className={cls} style={{ background: r.color }} role="img" aria-label={`${r[lang]} (${t.photoNote})`}>{r.emoji}</div>
  return <img className={cls} src={`/images/${r.id}.jpg`} alt={r[lang]} loading={big ? 'eager' : 'lazy'} style={{ background: r.color }} onError={() => setBad(true)} />
}

// useState that remembers its value in the browser
function usePersisted<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => {
    try { const saved = localStorage.getItem(key); return saved ? (JSON.parse(saved) as T) : init } catch { return init }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ }
  }, [key, v])
  return [v, setV] as const
}

function AddDish(p: Common & { initial?: Recipe; onBack: () => void; onSave: (r: Recipe) => void }) {
  const { t, lang } = p
  const [nameEn, setNameEn] = useState(p.initial?.en ?? '')
  const [nameAr, setNameAr] = useState(p.initial?.ar ?? '')
  const k = lang === 'en' ? 0 : 1
  const [desc, setDesc] = useState(p.initial?.desc[k] ?? '')
  const [steps, setSteps] = useState(p.initial ? p.initial.steps.map((st) => st[k]).join('\n') : '')
  const [mealSel, setMealSel] = useState<Meal[]>(p.initial?.meals ?? ['lunch'])
  const [effort, setEffort] = useState<Effort>(p.initial?.effort ?? 1)
  const [prep, setPrep] = useState(p.initial?.prep ?? 10)
  const [cook, setCook] = useState(p.initial?.cook ?? 20)
  const [sv, setSv] = useState(p.initial?.servings ?? 4)
  const [veg, setVeg] = useState(p.initial?.veg ?? false)
  const [lines, setLines] = useState<Line[]>(p.initial?.ing ?? [])
  const [ing, setIng] = useState(ingredients[0].id)
  const [qty, setQty] = useState(1)
  const [unit, setUnit] = useState('')
  const [opt, setOpt] = useState(false)
  const [err, setErr] = useState('')
  const units = ['', 'g', 'cup', 'tbsp', 'tsp', 'cloves']
  const unitName = (u: string) => (u === '' ? t.pieces : (t as Record<string, string>)[u])
  const addLine = () => {
    if (lines.some((l) => l[0] === ing)) return
    setLines([...lines, [ing, qty, unit, opt]])
  }
  const save = () => {
    const name = nameEn.trim() || nameAr.trim()
    const stepList = steps.split('\n').map((x) => x.trim()).filter(Boolean)
    if (!name) return setErr(t.errName)
    if (mealSel.length === 0) return setErr(t.errMeal)
    if (!lines.some((l) => !l[3])) return setErr(t.errIng)
    if (stepList.length === 0) return setErr(t.errSteps)
    p.onSave({
      id: p.initial?.id ?? `custom-${Date.now()}`, custom: true, cat: p.initial?.cat ?? 'quick', meals: mealSel, en: name, ar: nameAr.trim() || name,
      emoji: p.initial?.emoji ?? '🍽️', color: p.initial?.color ?? '#D9C7A7', desc: [desc, desc], tip: p.initial?.tip ?? ['', ''], prep, cook, servings: Math.max(1, sv),
      effort, veg, ing: lines, steps: stepList.map((x) => [x, x] as [string, string]),
    })
  }
  const toggleMeal = (m: Meal) => setMealSel(mealSel.includes(m) ? mealSel.filter((x) => x !== m) : [...mealSel, m])
  return (
    <section className="panel form">
      <button className="ghost" onClick={p.onBack}>{t.back}</button>
      <h2>＋ {t.addDish}</h2>
      <p className="note">{t.customNote}</p>
      <label>{t.nameEn}<input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></label>
      <label>{t.nameAr}<input value={nameAr} onChange={(e) => setNameAr(e.target.value)} /></label>
      <label>{t.descLabel}<input value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
      <h3>{t.mealsLabel}</h3>
      <div className="chips">
        {meals.map((m) => <button key={m} className="chip" aria-pressed={mealSel.includes(m)} onClick={() => toggleMeal(m)}>{t[`m${m}` as keyof Dict]}</button>)}
      </div>
      <h3>{t.effort}</h3>
      <div className="chips">
        {([[0, t.e0], [1, t.e1], [2, t.e2]] as [Effort, string][]).map(([v, l]) => <button key={v} className="chip" aria-pressed={effort === v} onClick={() => setEffort(v)}>{l}</button>)}
      </div>
      <div className="row">
        <label>{t.prepMin}<input type="number" min={0} value={prep} onChange={(e) => setPrep(Number(e.target.value))} /></label>
        <label>{t.cookMin}<input type="number" min={0} value={cook} onChange={(e) => setCook(Number(e.target.value))} /></label>
        <label>{t.servings}<input type="number" min={1} value={sv} onChange={(e) => setSv(Number(e.target.value))} /></label>
      </div>
      <div className="check"><label><input type="checkbox" checked={veg} onChange={(e) => setVeg(e.target.checked)} /> {t.vegOnly}</label></div>
      <h3>{t.ingLabel}</h3>
      <div className="row wrap">
        <select aria-label={t.pickIng} value={ing} onChange={(e) => setIng(e.target.value)}>
          {ingredients.map((i) => <option key={i.id} value={i.id}>{i[lang]}</option>)}
        </select>
        <input type="number" min={0} step="any" aria-label={t.qty} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        <select aria-label={t.unitLabel} value={unit} onChange={(e) => setUnit(e.target.value)}>
          {units.map((u) => <option key={u} value={u}>{unitName(u)}</option>)}
        </select>
        <label><input type="checkbox" checked={opt} onChange={(e) => setOpt(e.target.checked)} /> {t.optional}</label>
        <button className="ghost small" onClick={addLine}>{t.addIng}</button>
      </div>
      <ul className="ings">
        {lines.map(([id, q, u, o]) => (
          <li key={id}>
            <span>{q} {u ? unitName(u) : ''} {byId(id)[lang]}{o ? ` (${t.optional})` : ''}</span>
            <button className="link" onClick={() => setLines(lines.filter((l) => l[0] !== id))}>{t.remove}</button>
          </li>
        ))}
      </ul>
      <label>{t.stepsLabel}<textarea rows={6} value={steps} onChange={(e) => setSteps(e.target.value)} /></label>
      {err && <p className="warn" role="alert">{err}</p>}
      <div className="actions end">
        <button className="ghost" onClick={p.onBack}>{t.back}</button>
        <button className="primary" onClick={save}>{t.save}</button>
      </div>
    </section>
  )
}

function Shop(p: Common & { items: ShopItem[]; setItems: (s: ShopItem[]) => void; onBack: () => void; onBought: (ids: string[]) => void }) {
  const { t, lang, items } = p
  const [copied, setCopied] = useState(false)
  const [text, setText] = useState('')
  const [amount, setAmount] = useState('')
  const addItem = () => {
    const name = text.trim()
    if (!name) return
    const known = ingredients.find((i) => i.en.toLowerCase() === name.toLowerCase() || i.ar === name)
    const id = known ? known.id : name
    const n = Number(amount) || 0
    const at = items.findIndex((x) => x.id === id && x.unit === '')
    if (at >= 0) p.setItems(items.map((x, k) => (k === at ? { ...x, qty: x.qty + n, done: false } : x)))
    else p.setItems([...items, { id, qty: n, unit: '', done: false }])
    setText('')
    setAmount('')
  }
  const label = (i: ShopItem) => `${i.qty || ''} ${unitLabel(t, i.unit)} ${byId(i.id)?.[lang] ?? i.id}`.replace(/ {2,}/g, ' ')
  const toggle = (x: ShopItem) => p.setItems(items.map((y) => (y === x ? { ...y, done: !y.done } : y)))
  const copy = async () => {
    try { await navigator.clipboard.writeText(items.filter((x) => !x.done).map((x) => `- ${label(x)}`).join('\n')); setCopied(true) } catch { /* ignore */ }
  }
  const bought = items.filter((x) => x.done)
  return (
    <section className="panel">
      <button className="ghost" onClick={p.onBack}>{t.back}</button>
      <h2>🛒 {t.shopTitle}</h2>
      <div className="row wrap">
        <input list="shop-ings" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} placeholder={t.itemName} aria-label={t.itemName} />
        <input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t.qtyOpt} aria-label={t.qtyOpt} />
        <button className="ghost" onClick={addItem}>{t.add}</button>
        <datalist id="shop-ings">{ingredients.map((i) => <option key={i.id} value={i[lang]} />)}</datalist>
      </div>
      {items.length === 0 && <div className="empty"><p>{t.emptyShop}</p></div>}
      <ul className="ings">
        {items.map((x) => (
          <li key={x.id + x.unit}>
            <label><input type="checkbox" checked={x.done} onChange={() => toggle(x)} /> <span className={x.done ? 'done' : ''}>{label(x)}</span></label>
            <button className="link" onClick={() => p.setItems(items.filter((y) => y !== x))}>{t.remove}</button>
          </li>
        ))}
      </ul>
      {items.length > 0 && (
        <div className="actions">
          <button className="ghost small" onClick={copy}>{copied ? t.copied : t.copy}</button>
          {bought.length > 0 && <button className="primary small" onClick={() => { p.onBought(bought.map((x) => x.id).filter((id) => ingredients.some((i) => i.id === id))); p.setItems(items.filter((x) => !x.done)) }}>{t.bought}</button>}
          <button className="ghost small" onClick={() => p.setItems([])}>{t.clear}</button>
        </div>
      )}
    </section>
  )
}
