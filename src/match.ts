import { recipes, type Effort, type Recipe } from './data'

export type Prefs = { maxTime: number; maxEffort: Effort; veg: boolean; exclude: string[]; lowCarb?: boolean }
export type Result = { r: Recipe; missing: string[]; missingOpt: string[]; cookable: boolean; score: number }

export const defaultPrefs: Prefs = { maxTime: 0, maxEffort: 2, veg: false, exclude: [], lowCarb: false }

// Returns ranked recipes. browseAll = true also shows weak matches.
const carbs = ['rice', 'pasta', 'bread', 'potatoes', 'flour', 'sugar', 'semolina', 'kunafa', 'pastry']

// ingredients that may be missing without hiding a recipe; anything else must be owned
const staples = ['onions', 'garlic', 'oil', 'parsley', 'carrots', 'peppers', 'butter', 'sugar']

export function match(selected: string[], p: Prefs, browseAll = false): Result[] {
  const have = new Set(selected)
  const out: Result[] = []
  for (const r of recipes) {
    if (p.veg && !r.veg) continue
    if (p.lowCarb && r.ing.some((l) => !l[3] && carbs.includes(l[0]))) continue
    if (r.effort > p.maxEffort) continue
    if (p.maxTime && r.prep + r.cook > p.maxTime) continue
    if (r.ing.some((l) => p.exclude.includes(l[0]))) continue
    const req = r.ing.filter((l) => !l[3])
    const missing = req.filter((l) => !have.has(l[0])).map((l) => l[0])
    const missingOpt = r.ing.filter((l) => l[3] && !have.has(l[0])).map((l) => l[0])
    const got = req.length - missing.length
    // match share, minus a penalty per missing item, small bonus per optional item owned
    const score = (got / req.length) * 100 - missing.length * 10 + (r.ing.length - req.length - missingOpt.length) * 3
    // "strong" = at least one ingredient and at most 2 missing
    if (!browseAll && (got === 0 || missing.length > 2 || missing.some((id) => !staples.includes(id)))) continue
    out.push({ r, missing, missingOpt, cookable: missing.length === 0, score })
  }
  return out.sort((a, b) =>
    Number(b.cookable) - Number(a.cookable) || a.missing.length - b.missing.length ||
    b.score - a.score || a.r.prep + a.r.cook - (b.r.prep + b.r.cook))
}
