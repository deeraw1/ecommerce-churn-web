import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || '').replace(/\/$/, '')

export async function POST(req: NextRequest) {
  if (!BACKEND) {
    return NextResponse.json({ error: 'BACKEND_URL is not configured in environment variables.' }, { status: 500 })
  }
  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data.detail || data.error || `Backend error ${res.status}` }, { status: 500 })
    }
    if (data.churn_probability === undefined) {
      return NextResponse.json({ error: 'Invalid response from model. Check Render logs.' }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: `Could not reach backend: ${String(e)}` }, { status: 500 })
  }
}
