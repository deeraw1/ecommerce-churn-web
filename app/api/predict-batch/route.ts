import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8001'

export async function POST(req: NextRequest) {
  try {
    const { customers } = await req.json()
    if (!customers?.length) {
      return NextResponse.json({ error: 'No customers provided.' }, { status: 400 })
    }

    const threshold = 0.17
    const proba: number[] = []
    const predictions: { row_id: number; churn_prediction: number; churn_probability: number; risk_level: string }[] = []

    for (let i = 0; i < Math.min(customers.length, 100); i++) {
      const res = await fetch(`${BACKEND}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customers[i]),
      })
      const d = await res.json()
      const prob: number = d.churn_probability ?? 0
      proba.push(prob)
      predictions.push({
        row_id: i + 1,
        churn_prediction: d.churn_prediction,
        churn_probability: prob,
        risk_level: d.risk_level,
      })
    }

    // For customers beyond the first 100, call in batches still but don't include in preview
    for (let i = 100; i < customers.length; i++) {
      const res = await fetch(`${BACKEND}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customers[i]),
      })
      const d = await res.json()
      proba.push(d.churn_probability ?? 0)
    }

    const churnCount = proba.filter(p => p >= threshold).length
    const avgProb = proba.reduce((a, b) => a + b, 0) / proba.length

    const csvLines = [
      'tenure,numberofaddress,cashbackamount,daysincelastorder,ordercount,satisfactionscore,Churn_Probability,Churn_Prediction,Risk_Level',
      ...customers.map((c: Record<string, number>, i: number) => {
        const p = proba[i] ?? 0
        const pred = p >= threshold ? 'Churned' : 'Retained'
        const risk = p > 0.17 ? 'high' : p > 0.12 ? 'medium' : 'low'
        return [c.tenure,c.numberofaddress,c.cashbackamount,c.daysincelastorder,c.ordercount,c.satisfactionscore,p.toFixed(3),pred,risk].join(',')
      }),
    ]

    return NextResponse.json({
      total_customers: customers.length,
      summary: {
        churn_count: churnCount,
        retention_count: customers.length - churnCount,
        churn_rate: +(churnCount / customers.length).toFixed(3),
        average_probability: +avgProb.toFixed(3),
      },
      predictions,
      csv_data: csvLines.join('\n'),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
