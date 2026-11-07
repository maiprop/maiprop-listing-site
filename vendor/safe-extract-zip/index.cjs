const debug = require('debug')('extract-zip')
const fsModule = require('fs')
const { createWriteStream, promises: fs, constants } = fsModule
const getStream = require('get-stream')
const path = require('path')
const { promisify } = require('util')
const stream = require('stream')
const yauzl = require('yauzl')

const openZip = promisify(yauzl.open)
const pipeline = promisify(stream.pipeline)
const MAX_LINKS = 40

function withinRoot (root, p) {
  const rel = path.relative(root, p)
  if (rel === '') return true
  if (path.isAbsolute(rel)) return false
  if (rel === '..' || rel.startsWith('..' + path.sep)) return false
  if (rel.startsWith('../') || rel.startsWith('..\\')) return false
  return true
}

function splitFs (p) {
  return process.platform === 'win32' ? p.split(/[\\/]/) : p.split('/')
}

function checkEntryName (name) {
  if (typeof name !== 'string' || name.length === 0) throw new Error(`Unsafe archive entry "${name}"`)
  if (name.includes('\0')) throw new Error(`Unsafe archive entry "${name}": NUL byte`)
  if (name.includes('\\')) throw new Error(`Unsafe archive entry "${name}": backslash`)
  if (name.includes(':')) throw new Error(`Unsafe archive entry "${name}": colon`)
  if (name.startsWith('/') || name.startsWith('//')) throw new Error(`Unsafe archive entry "${name}": absolute path`)
  if (/^[A-Za-z]:/.test(name)) throw new Error(`Unsafe archive entry "${name}": Windows drive`)
  if (path.isAbsolute(name)) throw new Error(`Unsafe archive entry "${name}": absolute path`)
  if (name.split('/').includes('..')) throw new Error(`Unsafe archive entry "${name}": parent component`)
}

function checkLinkTarget (link, entryName) {
  if (typeof link !== 'string' || link.length === 0) throw new Error(`Unsafe symlink target for file ${entryName}`)
  if (link.includes('\0')) throw new Error(`Unsafe symlink target "${link}" for file ${entryName}: NUL byte`)
  if (link.includes('\\')) throw new Error(`Unsafe symlink target "${link}" for file ${entryName}: backslash`)
  if (link.includes(':')) throw new Error(`Unsafe symlink target "${link}" for file ${entryName}: colon`)
  if (link.startsWith('/') || link.startsWith('//')) throw new Error(`Unsafe symlink target "${link}" for file ${entryName}: absolute path`)
  if (/^[A-Za-z]:/.test(link)) throw new Error(`Unsafe symlink target "${link}" for file ${entryName}: Windows drive`)
  if (path.isAbsolute(link)) throw new Error(`Unsafe symlink target "${link}" for file ${entryName}: absolute path`)
}

async function resolveAbsolute (abs, st) {
  const fsRoot = path.parse(abs).root
  let cur = fsRoot
  let q = splitFs(abs.slice(fsRoot.length))
  let missing = false
  while (q.length > 0) {
    const c = q.shift()
    if (c === '' || c === '.') continue
    if (c === '..') {
      if (missing) throw new Error('Unsafe symlink target: parent component after a missing path')
      cur = path.dirname(cur)
      continue
    }
    const nxt = path.join(cur, c)
    let s
    try {
      s = await fs.lstat(nxt)
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        missing = true
        cur = nxt
        continue
      }
      throw err
    }
    if (!s.isSymbolicLink()) {
      cur = nxt
      continue
    }
    st.n += 1
    if (st.n > MAX_LINKS) {
      const e = new Error(`Too many symlink expansions at "${nxt}"`)
      e.code = 'ELOOP'
      throw e
    }
    let t
    try {
      t = await fs.readlink(nxt)
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        missing = true
        cur = nxt
        continue
      }
      throw err
    }
    if (path.isAbsolute(t)) {
      const r = path.parse(t).root
      cur = r
      q = [...splitFs(t.slice(r.length)), ...q]
    } else {
      q = [...splitFs(t), ...q]
    }
  }
  return { cur, missing }
}

async function resolveWithin (root, start, comps, st, ctx) {
  let cur = start
  if (!withinRoot(root, cur)) throw new Error(`Out of bound path "${cur}" found while processing file ${ctx}`)
  const q = [...comps]
  let missing = false
  while (q.length > 0) {
    const c = q.shift()
    if (c === '' || c === '.') continue
    if (c === '..') {
      // A future symlink at a missing component could change what '..' means.
      // Plain forward targets remain valid; ambiguous forward traversal does not.
      if (missing) throw new Error(`Unsafe symlink target for file ${ctx}: parent component after a missing path`)
      cur = path.dirname(cur)
      if (!withinRoot(root, cur)) throw new Error(`Out of bound path "${cur}" found while processing file ${ctx}`)
      continue
    }
    const nxt = path.join(cur, c)
    let s
    try {
      s = await fs.lstat(nxt)
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        missing = true
        cur = nxt
        if (!withinRoot(root, cur)) throw new Error(`Out of bound path "${cur}" found while processing file ${ctx}`)
        continue
      }
      throw err
    }
    if (!s.isSymbolicLink()) {
      cur = nxt
      if (!withinRoot(root, cur)) throw new Error(`Out of bound path "${cur}" found while processing file ${ctx}`)
      continue
    }
    st.n += 1
    if (st.n > MAX_LINKS) {
      const e = new Error(`Too many symlink expansions at "${nxt}" while processing file ${ctx}`)
      e.code = 'ELOOP'
      throw e
    }
    let t
    try {
      t = await fs.readlink(nxt)
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        missing = true
        cur = nxt
        if (!withinRoot(root, cur)) throw new Error(`Out of bound path "${cur}" found while processing file ${ctx}`)
        continue
      }
      throw err
    }
    if (path.isAbsolute(t)) {
      const resolved = await resolveAbsolute(t, st)
      cur = resolved.cur
      missing = resolved.missing
      if (!withinRoot(root, cur)) throw new Error(`Out of bound path "${cur}" found while processing symlink "${nxt}" -> "${t}" for file ${ctx}`)
      continue
    }
    q.unshift(...splitFs(t))
  }
  return cur
}

async function canonicalParent (root, dest, entryName, st) {
  const parent = path.dirname(dest)
  const rel = path.relative(root, parent)
  if (rel === '') return root
  return resolveWithin(root, root, splitFs(rel), st, entryName)
}

class Extractor {
  constructor (zipPath, opts) {
    this.zipPath = zipPath
    this.opts = opts
  }

  async extract () {
    debug('opening', this.zipPath, 'with opts', this.opts)

    this.zipfile = await openZip(this.zipPath, { lazyEntries: true })
    this.canceled = false

    return new Promise((resolve, reject) => {
      this.zipfile.on('error', err => {
        this.canceled = true
        reject(err)
      })
      this.zipfile.readEntry()

      this.zipfile.on('close', () => {
        if (!this.canceled) {
          debug('zip extraction complete')
          resolve()
        }
      })

      this.zipfile.on('entry', async entry => {
        if (this.canceled) {
          debug('skipping entry', entry.fileName, { cancelled: this.canceled })
          return
        }

        debug('zipfile entry', entry.fileName)

        if (entry.fileName.startsWith('__MACOSX/')) {
          this.zipfile.readEntry()
          return
        }

        try {
          checkEntryName(entry.fileName)
          await this.extractEntry(entry)
          debug('finished processing', entry.fileName)
          this.zipfile.readEntry()
        } catch (err) {
          this.canceled = true
          this.zipfile.close()
          reject(err)
        }
      })
    })
  }

  async extractEntry (entry) {
    if (this.canceled) {
      debug('skipping entry extraction', entry.fileName, { cancelled: this.canceled })
      return
    }

    if (this.opts.onEntry) {
      this.opts.onEntry(entry, this.zipfile)
    }

    const entryName = entry.fileName
    checkEntryName(entryName)
    const root = this.opts.dir
    // Remove trailing separators before lstat: lstat('link/') follows the link.
    const dest = path.resolve(root, entryName)
    if (!withinRoot(root, dest)) throw new Error(`Out of bound path "${dest}" found while processing file ${entryName}`)

    const mode = (entry.externalFileAttributes >> 16) & 0xFFFF
    const IFMT = 61440
    const IFDIR = 16384
    const IFLNK = 40960
    const symlink = (mode & IFMT) === IFLNK
    let isDir = (mode & IFMT) === IFDIR

    if (!isDir && entry.fileName.endsWith('/')) {
      isDir = true
    }

    const madeBy = entry.versionMadeBy >> 8
    if (!isDir) isDir = (madeBy === 0 && entry.externalFileAttributes === 16)

    debug('extracting entry', { filename: entry.fileName, isDir, isSymlink: symlink })

    const procMode = this.getExtractedMode(mode, isDir) & 0o777
    const st = { n: 0 }

    if (isDir) {
      if (dest === root) return
      const cParent = await canonicalParent(root, dest, entryName, st)
      let leaf = null
      try {
        leaf = await fs.lstat(dest)
      } catch (err) {
        if (!err || err.code !== 'ENOENT') throw err
      }
      if (leaf && leaf.isSymbolicLink()) throw new Error(`Refusing to create directory through symlink "${dest}" for file ${entryName}`)
      const full = path.join(cParent, path.basename(dest))
      if (!withinRoot(root, full)) throw new Error(`Out of bound path "${full}" found while processing file ${entryName}`)
      debug('mkdir', { dir: dest, recursive: true, mode: procMode })
      await fs.mkdir(dest, { recursive: true, mode: procMode })
      return
    }

    const cParent = await canonicalParent(root, dest, entryName, st)
    void cParent
    const destDir = path.dirname(dest)
    debug('mkdir', { dir: destDir, recursive: true })
    await fs.mkdir(destDir, { recursive: true })
    const cParentAfter = await canonicalParent(root, dest, entryName, st)

    let leaf = null
    try {
      leaf = await fs.lstat(dest)
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err
    }
    if (leaf && leaf.isSymbolicLink()) throw new Error(`Refusing to write through symlink "${dest}" for file ${entryName}`)
    // Reject before opening a stream: an unread yauzl stream retains the ZIP fd.
    if (symlink && leaf) throw new Error(`Refusing to create symlink over existing path "${dest}" for file ${entryName}`)

    debug('opening read stream', dest)
    const readStream = await promisify(this.zipfile.openReadStream.bind(this.zipfile))(entry)

    if (symlink) {
      const link = await getStream(readStream)
      checkLinkTarget(link, entryName)
      await resolveWithin(root, cParentAfter, link.split('/'), st, `${entryName} -> ${link}`)
      debug('creating symlink', link, dest)
      await fs.symlink(link, dest)
    } else {
      if (leaf) {
        if (leaf.isDirectory()) {
          readStream.destroy()
          throw new Error(`Refusing to overwrite directory "${dest}" for file ${entryName}`)
        }
        if (!leaf.isFile()) {
          readStream.destroy()
          throw new Error(`Refusing to overwrite non-regular file "${dest}" for file ${entryName}`)
        }
      }
      const isNew = !leaf
      let flags
      const { O_WRONLY, O_CREAT, O_TRUNC, O_EXCL, O_NOFOLLOW } = constants
      if (typeof O_WRONLY === 'number' && typeof O_CREAT === 'number' && typeof O_TRUNC === 'number' && typeof O_EXCL === 'number') {
        flags = O_WRONLY | O_CREAT | (isNew ? O_EXCL : O_TRUNC)
        if (process.platform !== 'win32' && typeof O_NOFOLLOW === 'number' && O_NOFOLLOW !== 0) flags |= O_NOFOLLOW
      } else {
        flags = isNew ? 'wx' : 'w'
      }
      await pipeline(readStream, createWriteStream(dest, { flags, mode: procMode }))
    }
  }

  getExtractedMode (entryMode, isDir) {
    let mode = entryMode
    if (mode === 0) {
      if (isDir) {
        if (this.opts.defaultDirMode) {
          mode = parseInt(this.opts.defaultDirMode, 10)
        }

        if (!mode) {
          mode = 0o755
        }
      } else {
        if (this.opts.defaultFileMode) {
          mode = parseInt(this.opts.defaultFileMode, 10)
        }

        if (!mode) {
          mode = 0o644
        }
      }
    }

    return mode
  }
}

module.exports = async function (zipPath, opts) {
  debug('creating target directory', opts.dir)

  if (!path.isAbsolute(opts.dir)) {
    throw new Error('Target directory is expected to be absolute')
  }

  await fs.mkdir(opts.dir, { recursive: true })
  opts.dir = await fs.realpath(opts.dir)
  return new Extractor(zipPath, opts).extract()
}
