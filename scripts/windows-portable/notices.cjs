const fs = require('node:fs')
const path = require('node:path')

function collectNotices(nodeModules, output) {
  fs.mkdirSync(output, { recursive: true })
  const packages = []
  for (const name of fs.readdirSync(nodeModules)) {
    if (name.startsWith('.')) continue
    if (name.startsWith('@')) {
      for (const scoped of fs.readdirSync(path.join(nodeModules, name)))
        packages.push(`${name}/${scoped}`)
    } else packages.push(name)
  }
  const declarations = []
  for (const name of packages) {
    const directory = path.join(nodeModules, name)
    const metadataFile = path.join(directory, 'package.json')
    if (!fs.existsSync(metadataFile)) continue
    const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'))
    declarations.push({
      name: metadata.name,
      version: metadata.version,
      license: metadata.license ?? null
    })
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!/^(?:LICENSE|LICENCE|NOTICE|COPYING|AUTHORS)(?:[._-]|$)/i.test(entry.name)) continue
      const destination = path.join(output, name, entry.name)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.cpSync(path.join(directory, entry.name), destination, { recursive: true })
    }
    // Embedded font assets retain their own OFL notices, independently of the npm wrapper.
    if (name === 'vfonts') {
      const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name)
          if (entry.isDirectory()) visit(file)
          else if (/^(?:OFL|LICENSE|LICENCE|NOTICE|COPYING)(?:[._-]|$)/i.test(entry.name)) {
            const destination = path.join(
              output,
              name,
              path.relative(path.join(nodeModules, name), file)
            )
            fs.mkdirSync(path.dirname(destination), { recursive: true })
            fs.copyFileSync(file, destination)
          }
        }
      }
      visit(directory)
    }
  }
  fs.writeFileSync(
    path.join(output, 'DEPENDENCIES.json'),
    JSON.stringify(
      declarations.sort((a, b) => a.name.localeCompare(b.name)),
      null,
      2
    ) + '\n'
  )
  fs.writeFileSync(
    path.join(output, 'README.txt'),
    'Original copyright and license notices from installed JavaScript dependencies, including bundled renderer dependencies and build tools. Preserve applicable notices when redistributing.\n'
  )
}
module.exports = { collectNotices }
