'use client'
import { useState, useRef } from 'react'
import Papa from 'papaparse'

// ── types ─────────────────────────────────────────────────────────────────────
type FormInput = {
  tenure: number
  numberofaddress: number
  cashbackamount: number
  daysincelastorder: number
  ordercount: number
  satisfactionscore: number
}

type PredResult = {
  churn_prediction: number
  churn_probability: number
  threshold_used: number
  risk_level: string
  insights: string[]
  error?: string
}

type BatchRow = {
  row_id: number
  churn_prediction: number
  churn_probability: number
  risk_level: string
}

type BatchResult = {
  total_customers: number
  summary: {
    churn_count: number
    retention_count: number
    churn_rate: number
    average_probability: number
  }
  predictions: BatchRow[]
  csv_data?: string
  error?: string
}

type HistItem = {
  id: number
  tenure: number
  ordercount: number
  satisfactionscore: number
  churn_prediction: number
  churn_probability: number
  timestamp: string
}

// ── small components ──────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="field-label">{label}</label>
      {children}
      {hint && <div style={{ fontSize: '0.7rem', color: 'var(--faint)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function ProbGauge({ prob }: { prob: number }) {
  const pct = Math.round(prob * 100)
  const color = prob > 0.17 ? '#ef4444' : prob > 0.12 ? '#f59e0b' : '#17c082'
  const r = 52
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={124} height={124} viewBox="0 0 124 124">
      <circle cx={62} cy={62} r={r} fill="none" stroke="var(--border2)" strokeWidth={9} />
      <circle cx={62} cy={62} r={r} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 62 62)" />
      <text x={62} y={58} textAnchor="middle" fill={color} fontSize={22} fontWeight={800}>{pct}%</text>
      <text x={62} y={74} textAnchor="middle" fill="var(--muted)" fontSize={9} fontWeight={600}
        letterSpacing="0.6">CHURN PROB</text>
    </svg>
  )
}

function RiskBadge({ level }: { level: string }) {
  const cfg: Record<string, { bg: string; border: string; color: string; label: string }> = {
    high:   { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   color: '#f87171', label: 'HIGH RISK' },
    medium: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  color: '#fbbf24', label: 'MEDIUM RISK' },
    low:    { bg: 'rgba(23,192,130,0.1)',  border: 'rgba(23,192,130,0.3)',  color: '#17c082', label: 'LOW RISK' },
  }
  const c = cfg[level] ?? { bg: 'rgba(138,154,184,0.1)', border: 'rgba(138,154,184,0.3)', color: '#8a9ab8', label: level.toUpperCase() }
  return (
    <span style={{
      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
      borderRadius: 20, padding: '4px 13px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.8px',
      whiteSpace: 'nowrap',
    }}>{c.label}</span>
  )
}

// ── defaults ──────────────────────────────────────────────────────────────────
const DEFAULT_FORM: FormInput = {
  tenure: 12, numberofaddress: 2, cashbackamount: 25.5,
  daysincelastorder: 15, ordercount: 8, satisfactionscore: 4,
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function ChurnApp() {
  const [tab, setTab] = useState<'single' | 'batch' | 'history'>('single')

  // single prediction
  const [form, setForm]       = useState<FormInput>(DEFAULT_FORM)
  const [result, setResult]   = useState<PredResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // batch
  const [batchResult, setBatchResult]     = useState<BatchResult | null>(null)
  const [batchLoading, setBatchLoading]   = useState(false)
  const [batchError, setBatchError]       = useState('')
  const [fileName, setFileName]           = useState('')
  const [dragOver, setDragOver]           = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // history
  const [history, setHistory]       = useState<HistItem[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [histError, setHistError]   = useState('')

  function setF<K extends keyof FormInput>(k: K, v: number) {
    setForm(p => ({ ...p, [k]: v }))
    setResult(null)
  }

  async function handlePredict() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  function parseCsvRows(text: string): Record<string, number>[] {
    const parsed = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true })
    return parsed.data.map(row => {
      const out: Record<string, number> = {}
      for (const [k, v] of Object.entries(row)) {
        out[k.trim().toLowerCase()] = parseFloat(v) || 0
      }
      return out
    })
  }

  async function handleBatch(file: File) {
    setBatchLoading(true); setBatchError(''); setBatchResult(null)
    setFileName(file.name)
    try {
      const text = await file.text()
      const customers = parseCsvRows(text)
      if (customers.length === 0) throw new Error('No valid rows found in CSV.')

      const res = await fetch('/api/predict-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customers }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setBatchResult(data)
    } catch (e) {
      setBatchError(String(e))
    } finally {
      setBatchLoading(false)
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleBatch(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleBatch(f)
  }

  async function loadHistory() {
    setHistLoading(true); setHistError('')
    try {
      const res = await fetch('/api/history')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setHistory(data.predictions || [])
    } catch (e) {
      setHistError(String(e))
    } finally {
      setHistLoading(false)
    }
  }

  function switchTab(t: typeof tab) {
    setTab(t)
    if (t === 'history' && history.length === 0) loadHistory()
  }

  function downloadCsv(csvData: string) {
    const blob = new Blob([csvData], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'churn_predictions.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 1060, margin: '0 auto' }}>

        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg, #0a0500 0%, #1f0e00 55%, #351700 100%)',
          borderRadius: 16, padding: '48px 52px', marginBottom: 36,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', right: 40, top: -10, fontSize: 180, opacity: 0.04, lineHeight: 1, userSelect: 'none' }}>
            ⟳
          </div>
          <p className="section-label">Machine Learning</p>
          <h1 style={{ fontSize: '2.1rem', fontWeight: 800, color: '#fff', marginBottom: 8 }}>
            E-Commerce Churn Predictor
          </h1>
          <p style={{ color: '#fcd27a', fontSize: '1rem', maxWidth: 560 }}>
            XGBoost-powered customer churn prediction. Enter customer metrics for instant risk assessment or upload a CSV for bulk scoring.
          </p>
          <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['XGBoost Model', '6 Features', 'Threshold: 17%', 'Supabase Storage'].map(t => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {(['single', 'batch', 'history'] as const).map(t => (
            <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => switchTab(t)}>
              {t === 'single' ? 'Single Prediction' : t === 'batch' ? 'Batch Upload' : 'History'}
            </button>
          ))}
        </div>

        {/* ── Single Prediction ── */}
        {tab === 'single' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

            {/* inputs */}
            <div className="card">
              <p className="section-label">Customer Data</p>
              <p className="section-title">Input Features</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
                <Field label="Tenure (months)" hint="Active subscription length">
                  <input type="number" value={form.tenure} min={0}
                    onChange={e => setF('tenure', +e.target.value)} />
                </Field>
                <Field label="No. of Addresses" hint="Shipping addresses on record">
                  <input type="number" value={form.numberofaddress} min={0}
                    onChange={e => setF('numberofaddress', +e.target.value)} />
                </Field>
                <Field label="Cashback Amount ($)" hint="Total cashback earned">
                  <input type="number" value={form.cashbackamount} min={0} step={0.01}
                    onChange={e => setF('cashbackamount', +e.target.value)} />
                </Field>
                <Field label="Days Since Last Order" hint="Recency of last purchase">
                  <input type="number" value={form.daysincelastorder} min={0}
                    onChange={e => setF('daysincelastorder', +e.target.value)} />
                </Field>
                <Field label="Order Count" hint="Total lifetime orders">
                  <input type="number" value={form.ordercount} min={0}
                    onChange={e => setF('ordercount', +e.target.value)} />
                </Field>
                <Field label="Satisfaction Score" hint="Customer rating 1–5">
                  <input type="number" value={form.satisfactionscore} min={1} max={5}
                    onChange={e => setF('satisfactionscore', Math.max(1, Math.min(5, +e.target.value)))} />
                </Field>
              </div>

              {error && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: '0.84rem', marginBottom: 16 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-primary" onClick={handlePredict} disabled={loading}>
                  {loading ? 'Analyzing…' : 'Analyze Customer'}
                </button>
                <button
                  onClick={() => { setForm(DEFAULT_FORM); setResult(null); setError('') }}
                  style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                    border: '1px solid rgba(245,158,11,0.25)', borderRadius: 9,
                    padding: '11px 20px', fontSize: '0.86rem', fontWeight: 600, cursor: 'pointer' }}>
                  Reset
                </button>
              </div>
            </div>

            {/* result */}
            <div className="card">
              {!result ? (
                <div style={{ minHeight: 280, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <div style={{ fontSize: 48, opacity: 0.15 }}>◎</div>
                  <div style={{ color: 'var(--faint)', fontSize: '0.9rem' }}>
                    Run analysis to see results
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  <div>
                    <p className="section-label">Prediction Result</p>
                    <p className="section-title" style={{ marginBottom: 20 }}>Churn Assessment</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                      <ProbGauge prob={result.churn_probability} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <RiskBadge level={result.risk_level} />
                        <div style={{ fontSize: '1.5rem', fontWeight: 800,
                          color: result.churn_prediction === 1 ? '#ef4444' : '#17c082' }}>
                          {result.churn_prediction === 1 ? 'Will Churn' : 'Will Retain'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                          Threshold: {((result.threshold_used ?? 0.17) * 100).toFixed(0)}%
                          &nbsp;·&nbsp;
                          Probability: {(result.churn_probability * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {result.insights && result.insights.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--muted)',
                        textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                        Insights
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {result.insights.slice(0, 5).map((ins, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, fontSize: '0.84rem',
                            color: 'var(--text)', lineHeight: 1.5 }}>
                            <span style={{ color: 'var(--accent2)', flexShrink: 0, marginTop: 1 }}>›</span>
                            <span>{ins}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Batch Upload ── */}
        {tab === 'batch' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card">
              <p className="section-label">Bulk Scoring</p>
              <p className="section-title">Upload Customer CSV</p>

              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--accent2)' : 'var(--border2)'}`,
                  borderRadius: 10, padding: '44px 20px', textAlign: 'center', cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: dragOver ? 'rgba(245,158,11,0.04)' : 'var(--surface2)',
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}>↑</div>
                <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.95rem', marginBottom: 6 }}>
                  {fileName || 'Drop CSV here or click to browse'}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                  Required columns: tenure, numberofaddress, cashbackamount, daysincelastorder, ordercount, satisfactionscore
                </div>
                <input ref={fileRef} type="file" accept=".csv" hidden onChange={onFileChange} />
              </div>

              {batchLoading && (
                <div style={{ color: 'var(--muted)', fontSize: '0.86rem' }}>Processing {fileName}…</div>
              )}
              {batchError && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: '0.84rem' }}>
                  {batchError}
                </div>
              )}
            </div>

            {batchResult && !batchResult.error && (
              <>
                {/* summary stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14 }}>
                  {[
                    { label: 'Total Customers',  value: batchResult.total_customers,                                        color: 'var(--text)' },
                    { label: 'Churned',           value: batchResult.summary.churn_count,                                   color: '#f87171' },
                    { label: 'Retained',          value: batchResult.summary.retention_count,                               color: '#17c082' },
                    { label: 'Churn Rate',        value: `${(batchResult.summary.churn_rate * 100).toFixed(1)}%`,          color: '#f59e0b' },
                    { label: 'Avg Probability',   value: `${(batchResult.summary.average_probability * 100).toFixed(1)}%`, color: 'var(--accent2)' },
                  ].map(s => (
                    <div key={s.label} className="card" style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 5,
                        textTransform: 'uppercase', letterSpacing: '0.6px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* download */}
                {batchResult.csv_data && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-primary" onClick={() => downloadCsv(batchResult.csv_data!)}>
                      Download Results CSV
                    </button>
                  </div>
                )}

                {/* prediction cards */}
                <div className="card">
                  <p className="section-label">Predictions</p>
                  <p className="section-title">
                    First {batchResult.predictions.length} of {batchResult.total_customers} customers
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10 }}>
                    {batchResult.predictions.map(row => {
                      const borderColor = row.risk_level === 'high'
                        ? 'rgba(239,68,68,0.25)' : row.risk_level === 'medium'
                        ? 'rgba(245,158,11,0.25)' : 'rgba(23,192,130,0.25)'
                      return (
                        <div key={row.row_id} style={{
                          background: 'var(--surface2)', borderRadius: 8,
                          border: `1px solid ${borderColor}`, padding: '10px 14px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>#{row.row_id}</span>
                            <RiskBadge level={row.risk_level} />
                          </div>
                          <div style={{ fontSize: '0.92rem', fontWeight: 700,
                            color: row.churn_prediction === 1 ? '#f87171' : '#17c082', marginBottom: 3 }}>
                            {row.churn_prediction === 1 ? 'Churn' : 'Retain'}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                            {(row.churn_probability * 100).toFixed(1)}% probability
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── History ── */}
        {tab === 'history' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <p className="section-label">Database</p>
                <p className="section-title" style={{ marginBottom: 0 }}>Prediction History</p>
              </div>
              <button
                onClick={loadHistory} disabled={histLoading}
                style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                  border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8,
                  padding: '7px 18px', fontSize: '0.84rem', fontWeight: 600,
                  cursor: histLoading ? 'not-allowed' : 'pointer', opacity: histLoading ? 0.5 : 1 }}>
                {histLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {histError && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: '0.84rem', marginBottom: 16 }}>
                {histError}
              </div>
            )}

            {history.length === 0 && !histLoading ? (
              <div style={{ textAlign: 'center', color: 'var(--faint)', padding: '48px 0', fontSize: '0.9rem' }}>
                No predictions recorded yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="htable">
                  <thead>
                    <tr>
                      <th>Tenure</th>
                      <th>Orders</th>
                      <th>Satisfaction</th>
                      <th>Prediction</th>
                      <th>Probability</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={h.id ?? i}>
                        <td>{h.tenure} mo</td>
                        <td>{h.ordercount}</td>
                        <td>{h.satisfactionscore}/5</td>
                        <td>
                          <span style={{ fontWeight: 600,
                            color: h.churn_prediction === 1 ? '#f87171' : '#17c082' }}>
                            {h.churn_prediction === 1 ? 'Churn' : 'Retain'}
                          </span>
                        </td>
                        <td>{(h.churn_probability * 100).toFixed(1)}%</td>
                        <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                          {new Date(h.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
