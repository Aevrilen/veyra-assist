const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

function readSourceVersion(root) {
  if (fs.existsSync(path.join(root, '.git'))) {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8'
    }).trim()
    if (
      execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
        cwd: root,
        encoding: 'utf8'
      }).trim()
    )
      throw new Error('Commit the reviewed changes before making a versioned deliverable')
    return { commit, sourceKind: 'clean-git-checkout' }
  }
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE_VERSION.json'), 'utf8'))
  if (!/^[0-9a-f]{40}$/.test(snapshot.commit))
    throw new Error('Source archive version metadata is invalid')
  return {
    commit: snapshot.commit,
    sourceKind: 'exported-source-snapshot',
    localEdits: 'Not verified by Git; this local rebuild records the original snapshot commit'
  }
}

function nativeSourceBlob(root) {
  const content = Buffer.from(
    fs
      .readFileSync(path.join(root, 'native/win32-x64/src/tools/tools.cc'), 'utf8')
      .replace(/\r\n/g, '\n')
  )
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${content.length}\0`))
    .update(content)
    .digest('hex')
}
module.exports = { readSourceVersion, nativeSourceBlob }
