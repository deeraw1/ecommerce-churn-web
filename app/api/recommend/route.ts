import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`

function fallbackInsights(customer: Record<string, number>, risk: string): string[] {
  const ins: string[] = []
  if (customer.daysincelastorder > 20)
    ins.push(`Last order was ${customer.daysincelastorder} days ago — launch a personalised re-engagement email with a discount.`)
  if (customer.satisfactionscore <= 2)
    ins.push('Satisfaction score is critically low — assign a customer success rep for immediate outreach.')
  if (customer.ordercount < 5)
    ins.push('Low order frequency — offer a bundle deal or free shipping to encourage repeat purchases.')
  if (customer.cashbackamount < 15)
    ins.push('Low cashback earned — enrol customer in a higher-tier loyalty programme.')
  if (customer.tenure < 6)
    ins.push('New customer — send a personalised onboarding journey with product education.')
  if (risk === 'high' && ins.length < 2)
    ins.push('High churn risk — consider a proactive retention call or exclusive offer within 48 hours.')
  if (risk === 'low' && ins.length === 0)
    ins.push('Customer is healthy — maintain engagement with monthly newsletters and loyalty rewards.')
  return ins.slice(0, 4)
}

export async function POST(req: NextRequest) {
  try {
    const { customer, result, mode } = await req.json()

    if (!GEMINI_KEY) {
      return NextResponse.json({ recommendations: fallbackInsights(customer ?? {}, result?.risk_level ?? 'medium') })
    }

    let prompt = ''

    if (mode === 'batch') {
      const s = result.summary
      prompt = `You are a senior customer retention strategist for an e-commerce company.

Batch Churn Analysis Results:
- Total customers analysed: ${result.total_customers}
- Customers predicted to churn: ${s.churn_count} (${(s.churn_rate * 100).toFixed(1)}%)
- Customers predicted to retain: ${s.retention_count}
- Average churn probability: ${(s.average_probability * 100).toFixed(1)}%

Provide exactly 4 strategic, actionable business recommendations to reduce overall churn.
Write one recommendation per line starting with "- ". Be specific and business-focused.`
    } else {
      prompt = `You are a senior customer retention analyst for an e-commerce company.

Customer Profile:
- Tenure: ${customer.tenure} months
- Number of delivery addresses: ${customer.numberofaddress}
- Total cashback earned: $${customer.cashbackamount}
- Days since last order: ${customer.daysincelastorder}
- Lifetime order count: ${customer.ordercount}
- Satisfaction score: ${customer.satisfactionscore}/5

ML Prediction:
- Outcome: ${result.churn_prediction === 1 ? 'WILL CHURN' : 'WILL RETAIN'}
- Churn probability: ${(result.churn_probability * 100).toFixed(1)}%
- Risk level: ${result.risk_level.toUpperCase()}

Provide exactly 4 specific, actionable retention recommendations tailored to this customer's data.
Write one recommendation per line starting with "- ". Be concise and data-driven.`
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
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    const recommendations = text
      .split('\n')
      .map((l: string) => l.replace(/^[-•*\d.]+\s*/, '').trim())
      .filter((l: string) => l.length > 20)
      .slice(0, 4)

    if (recommendations.length === 0) {
      return NextResponse.json({ recommendations: fallbackInsights(customer ?? {}, result?.risk_level ?? 'medium') })
    }

    return NextResponse.json({ recommendations })
  } catch (e) {
    return NextResponse.json({ recommendations: [], error: String(e) })
  }
}
