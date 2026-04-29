# Fintech Churn & LTV Intelligence

A customer lifetime value and churn prediction dashboard for financial services. Powered by an XGBoost model with risk scoring and actionable retention triggers.

## What It Does

- Predicts **churn probability** per customer segment using XGBoost
- Computes **Customer Lifetime Value (CLV/LTV)** across cohorts
- Assigns **risk scores** to flag customers likely to churn within 30/60/90 days
- Surfaces **actionable retention triggers** — the top features driving each customer's churn risk
- Segments customers by value tier and churn risk for prioritised outreach
- Displays cohort retention curves and LTV distribution charts

## Key Metrics

| Metric | Description |
|---|---|
| Churn Probability | Likelihood a customer disengages within the forecast window |
| LTV | Predicted total revenue from a customer over their lifetime |
| Risk Score | Composite score from 0–100 for retention priority |
| Feature Importance | Which factors most drive an individual's churn risk |

## Tech Stack

- **Next.js 14** (App Router, frontend)
- **TypeScript**
- **Python / FastAPI** (model serving backend)
- **XGBoost** — gradient boosted trees for churn classification
- **Recharts** — cohort retention and LTV charts
- **Tailwind CSS**

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

Built by [Muhammed Adediran](https://adediran.xyz/contact)
