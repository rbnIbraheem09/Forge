// src/main/tags/parser.js
//
// Streaming CSV parser for the Danbooru tag library CSV.
// The CSV is small enough (~150k lines, ~10 MB) to read into memory at once,
// but we still iterate line-by-line so the indexer can transaction-batch its inserts.

const fs = require('fs')
const readline = require('readline')

// CSV row format: name,category,post_count,aliases
// Aliases may be empty, a single value, or a comma-separated list wrapped in double-quotes.
function parseCsvRow(line) {
  // Find the first three commas at top level. Aliases is everything after, possibly quoted.
  const c1 = line.indexOf(',')
  const c2 = line.indexOf(',', c1 + 1)
  const c3 = line.indexOf(',', c2 + 1)
  if (c1 < 0 || c2 < 0 || c3 < 0) return null

  const rawName = line.slice(0, c1)
  const category = parseInt(line.slice(c1 + 1, c2), 10) || 0
  const postCount = parseInt(line.slice(c2 + 1, c3), 10) || 0
  let aliases = line.slice(c3 + 1).trim()

  // Strip surrounding double-quotes if present.
  if (aliases.startsWith('"') && aliases.endsWith('"')) {
    aliases = aliases.slice(1, -1)
  }
  if (aliases.length === 0) aliases = null

  // Transform underscores to spaces in the canonical tag name.
  // Keep underscores in aliases as-is — aliases are reference text, not what we'll output.
  const name = rawName.replace(/_/g, ' ').trim()
  if (!name) return null

  return { name, category, post_count: postCount, aliases }
}

// Async iterable: yields {name, category, post_count, aliases} for each parseable row.
async function* parseCsv(csvPath) {
  const stream = fs.createReadStream(csvPath, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line || line.startsWith('#')) continue
    const row = parseCsvRow(line)
    if (row) yield row
  }
}

module.exports = { parseCsv, parseCsvRow }
