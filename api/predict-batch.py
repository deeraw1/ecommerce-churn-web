import os, json, sys
from http.server import BaseHTTPRequestHandler

BASE_DIR = os.path.join(os.path.dirname(__file__), '..')
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'churn_model.pkl')

from sklearn.base import BaseEstimator, TransformerMixin
import pandas as pd
import numpy as np

class DataSanitizer(BaseEstimator, TransformerMixin):
    def __init__(self, feature_config):
        self.feature_config = feature_config

    def fit(self, X, y=None):
        self.feature_config['numeric_means'] = {
            col: X[col].mean() for col in self.feature_config.get('numeric_features', [])
        }
        return self

    def transform(self, X):
        X = X.rename(columns=lambda x: x.strip().lower())
        expected = self.feature_config['expected_features']
        means = self.feature_config.get('numeric_means', {})
        for col in expected:
            if col not in X.columns:
                X[col] = means.get(col, 0)
        X = X[expected]
        for col in expected:
            X[col] = pd.to_numeric(X[col], errors='coerce').fillna(means.get(col, 0))
        return X

import __main__
__main__.DataSanitizer = DataSanitizer

churn_model = None
try:
    import joblib
    churn_model = joblib.load(MODEL_PATH)
except Exception as e:
    print(f"Model load error: {e}", file=sys.stderr)

FEATURES = ['tenure', 'numberofaddress', 'cashbackamount', 'daysincelastorder', 'ordercount', 'satisfactionscore']

COLUMN_ALIASES = {
    'tenure':           ['tenure', 'customer_tenure', 'months_active', 'subscription_length'],
    'numberofaddress':  ['numberofaddress', 'address_count', 'num_addresses', 'shipping_addresses'],
    'cashbackamount':   ['cashbackamount', 'cashback', 'reward_amount', 'cashback_earned'],
    'daysincelastorder':['daysincelastorder', 'last_order_days', 'days_since_last', 'recency'],
    'ordercount':       ['ordercount', 'total_orders', 'order_count', 'purchase_count'],
    'satisfactionscore':['satisfactionscore', 'satisfaction', 'customer_score', 'rating'],
}

def normalize_keys(row: dict) -> dict:
    out = {}
    for std, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in row:
                out[std] = row[alias]
                break
        if std not in out:
            for k, v in row.items():
                if k.strip().lower() == std:
                    out[std] = v
                    break
    return out

def process_batch(customers: list) -> dict:
    rows = []
    for c in customers:
        norm = normalize_keys({k.strip().lower(): v for k, v in c.items()})
        rows.append({f: float(norm.get(f, 0)) for f in FEATURES})

    df = pd.DataFrame(rows, columns=FEATURES)
    proba = churn_model['pipeline'].predict_proba(df)[:, 1]
    threshold = float(churn_model.get('threshold', 0.17))
    preds = [1 if p >= threshold else 0 for p in proba]

    churn_count = int(sum(preds))
    total = len(preds)
    avg_prob = float(np.mean(proba))

    results = []
    for i, (pred, prob) in enumerate(zip(preds, proba)):
        risk = 'high' if prob > 0.17 else 'medium' if prob > 0.12 else 'low'
        if i < 100:
            results.append({
                'row_id': i + 1,
                'churn_prediction': int(pred),
                'churn_probability': round(float(prob), 3),
                'risk_level': risk,
            })

    # Build CSV
    lines = [','.join(FEATURES + ['Churn_Probability', 'Churn_Prediction', 'Risk_Level'])]
    for i, (row, pred, prob) in enumerate(zip(rows, preds, proba)):
        risk = 'high' if prob > 0.17 else 'medium' if prob > 0.12 else 'low'
        vals = [str(row[f]) for f in FEATURES]
        vals += [f'{prob:.3f}', 'Churned' if pred == 1 else 'Retained', risk]
        lines.append(','.join(vals))
    csv_data = '\n'.join(lines)

    return {
        'total_customers': total,
        'summary': {
            'churn_count':        churn_count,
            'retention_count':    total - churn_count,
            'churn_rate':         round(churn_count / total, 3) if total else 0,
            'average_probability': round(avg_prob, 3),
        },
        'predictions': results,
        'csv_data': csv_data,
    }


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            if churn_model is None:
                raise RuntimeError('Model not loaded. Ensure model/churn_model.pkl is present.')
            payload = json.loads(body)
            customers = payload.get('customers', [])
            if not customers:
                raise ValueError('No customers provided.')
            result = process_batch(customers)
            self._respond(200, result)
        except Exception as e:
            self._respond(500, {'error': str(e)})

    def _respond(self, code: int, data: dict):
        payload = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self._cors()
        self.end_headers()
        self.wfile.write(payload)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, *args):
        pass
