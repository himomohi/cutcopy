import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import './App.css'
import { clearSessionKey, getMode, setSessionKey } from './lib/metaClient'
import { runPipeline } from './lib/pipeline'
import type { PipelineEvent, PipelineStage } from './lib/pipeline'
import type { Cutout, ImageVariant, ListingCopy, Mode } from './lib/types'

type StepState = 'idle' | 'running' | 'done' | 'error'
type StepStates = Record<PipelineStage, StepState>
type CopyKind = 'title' | 'description'

const INITIAL_STEPS: StepStates = { segment: 'idle', variants: 'idle', copy: 'idle' }
const MAX_FILE_BYTES = 12 * 1024 * 1024

const STEPS: Array<{ key: PipelineStage; name: string; line: string }> = [
  { key: 'segment', name: 'Segment', line: 'find the product' },
  { key: 'variants', name: 'Variants', line: 'restage the shot' },
  { key: 'copy', name: 'Copy', line: 'write the listing' },
]

const STEP_NUM: Record<PipelineStage, string> = {
  segment: '01',
  variants: '02',
  copy: '03',
}

function stepChip(state: StepState): string {
  if (state === 'done') return 'DONE'
  if (state === 'running') return 'WORKING'
  if (state === 'error') return 'FAILED'
  return 'WAITING'
}

function App() {
  const [mode, setMode] = useState<Mode>(() => getMode())
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [statuses, setStatuses] = useState<StepStates>(INITIAL_STEPS)
  const [cutout, setCutout] = useState<Cutout | null>(null)
  const [variants, setVariants] = useState<ImageVariant[]>([])
  const [copy, setCopy] = useState<ListingCopy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [sampleLoading, setSampleLoading] = useState(false)
  const [view, setView] = useState<'source' | 'cutout'>('cutout')
  const [copied, setCopied] = useState<CopyKind | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const sourceRef = useRef<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current)
      if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current)
    }
  }, [])

  const markStage = (stage: PipelineStage, status: StepState) => {
    setStatuses((current) => {
      const next: StepStates = { ...current }
      next[stage] = status
      return next
    })
  }

  const acceptFile = (next: File | undefined) => {
    if (!next || running) return
    if (!next.type.startsWith('image/')) {
      setError('Choose a PNG, JPG, or WebP image.')
      return
    }
    if (next.size > MAX_FILE_BYTES) {
      setError('Keep the photo under 12 MB.')
      return
    }
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current)
    const url = URL.createObjectURL(next)
    sourceRef.current = url
    setSourceUrl(url)
    setFile(next)
    setStatuses(INITIAL_STEPS)
    setCutout(null)
    setVariants([])
    setCopy(null)
    setCopied(null)
    setError(null)
    setView('cutout')
  }

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    acceptFile(event.dataTransfer.files?.[0])
  }

  const useSampleMug = async () => {
    if (running || sampleLoading) return
    setSampleLoading(true)
    setError(null)
    try {
      const response = await fetch('/sample-mug.png')
      if (!response.ok) throw new Error('Could not load the sample image.')
      const blob = await response.blob()
      const sample = new File([blob], 'sample-mug.png', {
        type: blob.type || 'image/png',
      })
      acceptFile(sample)
      setSubject('ceramic mug')
    } catch {
      setError('Could not load the sample mug. Check that /sample-mug.png is served.')
    } finally {
      setSampleLoading(false)
    }
  }

  const generate = async () => {
    if (!file || running) return
    setRunning(true)
    setError(null)
    setCopied(null)
    setStatuses(INITIAL_STEPS)
    setCutout(null)
    setVariants([])
    setCopy(null)
    setView('cutout')

    const onEvent = (event: PipelineEvent) => {
      if (event.type === 'stage') {
        markStage(event.stage, event.status)
        if (event.status === 'error' && event.detail) setError(event.detail)
        return
      }
      if (event.type === 'cutout') setCutout(event.cutout)
      else if (event.type === 'variants') setVariants(event.variants)
      else setCopy(event.copy)
    }

    try {
      await runPipeline(file, { subject, onEvent })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The pipeline stopped unexpectedly.')
    } finally {
      setRunning(false)
    }
  }

  const copyValue = async (kind: CopyKind, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setError('Clipboard access was blocked. Select the text and copy it manually.')
    }
  }

  const selectMock = () => {
    clearSessionKey()
    setKeyDraft('')
    setKeyOpen(false)
    setMode('mock')
  }

  const selectLive = () => {
    setKeyOpen(true)
    setMode(getMode())
  }

  const applyKey = () => {
    const next = keyDraft.trim()
    if (!next) return
    setSessionKey(next)
    setKeyDraft('')
    setMode('live')
  }

  const clearKey = () => {
    clearSessionKey()
    setKeyDraft('')
    setKeyOpen(false)
    setMode('mock')
  }

  const showingCutout = Boolean(cutout) && view === 'cutout'
  const imageSrc = showingCutout && cutout ? cutout.dataUrl : sourceUrl
  const states = Object.values(statuses)
  const overall: StepState = states.includes('error')
    ? 'error'
    : states.every((state) => state === 'done')
      ? 'done'
      : states.some((state) => state === 'running')
        ? 'running'
        : 'idle'
  const overallLabel =
    overall === 'error'
      ? 'Needs attention'
      : overall === 'done'
        ? 'Complete'
        : overall === 'running'
          ? 'Working'
          : 'Ready'
  const generateState =
    overall === 'done'
      ? 'COMPLETE'
      : overall === 'running'
        ? 'WORKING'
        : overall === 'error'
          ? 'RETRY'
          : 'READY'

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">CutCopy</span>
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-sub">Listing desk</span>
        </div>
        <div className="keybar">
          <div className="key-row">
            <div className="mode-toggle" role="group" aria-label="Demo mode">
              <button
                type="button"
                className={!keyOpen && mode === 'mock' ? 'active' : ''}
                aria-pressed={!keyOpen && mode === 'mock'}
                onClick={selectMock}
              >
                Mock
              </button>
              <button
                type="button"
                className={keyOpen || mode === 'live' ? 'active' : ''}
                aria-pressed={keyOpen || mode === 'live'}
                aria-controls="key-field"
                onClick={selectLive}
              >
                Live
              </button>
            </div>
            <div className="key-field" id="key-field">
              <label className="sr-only" htmlFor="api-key">
                Meta Model API key
              </label>
              <input
                id="api-key"
                className="key-input"
                type="password"
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyKey()
                }}
                placeholder="Meta Model API key"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="key-help"
                disabled={!keyOpen && mode !== 'live'}
              />
              <button
                type="button"
                className="key-apply"
                onClick={applyKey}
                disabled={(!keyOpen && mode !== 'live') || !keyDraft.trim()}
              >
                Apply
              </button>
              {(keyDraft.trim() || mode === 'live') && (
                <button type="button" className="key-clear" onClick={clearKey}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <p className="key-hint" id="key-help">
            Stored locally in this browser only. Never uploaded to CutCopy.
          </p>
        </div>
      </header>

      <section className="hero">
        <div className="hero-left">
          <div className="eyebrow">Demo</div>
          <h1>
            <span>One product photo.</span>
            <span>Every listing asset.</span>
          </h1>
        </div>
        <div className="hero-right">
          <div className="hero-rule" />
          <p className="tagline">CutCopy - product photo in, listing assets out.</p>
        </div>
      </section>

      <main className="workspace">
        <section className="panel source" aria-labelledby="source-title">
          <div className="panel-head">
            <div>
              <p className="kicker">Source / 01</p>
              <h2 className="panel-title" id="source-title">
                Product photo
              </h2>
            </div>
            <span
              className="file-tag"
              title={cutout ? 'mug-cutout.jpg' : file ? file.name : 'sample-mug.png'}
            >
              {cutout ? 'mug-cutout.jpg' : file ? file.name : 'sample-mug.png'}
            </span>
          </div>

          <div
            className={`checker${dragging ? ' dragging' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault()
              if (!running) setDragging(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              if (!running) setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleInput}
              disabled={running}
              hidden
            />
            {imageSrc && (
              <div className="preview-meta">
                <span className="chip">{showingCutout ? 'Cutout' : 'Photo'}</span>
                {showingCutout ? <span className="chip">1024 x 1024</span> : null}
              </div>
            )}
            {imageSrc ? (
              <div className={`preview-stage${showingCutout ? ' cut' : ''}`}>
                <img
                  src={imageSrc}
                  alt={showingCutout ? 'Cutout preview' : 'Original product photo'}
                />
                {running && !cutout && <span className="scan" aria-hidden="true" />}
              </div>
            ) : (
              <button
                type="button"
                className="drop-empty"
                onClick={() => inputRef.current?.click()}
                disabled={running}
              >
                <span className="drop-title">Drop a product photo</span>
                <span className="drop-hint">PNG, JPG, or WebP - up to 12 MB</span>
                <span className="browse">Browse files</span>
              </button>
            )}
          </div>
          <div className="preview-note">
            <span>Drop a product photo to replace this sample.</span>
            <span className="note-meta">{showingCutout ? 'Cutout preview' : 'Source photo'}</span>
          </div>

          <div className="source-actions">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => void useSampleMug()}
              disabled={running || sampleLoading}
            >
              {sampleLoading ? 'Loading sample...' : 'Use sample mug'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => inputRef.current?.click()}
              disabled={running}
            >
              Replace photo
            </button>
          </div>

          {cutout && (
            <div className="view-switch" role="group" aria-label="Preview mode">
              <button
                type="button"
                className={view === 'source' ? 'active' : ''}
                onClick={() => setView('source')}
              >
                Original
              </button>
              <button
                type="button"
                className={view === 'cutout' ? 'active' : ''}
                onClick={() => setView('cutout')}
              >
                Cutout
              </button>
            </div>
          )}

          <div className="field">
            <label htmlFor="subject">
              Product subject <span className="opt">(optional)</span>
            </label>
            <input
              id="subject"
              className="input"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void generate()
              }}
              placeholder="e.g. ceramic mug"
              maxLength={80}
              disabled={running}
            />
          </div>

          <button
            type="button"
            className="generate"
            onClick={() => void generate()}
            disabled={!file || running}
          >
            <span>{running ? 'Generating assets...' : 'Generate listing assets'}</span>
            <span className="state">{generateState}</span>
          </button>
          <div className="run-note">
            <span>
              {variants.length > 0
                ? `Sample run - ${variants.length} assets ready`
                : 'Run the pipeline to stage assets'}
            </span>
            <span className="mono">{mode === 'mock' ? 'No key used' : 'Live calls'}</span>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <strong>Pipeline stopped.</strong> {error}
            </div>
          )}

          {mode === 'mock' && (
            <p className="mock-note">
              Mock mode builds deterministic local assets. Switch to Live in the
              header and paste a key to run real requests.
            </p>
          )}
        </section>

        <section className="panel results" aria-labelledby="results-title">
          <div className="results-head">
            <div>
              <p className="kicker">Results / 02</p>
              <h2 className="panel-title" id="results-title">
                Your listing assets
              </h2>
            </div>
            <span className={`complete ${overall}`}>{overallLabel}</span>
          </div>

          <div className="pipeline">
            {STEPS.map((step) => {
              const state = statuses[step.key]
              return (
                <div className={`stage ${state}`} key={step.key}>
                  <div className="stage-top">
                    <span className="stage-no">{STEP_NUM[step.key]}</span>
                    <span className="done">{stepChip(state)}</span>
                  </div>
                  <div className="stage-name">{step.name}</div>
                  <div className="stage-line">{step.line}</div>
                </div>
              )
            })}
          </div>

          <div className="section-head">
            <h2>Variants</h2>
            <span>{variants.length} assets</span>
          </div>
          <div className="variants">
            {variants.length > 0
              ? variants.map((variant) => (
                  <article className="variant" key={variant.id}>
                    <div className="variant-media">
                      <img src={variant.dataUrl} alt={`${variant.label} product scene`} />
                    </div>
                    <div className="variant-body">
                      <div className="variant-name">{variant.label}</div>
                      <div className="variant-line">{variant.description}</div>
                    </div>
                  </article>
                ))
              : Array.from({ length: 3 }, (_, index) => (
                  <div
                    className={`variant variant-empty${statuses.variants === 'running' ? ' loading' : ''}`}
                    key={index}
                  >
                    <div className="variant-media">
                      {statuses.variants === 'running' ? (
                        <span className="shimmer" aria-hidden="true" />
                      ) : null}
                    </div>
                    <div className="variant-body">
                      <div className="variant-name">{['Studio', 'Kitchen', 'Garden'][index]}</div>
                      <div className="variant-line">
                        {statuses.variants === 'running'
                          ? 'Rendering...'
                          : 'Variants appear here'}
                      </div>
                    </div>
                  </div>
                ))}
          </div>

          <div className="copyblock">
            <div className="section-head">
              <h2>Listing copy</h2>
              <span>{stepChip(statuses.copy)}</span>
            </div>

            {copy ? (
              <>
                <div className="copy-row">
                  <div>
                    <div className="copy-label">
                      Title <span className="count">{copy.title.length} / 70</span>
                    </div>
                    <p className="copy-title">{copy.title}</p>
                  </div>
                  <button
                    type="button"
                    className={`copy-btn${copied === 'title' ? ' copied' : ''}`}
                    onClick={() => void copyValue('title', copy.title)}
                  >
                    {copied === 'title' ? 'Copied' : 'Copy title'}
                  </button>
                </div>

                <div className="copy-row">
                  <div>
                    <div className="copy-label">
                      Description <span className="count">{copy.description.length} / 170</span>
                    </div>
                    <p className="copy-desc">{copy.description}</p>
                  </div>
                  <button
                    type="button"
                    className={`copy-btn${copied === 'description' ? ' copied' : ''}`}
                    onClick={() => void copyValue('description', copy.description)}
                  >
                    {copied === 'description' ? 'Copied' : 'Copy description'}
                  </button>
                </div>
              </>
            ) : statuses.copy === 'running' ? (
              <div className="copy-skeleton" aria-hidden="true">
                <span className="skeleton-line wide" />
                <span className="skeleton-line medium" />
                <span className="skeleton-line" />
                <span className="skeleton-line short" />
              </div>
            ) : (
              <div className="empty-copy">
                <p>Title and description land here after the pipeline finishes.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer>
        <span>CutCopy</span>
        <span>Product photo to listing assets.</span>
      </footer>
    </div>
  )
}

export default App
