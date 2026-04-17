import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`

function fallback(customer: Record<string, number>, risk: string): string[] {
  const ins: string[] = []
  if ((customer.daysincelastorder || 0) > 20)
    ins.push(`Last order was ${customer.daysincelastorder} days ago — send a personalised re-engagement email with a discount.`)
  if ((customer.satisfactionscore || 5) <= 2)
    ins.push('Satisfaction score is critically low — assign a support rep for immediate outreach.')
  if ((customer.ordercount || 0) < 5)
    ins.push('Low order frequency — offer a bundle deal or free shipping to boost repeat purchases.')
  if ((customer.cashbackamount || 0) < 15)
    ins.push('Low cashback earned — enrol in a higher-tier loyalty programme.')
  if ((customer.tenure || 0) < 6)
    ins.push('New customer — deliver a strong onboarding journey to reduce early churn.')
  if (risk === 'high' && ins.length < 2)
    ins.push('High churn risk — prioritise a proactive retention call or exclusive offer within 48 hours.')
  if (ins.length === 0)
    ins.push('Customer shows healthy retention signals — maintain current engagement strategy.')
  return ins.slice(0, 4)
}

export async function POST(req: NextRequest) {
  try {
    const { customer, result, mode } = await req.json()

    if (!GEMINI_KEY) {
      return NextResponse.json({ recommendations: fallback(customer ?? {}, result?.risk_level ?? 'medium') })
    }

    let prompt = ''
    if (mode === 'batch') {
      const s = result.summary
      prompt = `You are a senior customer retention strategist for an e-commerce company.

Batch analysis results:
- Total customers: ${result.total_customers}
- Predicted to churn: ${s.churn_count} (${(s.churn_rate * 100).toFixed(1)}%)
- Predicted to retain: ${s.retention_count}
- Average churn probability: ${(s.average_probability * 100).toFixed(1)}%

Give exactly 4 strategic, actionable business recommendations to reduce churn.
One recommendation per line, starting with "- ". Be specific and data-driven.`
    } else {
      prompt = `You are a senior customer retention analyst for an e-commerce company.

Customer profile:
- Tenure: ${customer.tenure} months
- Delivery addresses: ${customer.numberofaddress}
- Total cashback earned: $${customer.cashbackamount}
- Days since last order: ${customer.daysincelastorder}
- Lifetime orders: ${customer.ordercount}
- Satisfaction score: ${customer.satisfactionscore}/5

ML Prediction:
- Outcome: ${result.churn_prediction === 1 ? 'WILL CHURN' : 'WILL RETAIN'}
- Churn probability: ${(result.churn_probability * 100).toFixed(1)}%
- Risk level: ${(result.risk_level || 'medium').toUpperCase()}

Give exactly 4 specific, actionable retention recommendations tailored to this customer.
One recommendation per line, starting with "- ". Be concise and data-driven.`
    }

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
      }),
    })

    const data = await res.json()

    if (!res.ok || data.error) {
      return NextResponse.json({ recommendations: fallback(customer ?? {}, result?.risk_level ?? 'medium') })
    }

    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const recommendations = text
      .split('\n')
      .map((l: string) => l.replace(/^[-•*\d.]+\s*/, '').trim())
      .filter((l: string) => l.length > 20)
      .slice(0, 4)

    return NextResponse.json({
      recommendations: recommendations.length > 0 ? recommendations : fallback(customer ?? {}, result?.risk_level ?? 'medium')
    })
  } catch (e) {
    return NextResponse.json({ recommendations: [], error: String(e) })
  }
}
