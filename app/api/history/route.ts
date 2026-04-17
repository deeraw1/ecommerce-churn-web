import { NextResponse } from 'next/server'

const SUPABASE_URL         = process.env.SUPABASE_URL         || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

export async function GET() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ predictions: [], error: 'Supabase not configured.' })
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/predictions?select=id,tenure,ordercount,satisfactionscore,churn_prediction,churn_probability,timestamp&order=timestamp.desc&limit=20`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        cache: 'no-store',
      }
    )
    const data = await res.json()
    return NextResponse.json({ predictions: Array.isArray(data) ? data : [] })
  } catch (e) {
    return NextResponse.json({ predictions: [], error: String(e) })
  }
}
