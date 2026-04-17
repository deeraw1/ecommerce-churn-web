import { NextRequest, NextResponse } from 'next/server'

const HF_KEY = process.env.HF_API_KEY || ''
const HF_URL = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3'

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

function buildPrompt(customer: Record<string, number> | null, result: Record<string, unknown>, mode: string): string {
  if (mode === 'batch') {
    const s = result.summary as Record<string, number>
    return `<s>[INST] You are a customer retention strategist for an e-commerce company.

Batch analysis: ${result.total_customers} customers analysed, ${s.churn_count} predicted to churn (${(s.churn_rate * 100).toFixed(1)}%), average churn probability ${(s.average_probability * 100).toFixed(1)}%.

Give exactly 4 strategic retention recommendations. One per line, starting with "- ". Be specific and concise. [/INST]`
  }
  return `<s>[INST] You are a customer retention analyst for an e-commerce company.

Customer: tenure ${customer!.tenure} months, ${customer!.ordercount} orders, satisfaction ${customer!.satisfactionscore}/5, last order ${customer!.daysincelastorder} days ago, cashback $${customer!.cashbackamount}.
Prediction: ${result.churn_prediction === 1 ? 'WILL CHURN' : 'WILL RETAIN'} — ${((result.churn_probability as number) * 100).toFixed(1)}% churn probability, ${(result.risk_level as string).toUpperCase()} risk.

Give exactly 4 specific retention recommendations for this customer. One per line, starting with "- ". Be concise. [/INST]`
}

export async function POST(req: NextRequest) {
  try {
    const { customer, result, mode } = await req.json()

    if (!HF_KEY) {
      return NextResponse.json({ recommendations: fallbackInsights(customer ?? {}, result?.risk_level ?? 'medium') })
    }

    const prompt = buildPrompt(customer, result, mode)

    const res = await fetch(HF_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 400, temperature: 0.7, return_full_text: false },
      }),
    })

    const data = await res.json()

    if (data.error) {
      return NextResponse.json({ recommendations: fallbackInsights(customer ?? {}, result?.risk_level ?? 'medium') })
    }

    const text: string = Array.isArray(data) ? (data[0]?.generated_text ?? '') : (data.generated_text ?? '')

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
    return NextResponse.json({ recommendations: fallbackInsights({}, 'medium'), error: String(e) })
  }
}
