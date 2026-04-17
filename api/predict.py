import os, json, sys
from http.server import BaseHTTPRequestHandler

BASE_DIR = os.path.join(os.path.dirname(__file__), '..')
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'churn_model.pkl')

# Define DataSanitizer before joblib loads the model
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

def rule_insights(data: dict, prob: float, risk: str) -> list:
    ins = []
    if data.get('daysincelastorder', 0) > 20:
        ins.append(f"Last order was {int(data['daysincelastorder'])} days ago — re-engagement campaign recommended.")
    if data.get('satisfactionscore', 5) <= 2:
        ins.append("Low satisfaction score — prioritize customer support outreach immediately.")
    if data.get('ordercount', 0) < 5:
        ins.append("Low order volume — targeted promotions may increase purchase frequency.")
    if data.get('cashbackamount', 0) < 15:
        ins.append("Low cashback earned — boosting loyalty rewards can improve retention.")
    if data.get('tenure', 0) < 6:
        ins.append("New customer — a strong onboarding experience reduces early churn risk.")
    if risk == 'high' and not ins:
        ins.append("Multiple risk signals detected — immediate retention intervention advised.")
    if risk == 'low' and not ins:
        ins.append("Customer shows strong retention indicators — maintain current engagement strategy.")
    return ins[:4]

def save_to_supabase(payload: dict) -> bool:
    supabase_url = os.getenv('SUPABASE_URL', '')
    service_key = os.getenv('SUPABASE_SERVICE_KEY', '')
    if not supabase_url or not service_key:
        return False
    try:
        import urllib.request
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            f"{supabase_url}/rest/v1/predictions",
            data=data,
            headers={
                'apikey': service_key,
                'Authorization': f'Bearer {service_key}',
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
            },
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status < 300
    except Exception:
        return False

def predict_one(data: dict) -> dict:
    row = {f: float(data.get(f, 0)) for f in FEATURES}
    df = pd.DataFrame([row])
    proba = churn_model['pipeline'].predict_proba(df)[0]
    prob = float(proba[1])
    threshold = float(churn_model.get('threshold', 0.17))
    prediction = 1 if prob >= threshold else 0
    risk = 'high' if prob > 0.17 else 'medium' if prob > 0.12 else 'low'
    insights = rule_insights(data, prob, risk)

    save_to_supabase({
        **{k: float(data.get(k, 0)) for k in FEATURES},
        'churn_prediction': prediction,
        'churn_probability': round(prob, 3),
        'insights': insights,
    })

    return {
        'churn_prediction': prediction,
        'churn_probability': round(prob, 3),
        'threshold_used': threshold,
        'risk_level': risk,
        'insights': insights,
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
            data = json.loads(body)
            result = predict_one(data)
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
